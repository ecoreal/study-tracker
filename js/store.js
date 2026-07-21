/**
 * Local-first data store with optional Gist sync hooks.
 */

const STORAGE_KEY = 'study-tracker:data';
const META_KEY = 'study-tracker:meta';

const DEFAULT_DATA = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 },
    subjects: ['雅思', '编程', '其他'],
    theme: 'system', // system | light | dark
    sound: true,
    autoStartNext: false, // 番茄结束后自动开始下一阶段
    dailyGoals: { focusMinutes: 120, focusCount: 4 },
  },
  tasks: [],
  logs: [],
  sessions: [],
  ielts: [],
});

/** @type {ReturnType<typeof DEFAULT_DATA>} */
let data = loadData();
/** @type {Set<(d: typeof data) => void>} */
const listeners = new Set();
/** @type {((d: typeof data) => void) | null} */
let onChangeHook = null;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return DEFAULT_DATA();
  }
}

function migrate(raw) {
  const base = DEFAULT_DATA();
  return {
    ...base,
    ...raw,
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      pomodoro: { ...base.settings.pomodoro, ...(raw.settings?.pomodoro || {}) },
      dailyGoals: {
        ...base.settings.dailyGoals,
        ...(raw.settings?.dailyGoals || {}),
      },
      subjects: Array.isArray(raw.settings?.subjects) && raw.settings.subjects.length
        ? raw.settings.subjects
        : base.settings.subjects,
    },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    ielts: Array.isArray(raw.ielts) ? raw.ielts : [],
    version: 1,
  };
}

function persist(emitSync = true) {
  data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  for (const fn of listeners) fn(data);
  if (emitSync && onChangeHook) onChangeHook(data);
}

export function getData() {
  return data;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setOnChangeHook(fn) {
  onChangeHook = fn;
}

export function replaceData(next, { emitSync = true } = {}) {
  data = migrate(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  for (const fn of listeners) fn(data);
  if (emitSync && onChangeHook) onChangeHook(data);
}

export function mergeRemote(remote) {
  if (!remote || typeof remote !== 'object') return { applied: false, reason: 'invalid' };
  const remoteTs = Date.parse(remote.updatedAt || 0) || 0;
  const localTs = Date.parse(data.updatedAt || 0) || 0;
  if (remoteTs > localTs) {
    replaceData(remote, { emitSync: false });
    return { applied: true, reason: 'remote-newer' };
  }
  return { applied: false, reason: 'local-newer-or-equal' };
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---- Tasks ---- */
export function addTask({ text, date = todayStr() }) {
  const task = {
    id: uid('t'),
    date,
    text: String(text || '').trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  if (!task.text) return null;
  data.tasks.unshift(task);
  persist();
  return task;
}

export function toggleTask(id) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  persist();
}

export function updateTask(id, patch) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  if (typeof t.text === 'string') t.text = t.text.trim();
  persist();
}

export function removeTask(id) {
  data.tasks = data.tasks.filter((x) => x.id !== id);
  persist();
}

export function rolloverOpenTasksToToday() {
  const today = todayStr();
  let n = 0;
  for (const t of data.tasks) {
    if (!t.done && t.date < today) {
      t.date = today;
      n += 1;
    }
  }
  if (n) persist();
  return n;
}

/* ---- Logs ---- */
export function addLog({ subject, content, minutes, date = todayStr() }) {
  const log = {
    id: uid('l'),
    date,
    subject: subject || '其他',
    content: String(content || '').trim(),
    minutes: Math.max(0, Number(minutes) || 0),
    createdAt: new Date().toISOString(),
  };
  if (!log.content && !log.minutes) return null;
  data.logs.unshift(log);
  persist();
  return log;
}

export function updateLog(id, patch) {
  const l = data.logs.find((x) => x.id === id);
  if (!l) return;
  Object.assign(l, patch);
  if (patch.minutes != null) l.minutes = Math.max(0, Number(patch.minutes) || 0);
  persist();
}

export function removeLog(id) {
  data.logs = data.logs.filter((x) => x.id !== id);
  persist();
}

/* ---- Sessions (pomodoro) ---- */
export function addSession({ type, minutes, taskId = null, date = todayStr() }) {
  const session = {
    id: uid('s'),
    date,
    type, // focus | short | long
    minutes: Math.max(0, Number(minutes) || 0),
    taskId,
    endedAt: new Date().toISOString(),
  };
  data.sessions.unshift(session);
  persist();
  return session;
}

/* ---- IELTS ---- */
export function addIelts(entry) {
  const item = {
    id: uid('i'),
    date: entry.date || todayStr(),
    paper: String(entry.paper || '').trim(),
    mode: entry.mode || 'full',
    listening: toBand(entry.listening),
    reading: toBand(entry.reading),
    writing: toBand(entry.writing),
    speaking: toBand(entry.speaking),
    overall: entry.overall != null && entry.overall !== '' ? toBand(entry.overall) : null,
    notes: String(entry.notes || '').trim(),
    createdAt: new Date().toISOString(),
  };
  data.ielts.unshift(item);
  persist();
  return item;
}

export function updateIelts(id, patch) {
  const item = data.ielts.find((x) => x.id === id);
  if (!item) return;
  Object.assign(item, patch);
  for (const k of ['listening', 'reading', 'writing', 'speaking', 'overall']) {
    if (patch[k] !== undefined) {
      item[k] = patch[k] === '' || patch[k] == null ? null : toBand(patch[k]);
    }
  }
  persist();
}

export function removeIelts(id) {
  data.ielts = data.ielts.filter((x) => x.id !== id);
  persist();
}

function toBand(v) {
  if (v === '' || v == null || Number.isNaN(Number(v))) return null;
  let n = Math.round(Number(v) * 2) / 2;
  n = Math.min(9, Math.max(0, n));
  return n;
}

/* ---- Settings ---- */
export function updateSettings(patch) {
  data.settings = {
    ...data.settings,
    ...patch,
    pomodoro: { ...data.settings.pomodoro, ...(patch.pomodoro || {}) },
    dailyGoals: { ...data.settings.dailyGoals, ...(patch.dailyGoals || {}) },
  };
  if (patch.subjects) data.settings.subjects = [...patch.subjects];
  persist();
}

/* ---- Meta (PAT / gistId — never synced into study-data.json content identity beyond local) ---- */
export function getMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setMeta(patch) {
  const next = { ...getMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

export function clearMeta() {
  localStorage.removeItem(META_KEY);
}

export function exportJson() {
  return JSON.stringify(data, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('无效的 JSON');
  replaceData(parsed, { emitSync: true });
}

export function clearAllLocalData() {
  data = DEFAULT_DATA();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  for (const fn of listeners) fn(data);
  if (onChangeHook) onChangeHook(data);
}
