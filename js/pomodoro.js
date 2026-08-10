/**
 * Pomodoro state machine (no UI).
 */

import { getData, addSession, todayStr } from './store.js';

const MODE_LABELS = {
  focus: '专注',
  short: '短休息',
  long: '长休息',
};

const STATE_KEY = 'study-tracker:pomodoro';
const MAX_DURATION_MS = 180 * 60 * 1000;
let expiredOnLoad = false;

/** @type {{
 *  mode: 'focus'|'short'|'long',
 *  running: boolean,
 *  remainingMs: number,
 *  totalMs: number,
 *  focusCount: number,
 *  taskId: string|null,
 *  endsAt: number|null,
 *  cycleDate: string,
 * }} */
let state = loadState();

/** @type {Set<(s: typeof state) => void>} */
const listeners = new Set();
let tickTimer = null;
/** @type {((session: object) => void) | null} */
let onComplete = null;

function settings() {
  return getData().settings.pomodoro;
}

function durationMs(mode) {
  const p = settings();
  if (mode === 'focus') return p.focus * 60 * 1000;
  if (mode === 'short') return p.shortBreak * 60 * 1000;
  return p.longBreak * 60 * 1000;
}

function freshState() {
  const totalMs = durationMs('focus');
  return {
    mode: 'focus',
    running: false,
    remainingMs: totalMs,
    totalMs,
    focusCount: 0,
    taskId: null,
    endsAt: null,
    cycleDate: todayStr(),
  };
}

function loadState() {
  const fallback = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return fallback;
    const mode = ['focus', 'short', 'long'].includes(saved.mode) ? saved.mode : 'focus';
    const totalMs = clampMs(saved.totalMs, durationMs(mode));
    const running = Boolean(saved.running && Number.isFinite(Number(saved.endsAt)));
    const endsAt = running ? Number(saved.endsAt) : null;
    const remainingMs = running
      ? Math.max(0, endsAt - Date.now())
      : Math.min(totalMs, Math.max(0, Number(saved.remainingMs) || totalMs));
    if (running && remainingMs === 0) expiredOnLoad = true;
    const sameDay = saved.cycleDate === todayStr();
    return {
      mode,
      running,
      remainingMs,
      totalMs,
      focusCount: sameDay || running ? Math.max(0, Math.round(Number(saved.focusCount) || 0)) : 0,
      taskId: typeof saved.taskId === 'string' && saved.taskId ? saved.taskId : null,
      endsAt,
      cycleDate: sameDay || running ? (saved.cycleDate || todayStr()) : todayStr(),
    };
  } catch {
    return fallback;
  }
}

function clampMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DURATION_MS, Math.max(60 * 1000, Math.round(n)));
}

function persistState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch { /* localStorage may be unavailable */ }
}

function ensureCycleDate() {
  const today = todayStr();
  if (state.cycleDate === today) return;
  state.cycleDate = today;
  state.focusCount = 0;
}

function emit() {
  for (const fn of listeners) fn(getState());
}

export function getState() {
  return { ...state, modeLabel: MODE_LABELS[state.mode] };
}

export function subscribePomodoro(fn) {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
}

export function setOnComplete(fn) {
  onComplete = fn;
}

export function setTaskId(taskId) {
  state.taskId = taskId || null;
  persistState();
  emit();
}

export function setMode(mode, { reset = true } = {}) {
  if (!['focus', 'short', 'long'].includes(mode)) return;
  stopTick();
  state.mode = mode;
  state.running = false;
  state.endsAt = null;
  if (reset) {
    state.totalMs = durationMs(mode);
    state.remainingMs = state.totalMs;
  }
  persistState();
  emit();
  updateTitle();
}

export function reloadDurationsIfIdle() {
  if (state.running) return;
  state.totalMs = durationMs(state.mode);
  state.remainingMs = state.totalMs;
  persistState();
  emit();
  updateTitle();
}

/** Set only the current round duration (minutes), without changing saved defaults. */
export function setCustomDuration(minutes) {
  if (state.running) return false;
  const m = Math.min(180, Math.max(1, Math.round(Number(minutes) || 1)));
  state.totalMs = m * 60 * 1000;
  state.remainingMs = state.totalMs;
  state.endsAt = null;
  persistState();
  emit();
  updateTitle();
  return true;
}

export function start() {
  if (state.running) return;
  ensureCycleDate();
  if (state.remainingMs <= 0) {
    state.remainingMs = durationMs(state.mode);
    state.totalMs = state.remainingMs;
  }
  state.running = true;
  state.endsAt = Date.now() + state.remainingMs;
  persistState();
  startTick();
  emit();
  requestNotifyPermission();
}

export function pause() {
  if (!state.running) return;
  syncRemaining();
  state.running = false;
  state.endsAt = null;
  stopTick();
  persistState();
  emit();
  updateTitle();
}

export function toggle() {
  if (state.running) pause();
  else start();
}

export function reset() {
  stopTick();
  state.running = false;
  state.endsAt = null;
  state.totalMs = durationMs(state.mode);
  state.remainingMs = state.totalMs;
  persistState();
  emit();
  updateTitle();
}

export function clearState() {
  stopTick();
  state = freshState();
  persistState();
  emit();
  updateTitle(true);
}

export function skip() {
  completeCurrent({ skipped: true });
}

function syncRemaining() {
  if (state.running && state.endsAt) {
    state.remainingMs = Math.max(0, state.endsAt - Date.now());
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    syncRemaining();
    if (state.remainingMs <= 0) {
      completeCurrent({ skipped: false });
      return;
    }
    emit();
    updateTitle();
  }, 250);
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function completeCurrent({ skipped }) {
  stopTick();
  const plannedMin = Math.round(state.totalMs / 60000);
  const elapsedMin = Math.max(
    0,
    Math.round((state.totalMs - Math.max(0, state.remainingMs)) / 60000),
  );
  const minutes = skipped ? elapsedMin : plannedMin;
  const type = state.mode === 'focus' ? 'focus' : state.mode === 'short' ? 'short' : 'long';

  let session = null;
  if (!skipped || elapsedMin >= 1) {
    // Only record meaningful sessions; full complete always records
    if (!skipped || state.mode === 'focus') {
      session = addSession({
        type,
        minutes: skipped ? elapsedMin : plannedMin,
        taskId: state.taskId,
        date: todayStr(),
      });
    }
  }

  if (state.mode === 'focus' && !skipped) {
    state.focusCount += 1;
  }

  notifyDone(state.mode);

  // Auto switch mode
  let next = 'focus';
  if (state.mode === 'focus') {
    const every = settings().longEvery || 4;
    next = state.focusCount > 0 && state.focusCount % every === 0 ? 'long' : 'short';
  } else {
    next = 'focus';
  }

  state.running = false;
  state.endsAt = null;
  state.mode = next;
  state.totalMs = durationMs(next);
  state.remainingMs = state.totalMs;
  state.cycleDate = todayStr();
  persistState();
  emit();
  updateTitle(true);

  if (onComplete) onComplete({ session, skipped, minutes, type, nextMode: next });

  // Optional auto-start next phase (not after manual skip)
  if (!skipped && getData().settings.autoStartNext) {
    setTimeout(() => {
      if (!state.running && state.remainingMs === state.totalMs) start();
    }, 600);
  }
}

function updateTitle(reset = false) {
  if (reset || !state.running) {
    if (document.title.startsWith('(') || document.title.includes('· Study')) {
      document.title = 'Study Tracker · 学习面板';
    }
    return;
  }
  const m = Math.floor(state.remainingMs / 60000);
  const s = Math.floor((state.remainingMs % 60000) / 1000);
  const t = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  document.title = `(${t}) ${MODE_LABELS[state.mode]} · Study Tracker`;
}

function requestNotifyPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyDone(mode) {
  const label = MODE_LABELS[mode] || mode;
  const body = mode === 'focus' ? '专注时间结束，休息一下吧！' : '休息结束，准备下一轮专注。';

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`${label}结束`, { body, silent: false });
    } catch { /* ignore */ }
  }

  if (getData().settings.sound !== false) {
    playBeep();
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.frequency.value = 660;
    }, 120);
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 320);
  } catch { /* ignore */ }
}

export function formatMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

if (expiredOnLoad) {
  queueMicrotask(() => completeCurrent({ skipped: false }));
} else if (state.running) {
  startTick();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistState);
}
