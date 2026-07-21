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
  if (v == null || v === '') return '—';
  return Number(v).toFixed(1);
}
