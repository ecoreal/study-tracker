/**
 * IELTS band helpers (0-9, half-band steps) + part stats & mistake tooling.
 */

/** How many questions a full paper has per part. */
export const PART_QUESTIONS = {
  listening: [10, 10, 10, 10],
  reading: [13, 13, 14],
};

/** 40 raw correct -> approximate IELTS band (Academic). */
export const LISTENING_RAW_TO_BAND = [
  0, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5, 5, 5.5, 5.5, 5.5, 5.5, 6, 6, 6, 6.5, 6.5,
  6.5, 6.5, 7, 7, 7, 7, 7.5, 7.5, 7.5, 7.5, 8, 8, 8, 8.5, 8.5, 8.5, 8.5, 9, 9,
  9,
];
export const READING_AC_RAW_TO_BAND = [
  0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5, 5, 5.5, 5.5, 6, 6, 6, 6.5, 6.5, 6.5,
  7, 7, 7, 7.5, 7.5, 7.5, 7.5, 8, 8, 8, 8, 8.5, 8.5, 8.5, 9, 9, 9, 9, 9,
];

export function roundBand(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.min(9, Math.max(0, Math.round(Number(n) * 2) / 2));
}

/**
 * Official-style overall: average of 4 skills -> nearest 0.5
 * (.25 -> .5, .75 -> up to next whole).
 */
export function computeOverall(listening, reading, writing, speaking) {
  const scores = [listening, reading, writing, speaking]
    .map((x) => (x == null || x === '' ? null : Number(x)))
    .filter((x) => x != null && !Number.isNaN(x));
  if (scores.length < 4) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / 4;
  const floor = Math.floor(avg);
  const frac = avg - floor;
  if (frac < 0.25) return floor;
  if (frac < 0.75) return floor + 0.5;
  return floor + 1;
}

/** Estimate single-skill band from 40-question raw correct count. */
export function bandFromRaw(subject, correctCount) {
  const map = subject === 'reading' ? READING_AC_RAW_TO_BAND : LISTENING_RAW_TO_BAND;
  const n = Math.min(map.length - 1, Math.max(0, Math.round(Number(correctCount) || 0)));
  return map[n];
}

/** Approximate required correct rate (over TOTAL questions) for a given target band. */
export function requiredRateForBand(subject, targetBand) {
  if (targetBand == null || Number.isNaN(Number(targetBand))) return null;
  const map = subject === 'reading' ? READING_AC_RAW_TO_BAND : LISTENING_RAW_TO_BAND;
  const target = Number(targetBand);
  const total = map.length - 1; // 40 questions per paper
  for (let i = 0; i < map.length; i += 1) {
    if (map[i] >= target) return i / total;
  }
  return 1;
}

export function bandOptions() {
  return Array.from({ length: 19 }, (_, i) => (i * 0.5).toFixed(1));
}

export function formatBand(v) {
  if (v != null && typeof v === 'object') return formatBand(bandOf(v));
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? '—' : n.toFixed(1);
}

/** Resolve band number from either a plain band, or a sub-score object {band, score, ...}. */
export function bandOf(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'object') {
    if (v.band != null) return Number(v.band);
    if (v.score != null) return Number(v.score);
  }
  return null;
}

/** True when value carries section detail (correct rate / mistakes / parts). */
export function hasDetail(v) {
  if (v == null || typeof v !== 'object') return false;
  if (Array.isArray(v.mistakes) && v.mistakes.length > 0) return true;
  if (v.partStats && aggregatePartStats('listening', v.partStats).total > 0) return true;
  if (v.partStats && aggregatePartStats('reading', v.partStats).total > 0) return true;
  return v.correctRate != null && v.correctRate > 0;
}

export function correctRatePct(v) {
  if (v == null || typeof v !== 'object' || v.correctRate == null) return null;
  const n = Number(v.correctRate);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/* ---- mistakes (structured for review) ---- */

/**
 * Normalize one mistake: accepts legacy string or rich object.
 * @returns {null | {id:string, part:number|null, ans:string, orig:string, sub:string,
 *            reason:string, tag:string, understood:string, note:string,
 *            createdAt:string}}
 */
export function normalizeMistake(m, defaultPart = null) {
  const validPart = (v) => {
    if (v == null || v === '') return defaultPart;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 4) return defaultPart;
    return n;
  };
  if (typeof m === 'string') {
    return {
      id: '',
      part: defaultPart,
      ans: m.trim(),
      orig: '',
      sub: '',
      reason: '',
      tag: '',
      understood: '',
      note: '',
      createdAt: '',
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
    understood: String(m.understood ?? '').trim(),
    note: String(m.note ?? '').trim(),
    createdAt: m.createdAt || '',
  };
}

/** A mistake counts as filled when at least one meaningful field is set. */
export function mistakeIsEmpty(m) {
  if (m == null) return true;
  if (typeof m === 'string') return m.trim() === '';
  return (
    String(m.ans || '').trim() === '' &&
    String(m.orig || '').trim() === '' &&
    String(m.sub || '').trim() === '' &&
    String(m.reason || '').trim() === ''
  );
}

/** Short single-line summary used in compact lists. */
export function mistakeText(m) {
  if (typeof m === 'string') return m.trim();
  if (m == null) return '';
  const bits = [];
  if (m.part != null && m.part !== '') bits.push(`P${m.part}`);
  if (m.ans) bits.push(m.ans);
  if (m.orig) bits.push(`原:${m.orig}`);
  if (m.sub) bits.push(`同替:${m.sub}`);
  if (m.reason) bits.push(`因:${m.reason}`);
  return String(bits.join(' · ') || m.note || '');
}

/* ---- part stats ---- */

/**
 * Normalize partStats map. Keys are '1'..'n'; values {total, correct}.
 * @returns {null | {[part:string]: {total:number, correct:number}}}
 */
export function normalizedPartStats(partStats, subject) {
  if (partStats == null || typeof partStats !== 'object') return null;
  const maxParts = PART_QUESTIONS[subject]?.length || 4;
  const out = {};
  for (const [k, v] of Object.entries(partStats)) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 1 || idx > maxParts) continue;
    const rec = normalizePartRec(v);
    if (rec == null) continue;
    out[String(idx)] = rec;
  }
  return Object.keys(out).length ? out : null;
}

function normalizePartRec(v) {
  if (v == null || typeof v !== 'object') return null;
  const total = Math.max(0, Math.round(Number(v.total) || 0));
  const correct = Math.max(0, Math.min(total, Math.round(Number(v.correct) || 0)));
  if (total === 0) return null;
  return { total, correct };
}

/** stats array per part, always a full-length row (zeros when missing). */
export function subjectStats(subject, partStats) {
  const counts = PART_QUESTIONS[subject] || [];
  return counts.map((questions, i) => {
    const rec = partStats?.[String(i + 1)] || null;
    const total = rec ? rec.total : 0;
    const correct = rec ? rec.correct : 0;
    return {
      part: i + 1,
      total,
      correct,
      rate: total > 0 ? correct / total : null,
      questions,
    };
  });
}

/** Combined summary across available parts. */
export function aggregatePartStats(subject, partStats) {
  const parts = subjectStats(subject, partStats);
  const total = parts.reduce((s, p) => s + p.total, 0);
  const correct = parts.reduce((s, p) => s + p.correct, 0);
  return {
    parts,
    total,
    correct,
    rate: total > 0 ? correct / total : null,
  };
}

/* ---- week grouping (Mon~Sun). ---- */

/** 'YYYY-MM-DD' -> 'YYYY-MM-DD' of the Monday of that week. */
export function weekKeyOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr || '';
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return iso(monday);
}

export function weekLabel(weekKey) {
  const mon = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(mon.getTime())) return weekKey;
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${mon.getMonth() + 1}/${mon.getDate()} ~ ${sun.getMonth() + 1}/${sun.getDate()}`;
}

/** weekKey ('YYYY-MM-DD') offset by nWeeks. */
export function weekKeyOffset(weekKey, nWeeks) {
  const d = new Date(`${weekKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekKey;
  d.setDate(d.getDate() + nWeeks * 7);
  return iso(d);
}

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ---- mistake tags / understood options ---- */
export const MISTAKE_TAGS = ['定位错误', '同替没听出', '词汇量不足', '连读吞音', '多选漏选', '粗心', '时间不够', '其他'];
export const QUESTION_TAGS_READING = ['定位错误', 'T/F/NG 混淆', '同义替换', '长难句', '段落主旨', '时间不够', '粗心', '其他'];
export const UNDERSTOOD_OPTIONS = [
  { value: '1', text: '完全听懂 / 看懂' },
  { value: '0.5', text: '半懂 / 靠运气' },
  { value: '0', text: '没听懂 / 蒙的' },
];
