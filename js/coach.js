/**
 * Local-first study coach.
 * Turns the existing task/session records into a small, explainable next-step
 * recommendation. No study content leaves the browser.
 */

import { todayStr } from './store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPONENT_LABELS = {
  listening: '听力',
  reading: '阅读',
  writing: '写作',
  speaking: '口语',
};

export function buildCoachPlan(data, now = new Date()) {
  const today = todayStr(now);
  const todayTasks = data.tasks.filter((task) => task.date === today);
  const overdueTasks = data.tasks.filter((task) => !task.done && task.date < today);
  const openTasks = todayTasks.filter((task) => !task.done);
  const focusToday = data.sessions
    .filter((session) => session.date === today && session.type === 'focus')
    .reduce((sum, session) => sum + safeMinutes(session.minutes), 0);
  const focusCount = data.sessions.filter(
    (session) => session.date === today && session.type === 'focus',
  ).length;
  const goals = data.settings.dailyGoals || {};
  const goalMinutes = Math.max(1, Number(goals.focusMinutes) || 120);
  const goalCount = Math.max(1, Number(goals.focusCount) || 4);
  const recentAverage = averageFocusMinutes(data, now, 14);
  const completionRate = recentTaskCompletion(data, now, 14);
  const taskMinutes = focusMinutesByTask(data);
  const rankedTasks = [...openTasks].sort((a, b) => scoreTask(b, today, taskMinutes) - scoreTask(a, today, taskMinutes));
  const nextTask = rankedTasks[0] || null;
  const weakestIelts = weakestIeltsSkill(data);
  const remainingMinutes = Math.max(0, goalMinutes - focusToday);
  const remainingCount = Math.max(0, goalCount - focusCount);
  const suggestedRound = suggestRound({ remainingMinutes, recentAverage, nextTask, taskMinutes });

  let headline = '先做一个最小可行动作';
  let detail = '把想学的内容写成一个 25 分钟内能完成的任务，开始比规划更重要。';
  let action = 'tasks';
  let actionLabel = '添加任务';
  let actionTask = null;

  if (overdueTasks.length) {
    headline = `有 ${overdueTasks.length} 项任务需要重新安排`;
    detail = '先把逾期项带回今天，再逐项确认是否继续，避免旧计划被遗忘。';
    action = 'rollover';
    actionLabel = '整理到今天';
  } else if (nextTask) {
    headline = `下一步：${nextTask.text}`;
    detail = `${suggestedRound} 分钟专注 · ${taskMinutes[nextTask.id] ? `已累计 ${taskMinutes[nextTask.id]} 分钟` : '还没有专注记录'}`;
    action = 'start';
    actionLabel = `开始 ${suggestedRound} 分钟`;
    actionTask = nextTask;
  } else if (!todayTasks.length && focusToday === 0) {
    headline = '先明确一个 25 分钟可完成的结果';
    detail = '写下具体产出，例如“完成听力 Section 1 并订正”，再开始计时。';
    action = 'tasks';
    actionLabel = '添加第一个任务';
  } else if (remainingMinutes > 0) {
    headline = `还差 ${remainingMinutes} 分钟达到今日目标`;
    detail = `建议再完成 ${Math.min(remainingCount || 1, 2)} 轮专注，结束后再决定是否加量。`;
    action = 'timer';
    actionLabel = `开始 ${suggestedRound} 分钟`;
  } else {
    headline = '今日目标已完成，保护学习节奏';
    detail = '可以记录一次复盘，或者提前准备明天的第一个任务，不必为了数字继续堆时长。';
    action = 'stats';
    actionLabel = '查看复盘';
  }

  const signals = [];
  if (recentAverage > 0) {
    signals.push(`近 14 日活跃日均 ${formatMinutes(recentAverage)}`);
  }
  if (completionRate != null) {
    signals.push(`任务完成率 ${Math.round(completionRate * 100)}%`);
  }
  if (weakestIelts) {
    signals.push(`雅思优先补 ${weakestIelts.label}`);
  }

  return {
    today,
    focusToday,
    focusCount,
    goalMinutes,
    goalCount,
    remainingMinutes,
    remainingCount,
    overdueTasks,
    rankedTasks,
    nextTask,
    taskMinutes,
    suggestedRound,
    recentAverage,
    completionRate,
    weakestIelts,
    headline,
    detail,
    action,
    actionLabel,
    actionTask,
    signals,
  };
}

export function scoreTask(task, today = todayStr(), taskMinutes = {}) {
  if (task.done) return -Infinity;
  let score = 0;
  if (task.date < today) {
    const age = Math.min(14, Math.max(1, daysBetween(task.date, today)));
    score += 100 + age * 5;
  } else if (task.date === today) {
    score += 60;
  } else {
    score += 10;
  }
  if (!taskMinutes[task.id]) score += 8;
  if (task.createdAt) {
    const age = Math.min(10, Math.max(0, daysBetween(task.createdAt.slice(0, 10), today)));
    score += age;
  }
  return score;
}

export function focusMinutesByTask(data) {
  return data.sessions.reduce((result, session) => {
    if (session.type !== 'focus' || !session.taskId) return result;
    result[session.taskId] = (result[session.taskId] || 0) + safeMinutes(session.minutes);
    return result;
  }, {});
}

function suggestRound({ remainingMinutes, recentAverage, nextTask, taskMinutes }) {
  const estimate = estimateMinutes(nextTask?.text);
  if (estimate) return Math.min(90, Math.max(15, estimate));
  if (remainingMinutes > 0 && remainingMinutes < 25) return Math.max(15, remainingMinutes);
  if (nextTask && taskMinutes[nextTask.id] >= 50) return 50;
  if (recentAverage >= 180) return 50;
  return 25;
}

function averageFocusMinutes(data, now, days) {
  const totals = [];
  for (let i = 1; i <= days; i += 1) {
    const date = todayStr(new Date(now.getTime() - i * DAY_MS));
    totals.push(data.sessions
      .filter((session) => session.date === date && session.type === 'focus')
      .reduce((sum, session) => sum + safeMinutes(session.minutes), 0));
  }
  const activeDays = totals.filter((minutes) => minutes > 0);
  return activeDays.length ? activeDays.reduce((a, b) => a + b, 0) / activeDays.length : 0;
}

function recentTaskCompletion(data, now, days) {
  const start = todayStr(new Date(now.getTime() - (days - 1) * DAY_MS));
  const tasks = data.tasks.filter((task) => task.date >= start && task.date <= todayStr(now));
  if (!tasks.length) return null;
  return tasks.filter((task) => task.done).length / tasks.length;
}

function weakestIeltsSkill(data) {
  const latest = [...data.ielts]
    .filter((entry) => entry && entry.date)
    .sort((a, b) => `${b.date}${b.createdAt || ''}`.localeCompare(`${a.date}${a.createdAt || ''}`))[0];
  if (!latest) return null;
  const values = Object.entries(COMPONENT_LABELS)
    .map(([key, label]) => ({ key, label, value: sectionBand(latest[key]) }))
    .filter((item) => item.value != null);
  if (!values.length) return null;
  return values.sort((a, b) => a.value - b.value)[0];
}

function sectionBand(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return Number.isFinite(Number(value.band)) ? Number(value.band) : null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function estimateMinutes(text) {
  const match = String(text || '').match(/(?:^|[\s([（])([1-9]\d?)\s*(?:m|min|分钟)(?:$|[\s)）]])/i);
  return match ? Math.min(90, Math.max(15, Number(match[1]))) : 0;
}

function safeMinutes(value) {
  return Math.max(0, Number(value) || 0);
}

function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
    ? Math.round((b - a) / DAY_MS)
    : 0;
}

export function formatMinutes(minutes) {
  const n = Math.round(Number(minutes) || 0);
  if (n < 60) return `${n} 分钟`;
  const hours = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
