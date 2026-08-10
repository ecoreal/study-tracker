/**
 * Local-first data store with optional Gist sync hooks.
 */

const STORAGE_KEY = 'study-tracker:data';
const META_KEY = 'study-tracker:meta';

const DEFAULT_DATA = () => ({
  version: 2,
  updatedAt: new Date().toISOString(),
  settings: {
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 },
    subjects: ['雅思', '编程', '其他'],
    theme: 'system', // system | light | dark
    fontScale: 'normal', // small | normal | large
    density: 'normal', // compact | normal | roomy
    accent: 'teal', // teal | blue | violet | rose | amber | green
    sound: true,
    autoStartNext: false, // 番茄结束后自动开始下一阶段
    dailyGoals: { focusMinutes: 120, focusCount: 4 },
    ieltsGoals: { listening: null, reading: null, overall: null },
    review: { dailyNewLimit: 20, wordMode: 'recognition' },
  },
  tasks: [],
  sessions: [],
  ielts: [],
  vocabulary: [],
  reviewLogs: [],
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
      ieltsGoals: {
        ...base.settings.ieltsGoals,
        ...(raw.settings?.ieltsGoals || {}),
      },
      review: {
        ...base.settings.review,
        ...(raw.settings?.review || {}),
      },
      subjects: Array.isArray(raw.settings?.subjects) && raw.settings.subjects.length
        ? raw.settings.subjects
        : base.settings.subjects,
    },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    ielts: Array.isArray(raw.ielts)
      ? raw.ielts.map((entry) => normalizeIelts(entry, { ensureIds: true }))
      : [],
    vocabulary: Array.isArray(raw.vocabulary)
      ? raw.vocabulary.map((entry) => normalizeVocabularyEntry(entry)).filter(Boolean)
      : [],
    reviewLogs: Array.isArray(raw.reviewLogs)
      ? raw.reviewLogs.map(normalizeReviewLog).filter(Boolean).slice(0, 5000)
      : [],
    version: 2,
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

/**
 * 跨标签页实时同步：当其他标签页写入 localStorage 时，
 * 重新从 localStorage 加载最新数据并通知所有订阅者（本标签不写回，避免回环）。
 */
if (typeof window !== 'undefined' && 'addEventListener' in window) {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    try {
      data = migrate(JSON.parse(e.newValue));
      for (const fn of listeners) fn(data);
    } catch { /* ignore malformed cross-tab writes */ }
  });
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
  // ensureIds: mistakes need stable ids so错题本 can edit/delete them later
  const normalized = normalizeIelts(entry, { ensureIds: true });
  const item = {
    id: uid('i'),
    date: normalized.date || todayStr(),
    paper: normalized.paper,
    mode: normalized.mode,
    listening: normalized.listening,
    reading: normalized.reading,
    writing: normalized.writing,
    speaking: normalized.speaking,
    overall: normalized.overall,
    notes: normalized.notes,
    createdAt: new Date().toISOString(),
  };
  data.ielts.unshift(item);
  persist();
  return item;
}

export function updateIelts(id, patch) {
  const item = data.ielts.find((x) => x.id === id);
  if (!item) return;
  const next = normalizeIelts({ ...item, ...patch });
  next.id = item.id;
  next.createdAt = item.createdAt;
  const idx = data.ielts.findIndex((x) => x.id === id);
  if (idx >= 0) data.ielts[idx] = next;
  persist();
}

export function removeIelts(id) {
  data.ielts = data.ielts.filter((x) => x.id !== id);
  persist();
}

/** Merge imported words by normalized spelling so repeated iDictation exports stay idempotent. */
export function upsertVocabulary(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const byWord = new Map(data.vocabulary.map((item) => [wordKey(item.word), item]));
  const result = { added: 0, updated: 0, skipped: 0, total: 0 };

  for (const raw of rows) {
    const next = normalizeVocabularyEntry(raw);
    if (!next) {
      result.skipped += 1;
      continue;
    }
    result.total += 1;
    const key = wordKey(next.word);
    const current = byWord.get(key);
    if (!current) {
      data.vocabulary.push(next);
      byWord.set(key, next);
      result.added += 1;
      continue;
    }
    const before = JSON.stringify(current);
    for (const field of ['definition', 'phonetic', 'example', 'exampleTranslation', 'related', 'source', 'chapter', 'errorSpelling']) {
      if (!current[field] && next[field]) current[field] = next[field];
    }
    current.errorCount = Math.max(Number(current.errorCount) || 0, Number(next.errorCount) || 0);
    if (JSON.stringify(current) === before) result.skipped += 1;
    else {
      current.updatedAt = new Date().toISOString();
      result.updated += 1;
    }
  }

  if (result.added || result.updated) persist();
  return result;
}

export function addVocabulary(entry) {
  const result = upsertVocabulary([entry]);
  if (!result.added) return data.vocabulary.find((item) => wordKey(item.word) === wordKey(entry?.word)) || null;
  return data.vocabulary[data.vocabulary.length - 1] || null;
}

export function updateVocabulary(id, patch) {
  const idx = data.vocabulary.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  const next = normalizeVocabularyEntry({ ...data.vocabulary[idx], ...patch, id });
  if (!next) return null;
  data.vocabulary[idx] = next;
  persist();
  return next;
}

export function removeVocabulary(id) {
  const before = data.vocabulary.length;
  data.vocabulary = data.vocabulary.filter((item) => item.id !== id);
  if (data.vocabulary.length !== before) persist();
}

/** Import normalized listening/reading mistakes without duplicating a previous export. */
export function importIeltsMistakes(records) {
  const rows = Array.isArray(records) ? records : [];
  const result = { added: 0, updated: 0, skipped: 0, total: 0 };
  let changed = false;

  for (const record of rows) {
    const subject = record?.subject === 'listening' ? 'listening' : 'reading';
    const paper = String(record?.paper || 'iDictation 导入').trim();
    let item = data.ielts.find((entry) => String(entry.paper || '').trim() === paper);
    if (!item) {
      item = {
        id: uid('i'),
        date: validDate(record?.date) || todayStr(),
        paper,
        mode: subject,
        listening: null,
        reading: null,
        writing: null,
        speaking: null,
        overall: null,
        notes: '由 iDictation / 外部文件导入',
        createdAt: new Date().toISOString(),
      };
      data.ielts.unshift(item);
      changed = true;
    }

    const oldSection = item[subject];
    const section = oldSection && typeof oldSection === 'object'
      ? oldSection
      : {
          band: toBand(oldSection),
          correctRate: 0,
          mistakes: [],
        };
    if (!Array.isArray(section.mistakes)) section.mistakes = [];

    const next = normalizeMistakeLocal({
      ...record,
      id: record.id || uid('m'),
      source: record.source || 'iDictation',
      createdAt: record.createdAt || new Date().toISOString(),
    });
    if (!next || mistakeIsEmptyLocal(next)) {
      result.skipped += 1;
      continue;
    }
    result.total += 1;
    const signature = mistakeImportKey(next);
    const existingIndex = section.mistakes.findIndex((mistake) => {
      const normalized = normalizeMistakeLocal(mistake);
      return normalized && mistakeImportKey(normalized) === signature;
    });
    if (existingIndex < 0) {
      section.mistakes.push(next);
      result.added += 1;
      changed = true;
    } else {
      const current = normalizeMistakeLocal(section.mistakes[existingIndex]);
      const merged = {
        ...current,
        ...next,
        id: current.id || next.id,
        review: current.review || next.review,
        createdAt: current.createdAt || next.createdAt,
      };
      if (JSON.stringify(current) === JSON.stringify(merged)) result.skipped += 1;
      else {
        section.mistakes[existingIndex] = merged;
        result.updated += 1;
        changed = true;
      }
    }
    item[subject] = section;
  }

  if (changed) persist();
  return result;
}

/** Store the card generated by ts-fsrs on either a word or a nested IELTS mistake. */
export function applyReviewResult({ kind, id, card, rating, reviewedAt, wasNew = false }) {
  const normalizedCard = normalizeReviewCard(card);
  if (!normalizedCard) return false;
  let found = false;
  if (kind === 'word') {
    const word = data.vocabulary.find((item) => item.id === id);
    if (word) {
      word.review = normalizedCard;
      word.updatedAt = new Date().toISOString();
      found = true;
    }
  } else if (kind === 'mistake') {
    for (const entry of data.ielts) {
      for (const subject of ['listening', 'reading']) {
        const mistakes = entry[subject] && typeof entry[subject] === 'object'
          ? entry[subject].mistakes
          : null;
        if (!Array.isArray(mistakes)) continue;
        const mistake = mistakes.find((item) => item && item.id === id);
        if (mistake) {
          mistake.review = normalizedCard;
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  if (!found) return false;

  data.reviewLogs.unshift({
    id: uid('r'),
    kind,
    itemId: id,
    rating: Math.min(4, Math.max(1, Number(rating) || 1)),
    reviewedAt: reviewedAt || new Date().toISOString(),
    nextDue: normalizedCard.due,
    wasNew: Boolean(wasNew),
  });
  data.reviewLogs = data.reviewLogs.slice(0, 5000);
  persist();
  return true;
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
    ieltsGoals: { ...(data.settings.ieltsGoals || {}), ...(patch.ieltsGoals || {}) },
    review: { ...(data.settings.review || {}), ...(patch.review || {}) },
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
}

export function normalizeIelts(entry, { ensureIds = true } = {}) {
  const next = { ...(entry || {}) };
  if (next.paper != null) next.paper = String(next.paper).trim();
  if (next.mode != null) next.mode = String(next.mode);
  if (next.notes != null) next.notes = String(next.notes).trim();
  if (next.date == null) next.date = todayStr();
  for (const k of ['listening', 'reading']) {
    next[k] = normalizeIeltsSection(next[k], ensureIds);
  }
  for (const k of ['writing', 'speaking', 'overall']) {
    if (next[k] !== undefined) next[k] = toBand(next[k]);
  }
  return next;
}

function normalizeIeltsSection(value, ensureIds) {
  if (value == null || value === '') return null;
  // legacy: plain score number / string becomes band
  if (typeof value === 'number' || typeof value === 'string') return toBand(value);
  if (typeof value !== 'object') return null;
  const out = {
    band: value.band != null ? toBand(value.band) : (value.score != null ? toBand(value.score) : null),
    correctRate: value.correctRate != null ? clamp01(value.correctRate) : null,
    mistakes: Array.isArray(value.mistakes)
      ? value.mistakes
          .map((m) => normalizeMistakeLocal(m))
          .filter((m) => m != null && !mistakeIsEmptyLocal(m))
          .map((m) => {
            if (ensureIds && !m.id) m.id = uid();
            if (!m.createdAt) m.createdAt = new Date().toISOString();
            return m;
          })
      : [],
    partStats: normalizePartStatsLocal(value.partStats),
  };
  if (out.correctRate == null) out.correctRate = 0;
  if (out.partStats == null) delete out.partStats;
  const hasStats = out.partStats != null && Object.keys(out.partStats).length > 0;
  if (out.band == null && out.mistakes.length === 0 && !hasStats) return out.correctRate > 0 ? out : null;
  return out;
}

function normalizeMistakeLocal(m) {
  const validPart = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 4) return null;
    return n;
  };
  if (typeof m === 'string') {
    const ans = m.trim();
    if (!ans) return null;
    return {
      id: '', part: null, ans, orig: '', sub: '', reason: '', tag: '', note: '',
      question: '', userAnswer: '', correctAnswer: '', externalRef: '', source: '',
      review: null, createdAt: '',
    };
  }
  if (m == null || typeof m !== 'object') return null;
  return {
    id: m.id || '',
    part: validPart(m.part),
    ans: String(m.ans ?? m.text ?? '').trim(),
    orig: String(m.orig ?? '').trim(),
    sub: String(m.sub ?? '').trim(),
    reason: String(m.reason ?? '').trim(),
    tag: String(m.tag ?? '').trim(),
    note: String(m.note ?? '').trim(),
    question: String(m.question ?? '').trim(),
    userAnswer: String(m.userAnswer ?? '').trim(),
    correctAnswer: String(m.correctAnswer ?? '').trim(),
    externalRef: String(m.externalRef ?? '').trim(),
    source: String(m.source ?? '').trim(),
    review: normalizeReviewCard(m.review),
    createdAt: m.createdAt || '',
  };
}

function mistakeIsEmptyLocal(m) {
  return (
    String(m.ans || '').trim() === '' &&
    String(m.orig || '').trim() === '' &&
    String(m.sub || '').trim() === '' &&
    String(m.reason || '').trim() === '' &&
    String(m.question || '').trim() === '' &&
    String(m.correctAnswer || '').trim() === ''
  );
}

export function normalizeVocabularyEntry(raw) {
  if (raw == null) return null;
  const item = typeof raw === 'string' ? { word: raw } : raw;
  if (typeof item !== 'object') return null;
  const word = String(item.word ?? '').trim();
  if (!word) return null;
  const now = new Date().toISOString();
  return {
    id: item.id || uid('w'),
    word,
    definition: String(item.definition ?? '').trim(),
    phonetic: String(item.phonetic ?? '').trim(),
    example: String(item.example ?? '').trim(),
    exampleTranslation: String(item.exampleTranslation ?? '').trim(),
    related: String(item.related ?? '').trim(),
    source: String(item.source ?? '').trim(),
    chapter: String(item.chapter ?? '').trim(),
    errorCount: Math.max(0, Math.round(Number(item.errorCount) || 0)),
    errorSpelling: String(item.errorSpelling ?? '').trim(),
    review: normalizeReviewCard(item.review),
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  };
}

export function normalizeReviewCard(card) {
  if (!card || typeof card !== 'object') return null;
  const due = validIso(card.due);
  if (!due) return null;
  const lastReview = validIso(card.last_review ?? card.lastReview);
  const normalized = {
    due,
    stability: Math.max(0, Number(card.stability) || 0),
    difficulty: Math.max(0, Number(card.difficulty) || 0),
    elapsed_days: Math.max(0, Number(card.elapsed_days) || 0),
    scheduled_days: Math.max(0, Number(card.scheduled_days) || 0),
    learning_steps: Math.max(0, Number(card.learning_steps) || 0),
    reps: Math.max(0, Math.round(Number(card.reps) || 0)),
    lapses: Math.max(0, Math.round(Number(card.lapses) || 0)),
    state: Math.min(3, Math.max(0, Math.round(Number(card.state) || 0))),
  };
  if (lastReview) normalized.last_review = lastReview;
  return normalized;
}

function normalizeReviewLog(log) {
  if (!log || typeof log !== 'object') return null;
  const reviewedAt = validIso(log.reviewedAt);
  if (!reviewedAt || !['word', 'mistake'].includes(log.kind)) return null;
  return {
    id: log.id || uid('r'),
    kind: log.kind,
    itemId: String(log.itemId || ''),
    rating: Math.min(4, Math.max(1, Number(log.rating) || 1)),
    reviewedAt,
    nextDue: validIso(log.nextDue) || reviewedAt,
    wasNew: Boolean(log.wasNew),
  };
}

function mistakeImportKey(mistake) {
  if (mistake.externalRef) return `${mistake.source}|${mistake.externalRef}`.toLowerCase();
  return [mistake.source, mistake.part, mistake.question, mistake.correctAnswer, mistake.ans]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

function wordKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function validIso(value) {
  if (value == null || value === '') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function validDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizePartStatsLocal(partStats) {
  if (partStats == null || typeof partStats !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(partStats)) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 1 || idx > 4) continue;
    if (v == null || typeof v !== 'object') continue;
    const total = Math.max(0, Math.round(Number(v.total) || 0));
    const correct = Math.max(0, Math.min(total, Math.round(Number(v.correct) || 0)));
    if (total > 0) out[String(idx)] = { total, correct };
  }
  return Object.keys(out).length ? out : null;
}

function clamp01(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  // accept 0-1 or 0-100 input, store as 0-1
  return n > 1 ? Math.min(100, n) / 100 : Math.min(1, Math.max(0, n));
}
