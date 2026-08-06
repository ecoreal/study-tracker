/**
 * Aggregation helpers for dashboard & stats view.
 */

import { todayStr } from './store.js';

function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayKey(d) {
  return todayStr(d);
}

/**
 * Build date-keyed indexes once, so the many per-day loops in the
 * views (heatmap, week bars, month summary, streak) avoid rescanning
 * the full arrays for every date.  All helpers below accept the indexes
 * (or build them lazily from `data`).
 */
export function buildIndexes(data) {
  const focusByDay = new Map();   // date -> minutes (focus sessions only)
  const activeByDay = new Map();  // date -> true (any activity incl. ielts/tasks)
  const ieltsDates = new Set(data.ielts.map((i) => i.date));

  for (const s of data.sessions) {
    if (s.type !== 'focus' || !s.date) continue;
    focusByDay.set(s.date, (focusByDay.get(s.date) || 0) + (s.minutes || 0));
  }
  for (const t of data.tasks) {
    if (t.done && t.date) activeByDay.set(t.date, true);
  }
  for (const d of focusByDay.keys()) activeByDay.set(d, true);
  for (const d of ieltsDates) activeByDay.set(d, true);

  return { focusByDay, activeByDay, ieltsDates };
}

function isActiveDay(data, date) {
  const idx = buildIndexes(data);
  return idx.activeByDay.has(date);
}

/** Consecutive study days ending today or yesterday (if not yet studied today). */
export function streakDays(data) {
  const idx = buildIndexes(data);
  const activeByDay = idx.activeByDay;
  let cursor = parseDay(todayStr());
  if (!activeByDay.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (activeByDay.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function todayFocusStats(data, date = todayStr()) {
  const sessions = data.sessions.filter((s) => s.date === date && s.type === 'focus');
  const minutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  return { count: sessions.length, minutes };
}

export function todayTasksStats(data, date = todayStr()) {
  const tasks = data.tasks.filter((t) => t.date === date);
  const done = tasks.filter((t) => t.done).length;
  return { total: tasks.length, done, rate: tasks.length ? done / tasks.length : 0 };
}

export function weekFocusMinutes(data, end = new Date()) {
  const idx = buildIndexes(data);
  const result = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const key = dayKey(d);
    const minutes = idx.focusByDay.get(key) || 0;
    const labels = ['日', '一', '二', '三', '四', '五', '六'];
    result.push({ date: key, label: labels[d.getDay()], minutes });
  }
  return result;
}

export function monthSummary(data, ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const focusSessions = data.sessions.filter((s) => s.date.startsWith(prefix) && s.type === 'focus');
  const ielts = data.ielts.filter((i) => i.date.startsWith(prefix));
  return {
    focusCount: focusSessions.length,
    focusMinutes: focusSessions.reduce((a, s) => a + (s.minutes || 0), 0),
    ieltsCount: ielts.length,
  };
}

/** Last `weeks` weeks of activity intensity 0–4 for heatmap (Mon-start or Sun-start). */
export function heatmap(data, weeks = 12, end = new Date()) {
  const idx = buildIndexes(data);
  const cells = [];
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  // Align to end of week (Saturday if we use Sun-start rows like GitHub: Sun=0)
  const totalDays = weeks * 7;
  const start = new Date(endDay);
  start.setDate(start.getDate() - (totalDays - 1));
  // Shift start back to Sunday
  start.setDate(start.getDate() - start.getDay());

  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const focusMin = idx.focusByDay.get(key) || 0;
    const score = focusMin + (idx.ieltsDates.has(key) ? 30 : 0);
    let level = 0;
    if (score > 0) level = 1;
    if (score >= 30) level = 2;
    if (score >= 60) level = 3;
    if (score >= 120) level = 4;
    const future = d > endDay;
    cells.push({ date: key, level: future ? 0 : level, future });
  }
  return cells;
}

export function activityDates(data) {
  return buildIndexes(data).activeByDay;
}
