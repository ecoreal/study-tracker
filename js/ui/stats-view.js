import { el } from './components.js';
import { getData } from '../store.js';
import {
  streakDays,
  weekFocusMinutes,
  monthSummary,
  heatmap,
  todayFocusStats,
} from '../stats.js';

/**
 * @param {HTMLElement} root
 */
export function renderStats(root) {
  const data = getData();
  const streak = streakDays(data);
  const week = weekFocusMinutes(data);
  const month = monthSummary(data);
  const heat = heatmap(data, 12);
  const today = todayFocusStats(data);
  const maxMin = Math.max(1, ...week.map((d) => d.minutes));

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '统计与打卡' }),
          el('p', { text: '有日志 / 专注番茄 / 雅思记录 / 完成任务，都算学习日。' }),
        ]),
      ]),

      el('div', { className: 'grid-4' }, [
        cardStat('连续学习', `${streak}`, '天'),
        cardStat('今日专注', `${today.minutes}`, `分钟 · ${today.count} 番茄`),
        cardStat('本月番茄', `${month.focusCount}`, `${month.focusMinutes} 分钟`),
        cardStat('本月练习', `${month.ieltsCount}`, `日志 ${month.logCount} 条`),
      ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '近 7 日专注分钟' }),
        ]),
        el(
          'div',
          { className: 'chart-bars' },
          week.map((d) =>
            el('div', { className: 'chart-bar-col' }, [
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

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '近 12 周热力图' }),
        ]),
        el(
          'div',
          { className: 'heatmap', title: '颜色越深，当日学习量越大' },
          heat.map((c) =>
            el('div', {
              className: `heat-cell${c.level ? ` l${c.level}` : ''}`,
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
