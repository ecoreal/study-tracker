import { el, progressBar } from './components.js';
import { getData } from '../store.js';
import {
  streakDays,
  weekFocusMinutes,
  monthSummary,
  heatmap,
  todayFocusStats,
} from '../stats.js';
import { formatBand } from '../ielts.js';

/**
 * @param {HTMLElement} root
 */
export function renderStats(root) {
  const data = getData();
  const streak = streakDays(data);
  const week = weekFocusMinutes(data);
  const month = monthSummary(data);
  const heat = heatmap(data, 16);
  const today = todayFocusStats(data);
  const maxMin = Math.max(1, ...week.map((d) => d.minutes));
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);
  const goals = data.settings.dailyGoals || { focusMinutes: 120, focusCount: 4 };
  // recent IELTS overall list
  const activeDays = heat.filter((c) => !c.future && c.level > 0).length;
  const recentIelts = [...data.ielts]
    .filter((i) => i.overall != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '统计与打卡' }),
          el('p', { text: '有专注番茄 / 雅思记录 / 完成任务，都算学习日。' }),
        ]),
      ]),

      el('div', { className: 'grid-4' }, [
        cardStat('连续学习', `${streak}`, '天'),
        cardStat('今日专注', `${today.minutes}`, `分钟 · ${today.count} 番茄`),
        cardStat('本周专注', `${weekTotal}`, '分钟'),
        cardStat('本月番茄', `${month.focusCount}`, `${month.focusMinutes} 分钟`),
      ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [el('h3', { text: '今日目标进度' })]),
        progressBar(today.minutes / Math.max(1, goals.focusMinutes || 120), {
          label: `专注 ${today.minutes} / ${goals.focusMinutes || 120} 分钟`,
        }),
        el('div', { style: { height: '10px' } }),
        progressBar(today.count / Math.max(1, goals.focusCount || 4), {
          label: `番茄 ${today.count} / ${goals.focusCount || 4} 个`,
        }),
      ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '近 7 日专注分钟' }),
          el('span', { className: 'badge', text: `合计 ${weekTotal} 分` }),
        ]),
        el(
          'div',
          { className: 'chart-bars' },
          week.map((d) =>
            el('div', { className: 'chart-bar-col', title: `${d.date} · ${d.minutes} 分钟` }, [
              el('div', { className: 'chart-bar-value', text: d.minutes ? String(d.minutes) : '' }),
              el('div', {
                className: 'chart-bar',
                style: {
                  height: `${Math.max(4, (d.minutes / maxMin) * 120)}px`,
                  opacity: d.minutes ? '1' : '0.35',
                },
              }),
              el('div', { className: 'chart-bar-label', text: d.label }),
            ]),
          ),
        ),
      ]),

      /* 月内专注折线 */
      monthlySparklineSection(data),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '最近雅思 Overall' }),
          el('span', { className: 'badge accent', text: `${month.ieltsCount} 次本月` }),
        ]),
          recentIelts.length
            ? el(
              'div',
              { className: 'list' },
              recentIelts.map((i) =>
                el('div', { className: 'list-item compact' }, [
                  el('div', { className: 'item-body' }, [
                    el('div', { className: 'item-title' }, [
                      el('span', { className: 'badge accent', text: formatBand(i.overall) }),
                      document.createTextNode(` ${i.paper || '未命名'}`),
                    ]),
                    el('div', { className: 'item-meta', text: i.date }),
                  ]),
                ]),
              ),
            )
            : el('div', { className: 'empty soft', text: '还没有带 Overall 的成绩' }),
        ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '近 16 周热力图' }),
          el('span', { className: 'badge', text: `${activeDays} 个活跃日 · 共 ${heat.filter(c => !c.future).length} 天` }),
        ]),
        el(
          'div',
          { className: 'heatmap', title: '颜色越深，当日学习量越大' },
          heat.map((c) =>
            el('div', {
              className: `heat-cell${c.level ? ` l${c.level}` : ''}${c.future ? ' future' : ''}`,
              title: `${c.date}${c.future ? '（未来）' : c.level ? ` · 活跃度 ${c.level}` : ' · 无记录'}`,
            }),
          ),
        ),
        el('div', { className: 'heat-legend' }, [
          el('span', { text: '少' }),
          el('div', { className: 'heat-cell' }),
          el('div', { className: 'heat-cell l1' }),
          el('div', { className: 'heat-cell l2' }),
          el('div', { className: 'heat-cell l3' }),
          el('div', { className: 'heat-cell l4' }),
          el('span', { text: '多' }),
        ]),
      ]),
    ]),
  );
}

function cardStat(label, value, hint) {
  return el('div', { className: 'card stat-card' }, [
    el('div', { className: 'stat-label', text: label }),
    el('div', { className: 'stat-value', text: value }),
    el('div', { className: 'stat-hint', text: hint }),
  ]);
}

/** Monthly focus sparkline: each day's total focus minutes for the current month. */
function monthlySparklineSection(data) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${prefix}-${String(d).padStart(2, '0')}`;
    const minutes = data.sessions
      .filter((s) => s.date === key && s.type === 'focus')
      .reduce((a, s) => a + (s.minutes || 0), 0);
    days.push({ date: key, day: d, minutes });
  }

  const totalMin = days.reduce((a, d) => a + d.minutes, 0);
  const activeDays = days.filter((d) => d.minutes > 0).length;

  const w = 640, h = 100, pad = 20;
  const maxMin = Math.max(1, ...days.map((d) => d.minutes));
  const pts = days.map((d, i) => ({
    x: pad + (i * (w - pad * 2)) / Math.max(1, days.length - 1),
    y: h - pad - ((d.minutes / maxMin) * (h - pad * 2)),
    day: d.day,
    minutes: d.minutes,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // axis
  const axis = document.createElementNS(svgNS, 'line');
  axis.setAttribute('class', 'axis');
  axis.setAttribute('x1', String(pad));
  axis.setAttribute('x2', String(w - pad));
  axis.setAttribute('y1', String(h - pad));
  axis.setAttribute('y2', String(h - pad));
  svg.append(axis);

  // fill area under line
  if (pts.length >= 2) {
    const fillD = `M${pts[0].x.toFixed(1)},${h - pad} ${d.slice(1)} L${pts[pts.length - 1].x.toFixed(1)},${h - pad} Z`;
    const fill = document.createElementNS(svgNS, 'path');
    fill.setAttribute('d', fillD);
    fill.setAttribute('fill', 'var(--accent-soft-var)');
    fill.setAttribute('opacity', '0.4');
    svg.append(fill);
  }

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'line');
  path.setAttribute('d', d);
  svg.append(path);

  for (const p of pts) {
    if (p.minutes === 0) continue;
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '3');
    const t = document.createElementNS(svgNS, 'title');
    t.textContent = `${prefix}-${String(p.day).padStart(2, '0')} · ${p.minutes} 分钟`;
    c.append(t);
    svg.append(c);
  }

  return el('section', { className: 'card' }, [
    el('div', { className: 'card-header' }, [
      el('h3', { text: `本月专注 · ${prefix}` }),
      el('span', { className: 'badge', text: `${activeDays} 天活跃 · ${totalMin} 分钟` }),
    ]),
    totalMin > 0
      ? el('div', {}, [svg])
      : el('div', { className: 'empty soft', text: '本月还没有专注记录 📊' }),
  ]);
}
