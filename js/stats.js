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

function isActiveDay(data, date) {
  if (data.logs.some((l) => l.date === date)) return true;
  if (data.sessions.some((s) => s.date === date && s.type === 'focus')) return true;
  if (data.ielts.some((i) => i.date === date)) return true;
  if (data.tasks.some((t) => t.date === date && t.done)) return true;
  return false;
}

/** Consecutive study days ending today or yesterday (if not yet studied today). */
export function streakDays(data) {
  let cursor = parseDay(todayStr());
  if (!isActiveDay(data, dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (isActiveDay(data, dayKey(cursor))) {
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
  const result = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const key = dayKey(d);
    const minutes = data.sessions
      .filter((s) => s.date === key && s.type === 'focus')
      .reduce((a, s) => a + (s.minutes || 0), 0);
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
  const logs = data.logs.filter((l) => l.date.startsWith(prefix));
  const ielts = data.ielts.filter((i) => i.date.startsWith(prefix));
  return {
    focusCount: focusSessions.length,
    focusMinutes: focusSessions.reduce((a, s) => a + (s.minutes || 0), 0),
    logCount: logs.length,
    ieltsCount: ielts.length,
  };
}

/** Last `weeks` weeks of activity intensity 0–4 for heatmap (Mon-start or Sun-start). */
export function heatmap(data, weeks = 12, end = new Date()) {
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
    const focusMin = data.sessions
      .filter((s) => s.date === key && s.type === 'focus')
      .reduce((a, s) => a + (s.minutes || 0), 0);
    const logMin = data.logs
      .filter((l) => l.date === key)
      .reduce((a, l) => a + (l.minutes || 0), 0);
    const score = focusMin + logMin + (data.ielts.some((x) => x.date === key) ? 30 : 0);
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
  const set = new Set();
  for (const l of data.logs) set.add(l.date);
  for (const s of data.sessions) if (s.type === 'focus') set.add(s.date);
  for (const i of data.ielts) set.add(i.date);
  return set;
}
