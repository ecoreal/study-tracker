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
import { buildCoachPlan, formatMinutes } from '../coach.js';

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
  const coach = buildCoachPlan(data);
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
          el('p', { text: '专注番茄、记忆复习、雅思记录和完成任务都算学习日。' }),
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

      coachInsightSection(coach),

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

function coachInsightSection(plan) {
  const insights = [];
  if (plan.recentAverage > 0) {
    const ratio = plan.recentAverage / plan.goalMinutes;
    const message = ratio < 0.6
      ? `当前目标比近期活跃日均高出较多，先稳定完成 ${formatMinutes(Math.max(25, Math.round(plan.recentAverage / 25) * 25))} 更可持续。`
      : ratio > 1.2
        ? '近期学习量已稳定超过目标，可以保持节奏，不必急着继续加量。'
        : '当前目标和近期学习节奏基本匹配，继续保持即可。';
    insights.push({ label: '目标匹配', text: message });
  }
  if (plan.completionRate != null) {
    const pct = Math.round(plan.completionRate * 100);
    insights.push({
      label: '任务负荷',
      text: pct < 50
        ? `近 14 日任务完成率 ${pct}%，建议减少每日任务数，并把大任务拆成 25 分钟动作。`
        : `近 14 日任务完成率 ${pct}%，当前计划量处于可执行范围。`,
    });
  }
  if (plan.weakestIelts) {
    insights.push({
      label: '雅思方向',
      text: `最近记录中${plan.weakestIelts.label}为相对短板（${plan.weakestIelts.value} 分），下一次练习优先安排这一科。`,
    });
  }
  if (plan.review?.total) {
    insights.push({
      label: '记忆负荷',
      text: plan.review.todayDue
        ? `今天有 ${plan.review.todayDue} 个词汇可学习，其中 ${plan.review.scheduledDue} 个已经到期。`
        : `今天的词汇复习已完成，当前有 ${plan.review.mature} 个词进入长期记忆。`,
    });
  }
  if (plan.review?.mistakeReview?.due) {
    insights.push({
      label: '真题复盘',
      text: `还有 ${plan.review.mistakeReview.due} 道真题待复盘，和词汇复习分开处理更容易看清错因。`,
    });
  }
  if (!insights.length) {
    insights.push({ label: '等待数据', text: '完成任务和专注记录后，这里会逐步形成适合你的学习节奏建议。' });
  }

  return el('section', { className: 'card coach-insights' }, [
    el('div', { className: 'card-header' }, [
      el('h3', { text: '智能复盘' }),
      el('span', { className: 'badge coach-badge', text: '近 14 日' }),
    ]),
    el('div', { className: 'coach-insight-list' }, insights.map((insight) =>
      el('div', { className: 'coach-insight-row' }, [
        el('span', { className: 'coach-insight-label', text: insight.label }),
        el('p', { text: insight.text }),
      ]),
    )),
  ]);
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
