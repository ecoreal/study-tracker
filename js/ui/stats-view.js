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
  const activeDays = heat.filter((c) => !c.future && c.level > 0).length;
  const recentIelts = [...data.ielts]
    .filter((i) => i.overall != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // subject breakdown this month
  const prefix = new Date().toISOString().slice(0, 7);
  const bySubject = {};
  for (const l of data.logs) {
    if (!l.date.startsWith(prefix)) continue;
    bySubject[l.subject] = (bySubject[l.subject] || 0) + (l.minutes || 0);
  }
  const subjectRows = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  const subjMax = Math.max(1, ...subjectRows.map(([, m]) => m));

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

      el('div', { className: 'grid-2' }, [
        el('section', { className: 'card' }, [
          el('div', { className: 'card-header' }, [
            el('h3', { text: '本月科目时长' }),
            el('span', { className: 'badge', text: `${month.logCount} 条日志` }),
          ]),
          subjectRows.length
            ? el(
              'div',
              { className: 'subject-bars' },
              subjectRows.map(([name, mins]) =>
                el('div', { className: 'subject-row' }, [
                  el('div', { className: 'subject-name', text: name }),
                  el('div', { className: 'progress-track' }, [
                    el('div', {
                      className: 'progress-fill',
                      style: { width: `${(mins / subjMax) * 100}%` },
                    }),
                  ]),
                  el('div', { className: 'subject-min', text: `${mins} 分` }),
                ]),
              ),
            )
            : el('div', { className: 'empty soft', text: '本月还没有日志时长' }),
        ]),

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
      ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '近 16 周热力图' }),
          el('span', { className: 'badge', text: `${activeDays} 个活跃日` }),
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
