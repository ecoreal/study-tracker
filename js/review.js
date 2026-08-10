/**
 * Review queue helpers and a lazy ts-fsrs bridge.
 * The pinned module is fetched only when a learner reveals/rates a card.
 */

const FSRS_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.1/dist/index.umd.js';
const FSRS_INTEGRITY = 'sha384-vUnpYcC1dUMLPLPrmeEn87LXia7oszmALRvwobS9CN8sm1pq3wb1gm0hkLJIiGNp';
let fsrsModulePromise = null;
let schedulerPromise = null;

function loadFsrs() {
  if (window.FSRS?.fsrs) return Promise.resolve(window.FSRS);
  if (!fsrsModulePromise) {
    fsrsModulePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = FSRS_SCRIPT_URL;
      script.integrity = FSRS_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = () => window.FSRS?.fsrs
        ? resolve(window.FSRS)
        : reject(new Error('FSRS 组件初始化失败'));
      script.onerror = () => reject(new Error('FSRS 组件加载失败，请检查网络'));
      document.head.append(script);
    });
  }
  return fsrsModulePromise;
}

async function getScheduler() {
  if (!schedulerPromise) {
    schedulerPromise = loadFsrs().then(({ fsrs }) => fsrs({
      request_retention: 0.9,
      maximum_interval: 36500,
      enable_fuzz: true,
      enable_short_term: true,
    }));
  }
  return schedulerPromise;
}

function serializeCard(card) {
  const out = {
    ...card,
    due: new Date(card.due).toISOString(),
  };
  if (card.last_review) out.last_review = new Date(card.last_review).toISOString();
  else delete out.last_review;
  return out;
}

async function cardInput(card, now) {
  if (card) return card;
  const { createEmptyCard } = await loadFsrs();
  return createEmptyCard(now);
}

export async function previewRatings(card, now = new Date()) {
  const scheduler = await getScheduler();
  const current = await cardInput(card, now);
  const preview = scheduler.repeat(current, now);
  const result = {};
  for (const rating of [1, 2, 3, 4]) {
    if (preview[rating]?.card) result[rating] = serializeCard(preview[rating].card);
  }
  return result;
}

export async function rateCard(card, rating, now = new Date()) {
  const scheduler = await getScheduler();
  const current = await cardInput(card, now);
  const result = scheduler.next(current, now, Number(rating));
  return {
    card: serializeCard(result.card),
    log: {
      ...result.log,
      due: new Date(result.log.due).toISOString(),
      review: new Date(result.log.review).toISOString(),
    },
  };
}

export function collectReviewItems(data) {
  const items = [];
  for (const word of data.vocabulary || []) {
    items.push({
      key: `word:${word.id}`,
      kind: 'word',
      id: word.id,
      card: word.review || null,
      word,
    });
  }
  for (const entry of data.ielts || []) {
    for (const subject of ['listening', 'reading']) {
      const section = entry[subject];
      if (!section || typeof section !== 'object' || !Array.isArray(section.mistakes)) continue;
      for (const mistake of section.mistakes) {
        if (!mistake?.id) continue;
        items.push({
          key: `mistake:${mistake.id}`,
          kind: 'mistake',
          id: mistake.id,
          card: mistake.review || null,
          mistake,
          entry,
          subject,
        });
      }
    }
  }
  return items;
}

export function buildReviewQueue(data, { kind = 'all', now = new Date() } = {}) {
  const allItems = collectReviewItems(data).filter((item) => kind === 'all' || item.kind === kind);
  const nowMs = now.getTime();
  const scheduled = allItems
    .filter((item) => item.card && dueTime(item.card) <= nowMs)
    .sort((a, b) => dueTime(a.card) - dueTime(b.card));
  const fresh = interleaveNewItems(allItems.filter((item) => !item.card));
  const newLimit = Math.min(100, Math.max(0, Number(data.settings?.review?.dailyNewLimit) || 20));
  const start = startOfDay(now).getTime();
  const newReviewedToday = new Set(
    (data.reviewLogs || [])
      .filter((log) => log.wasNew)
      .filter((log) => (Date.parse(log.reviewedAt) || 0) >= start)
      .map((log) => `${log.kind}:${log.itemId}`),
  ).size;
  const newAllowance = Math.max(0, newLimit - newReviewedToday);
  return [...scheduled, ...fresh.slice(0, newAllowance)];
}

export function getReviewSummary(data, now = new Date()) {
  const items = collectReviewItems(data);
  const nowMs = now.getTime();
  const scheduledDue = items.filter((item) => item.card && dueTime(item.card) <= nowMs);
  const fresh = items.filter((item) => !item.card);
  const start = startOfDay(now).getTime();
  const logsToday = (data.reviewLogs || []).filter(
    (log) => (Date.parse(log.reviewedAt) || 0) >= start,
  );
  const newReviewedToday = new Set(
    logsToday.filter((log) => log.wasNew).map((log) => `${log.kind}:${log.itemId}`),
  ).size;
  const newLimit = Math.min(100, Math.max(0, Number(data.settings?.review?.dailyNewLimit) || 20));
  const newAvailable = Math.min(fresh.length, Math.max(0, newLimit - newReviewedToday));
  return {
    total: items.length,
    words: items.filter((item) => item.kind === 'word').length,
    mistakes: items.filter((item) => item.kind === 'mistake').length,
    scheduledDue: scheduledDue.length,
    newBacklog: fresh.length,
    newAvailable,
    todayDue: scheduledDue.length + newAvailable,
    reviewedToday: logsToday.length,
    mature: items.filter((item) => item.card?.state === 2 && Number(item.card?.scheduled_days) >= 21).length,
  };
}

export function formatInterval(due, now = new Date()) {
  const ms = Math.max(0, new Date(due).getTime() - now.getTime());
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  return `${Math.round(months / 12)} 年`;
}

export function reviewStateLabel(card, now = new Date()) {
  if (!card) return '新内容';
  if (dueTime(card) <= now.getTime()) return '待复习';
  const date = new Date(card.due);
  if (date.toDateString() === now.toDateString()) return '今天稍后';
  return `${date.getMonth() + 1}/${date.getDate()} 复习`;
}

export function normalizeSpelling(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ');
}

function dueTime(card) {
  const time = Date.parse(card?.due || '');
  return Number.isFinite(time) ? time : 0;
}

function startOfDay(date) {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function interleaveNewItems(items) {
  const words = items
    .filter((item) => item.kind === 'word')
    .sort((a, b) => (Number(b.word.errorCount) || 0) - (Number(a.word.errorCount) || 0));
  const mistakes = items
    .filter((item) => item.kind === 'mistake')
    .sort((a, b) => String(b.mistake.createdAt || '').localeCompare(String(a.mistake.createdAt || '')));
  const mixed = [];
  while (words.length || mistakes.length) {
    for (let i = 0; i < 3 && words.length; i += 1) mixed.push(words.shift());
    if (mistakes.length) mixed.push(mistakes.shift());
  }
  return mixed;
}
