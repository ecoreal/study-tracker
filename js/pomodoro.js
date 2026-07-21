/**
 * Pomodoro state machine (no UI).
 */

import { getData, addSession, todayStr } from './store.js';

const MODE_LABELS = {
  focus: '专注',
  short: '短休息',
  long: '长休息',
};

/** @type {{
 *  mode: 'focus'|'short'|'long',
 *  running: boolean,
 *  remainingMs: number,
 *  totalMs: number,
 *  focusCount: number,
 *  taskId: string|null,
 *  endsAt: number|null,
 * }} */
let state = {
  mode: 'focus',
  running: false,
  remainingMs: 25 * 60 * 1000,
  totalMs: 25 * 60 * 1000,
  focusCount: 0,
  taskId: null,
  endsAt: null,
};

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
  emit();
  updateTitle();
}

export function reloadDurationsIfIdle() {
  if (state.running) return;
  state.totalMs = durationMs(state.mode);
  state.remainingMs = state.totalMs;
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
  emit();
  updateTitle();
  return true;
}

export function start() {
  if (state.remainingMs <= 0) {
    state.remainingMs = durationMs(state.mode);
    state.totalMs = state.remainingMs;
  }
  state.running = true;
  state.endsAt = Date.now() + state.remainingMs;
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
  emit();
  updateTitle();
}

export function reset() {
  stopTick();
  state.running = false;
  state.endsAt = null;
  state.totalMs = durationMs(state.mode);
  state.remainingMs = state.totalMs;
  emit();
  updateTitle();
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
    1,
    Math.round((state.totalMs - Math.max(0, state.remainingMs)) / 60000),
  );
  const minutes = skipped ? Math.max(1, elapsedMin) : plannedMin;
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
  emit();
  updateTitle(true);

  if (onComplete) onComplete({ session, skipped, minutes, type });
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

// Init duration from settings
state.totalMs = durationMs('focus');
state.remainingMs = state.totalMs;
