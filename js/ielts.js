/**
 * IELTS band helpers (0–9, half-band steps).
 */

export function roundBand(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.min(9, Math.max(0, Math.round(Number(n) * 2) / 2));
}

/**
 * Official-style overall: average of 4 skills, then to nearest 0.5
 * (.25 rounds up to .5, .75 rounds up to next whole — standard IELTS uses:
 *  x.25 → x.5, x.75 → x+1). Using common rule: round to nearest 0.5 with
 *  midpoint rounding away from lower half in standard fashion.
 */
export function computeOverall(listening, reading, writing, speaking) {
  const scores = [listening, reading, writing, speaking]
    .map((x) => (x == null || x === '' ? null : Number(x)))
    .filter((x) => x != null && !Number.isNaN(x));
  if (scores.length < 4) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / 4;
  // IELTS: average then round to nearest 0.5
  // .25 → up to .5, .75 → up to next whole
  const floor = Math.floor(avg);
  const frac = avg - floor;
  if (frac < 0.25) return floor;
  if (frac < 0.75) return floor + 0.5;
  return floor + 1;
}

export function bandOptions() {
  const opts = [];
  for (let i = 0; i <= 18; i += 1) {
    opts.push((i / 2).toFixed(1).replace(/\.0$/, '.0'));
  }
  // produce 0.0, 0.5, ... 9.0
  return Array.from({ length: 19 }, (_, i) => (i * 0.5).toFixed(1));
}

export function formatBand(v) {
  // tolerate detail objects by delegating to bandOf when needed
  if (v != null && typeof v === 'object') return formatBand(bandOf(v));
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? '—' : n.toFixed(1);
}

/** Resolve band number from either a plain band, or a sub-score object {band, score, correctRate, mistakes}. */
export function bandOf(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'object') {
    if (v.band != null) return Number(v.band);
    if (v.score != null) return Number(v.score);
  }
  return null;
}

/** True when value carries section detail (correct rate / mistakes). */
export function hasDetail(v) {
  return (
    v != null &&
    typeof v === 'object' &&
    (v.correctRate != null && v.correctRate > 0 ? true : Array.isArray(v.mistakes) && v.mistakes.length > 0)
  );
}

export function correctRatePct(v) {
  if (v == null || typeof v !== 'object' || v.correctRate == null) return null;
  const n = Number(v.correctRate);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}
