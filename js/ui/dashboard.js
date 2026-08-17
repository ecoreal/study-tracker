import { el, progressBar, toast } from './components.js';
import { getData, todayStr, toggleTask, addTask, rolloverOpenTasksToToday } from '../store.js';
import { streakDays, todayFocusStats, todayTasksStats, weekFocusMinutes } from '../stats.js';
import { formatBand, bandOf, daysUntilDate } from '../ielts.js';
import * as pomodoro from '../pomodoro.js';
import { buildCoachPlan, formatMinutes } from '../coach.js';
import { getReviewSummary } from '../review.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (v: string, subview?: string) => void, refresh: () => void }} ctx
 */
export function renderDashboard(root, ctx) {
  const data = getData();
  const today = todayStr();
  const focus = todayFocusStats(data, today);
  const tasks = todayTasksStats(data, today);
  const streak = streakDays(data);
  const todayTasks = data.tasks.filter((t) => t.date === today);
  const openTasks = todayTasks.filter((t) => !t.done);
  const recentIelts = data.ielts.filter((i) => i.date === today);
  const lastIelts = recentIelts[0] || data.ielts[0];
  const week = weekFocusMinutes(data);
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);
  const goals = data.settings.dailyGoals || { focusMinutes: 120, focusCount: 4 };
  const minGoal = Math.max(1, goals.focusMinutes || 120);
  const countGoal = Math.max(1, goals.focusCount || 4);
  const pState = pomodoro.getState();
  const coach = buildCoachPlan(data);
  const review = getReviewSummary(data);
  const lastWeekTotal = weekFocusMinutes(data, new Date(Date.now() - 7 * 86400000))
    .reduce((a, d) => a + d.minutes, 0);

  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  const greet = greeting();
  const live = createLiveTimer(ctx);

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', { className: 'hero-greet' }, [
          el('h2', { text: greet }),
          el('p', { className: 'muted', text: `${today} 星期${weekday}` }),
          el('div', { className: 'chip-row' }, [
            el('span', { className: 'chip', text: `🔥 连续学习 ${streak} 天` }),
            examCountdownChip(data.settings?.ieltsGoals?.examDate, today),
          ]),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: pState.running ? '查看番茄钟' : '开始专注',
            onClick: () => {
              ctx.navigate('timer');
              if (!pomodoro.getState().running && pomodoro.getState().remainingMs === pomodoro.getState().totalMs) {
                pomodoro.setMode('focus');
                pomodoro.start();
              }
            },
          }),
        ]),
      ]),

      live.el,

      el('div', { className: 'grid-4' }, [
        stat('今日番茄', String(focus.count), `目标 ${countGoal} 个`, { icon: '🍅', countUp: focus.count }),
        stat('专注时长', `${focus.minutes} 分`, focus.minutes ? `目标 ${minGoal} 分钟` : `目标 120 分钟`, {
          icon: '⏱️',
          spark: sparkline(week.map((d) => d.minutes)),
        }),
        stat(
          '待办完成',
          tasks.total ? `${tasks.done}/${tasks.total}` : '0',
          tasks.total ? `${Math.round(tasks.rate * 100)}%` : '添加一个任务吧',
          { icon: '✅' },
        ),
        stat('本周专注', `${weekTotal}`, '分钟', {
          icon: '📈',
          countUp: weekTotal,
          delta: weekDelta(weekTotal, lastWeekTotal),
        }),
      ]),

      /* 今日概览横幅 */
      summaryBanner(data, today),

      smartCoachCard(coach, ctx),

      reviewDashboardCard(review, ctx),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '今日目标' }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: '设置',
            onClick: () => ctx.navigate('settings'),
          }),
        ]),
        focus.minutes > 0 || focus.count > 0
          ? null
          : el('p', { className: 'help', style: { marginBottom: '8px' }, text: '完成一个番茄钟，进度条就开始跑啦 🍅' }),
        progressBar(focus.minutes > 0 ? focus.minutes / minGoal : 0, {
          label: `专注时长 ${focus.minutes} / ${minGoal} 分钟`,
        }),
        el('div', { style: { height: '10px' } }),
        progressBar(focus.count > 0 ? focus.count / countGoal : 0, {
          label: `完成番茄 ${focus.count} / ${countGoal} 个`,
        }),
      ]),

      el('div', { className: 'grid-2' }, [
        el('section', { className: 'card' }, [
          el('div', { className: 'card-header' }, [
            el('h3', { text: '今日任务' }),
            el('button', {
              type: 'button',
              className: 'btn btn-sm btn-ghost',
              text: '全部',
              onClick: () => ctx.navigate('tasks'),
            }),
          ]),
          taskQuickList(todayTasks, ctx, coach),
          quickAddTask(today),
          openTasks.length
            ? el('p', {
              className: 'help',
              style: { marginTop: '8px' },
              text: `还剩 ${openTasks.length} 项未完成`,
            })
            : null,
        ]),

        el('section', { className: 'card' }, [
          el('div', { className: 'card-header' }, [
            el('h3', { text: '近 7 日专注' }),
            el('button', {
              type: 'button',
              className: 'btn btn-sm btn-ghost',
              text: '统计',
              onClick: () => ctx.navigate('stats'),
            }),
          ]),
          miniWeekBars(week),
        ]),
      ]),

      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '雅思' }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: '录入',
            onClick: () => ctx.navigate('ielts'),
          }),
        ]),
        lastIelts
          ? el('div', { className: 'list' }, [
            el('div', { className: 'list-item compact' }, [
              el('div', { className: 'item-body' }, [
                el('div', { className: 'item-title' }, [
                  el('span', {
                    className: 'badge accent',
                    text: lastIelts.paper || '未命名',
                  }),
                  document.createTextNode(
                    ` Overall ${formatBand(lastIelts.overall)}`,
                  ),
                ]),
                el('div', {
                  className: 'item-meta',
                  text: `${lastIelts.date} · L${formatBand(bandOf(lastIelts.listening))} R${formatBand(bandOf(lastIelts.reading))} W${formatBand(bandOf(lastIelts.writing))} S${formatBand(bandOf(lastIelts.speaking))}`,
                }),
              ]),
            ]),
            recentIelts.length > 0
              ? el('p', {
                className: 'help',
                text: `今天已录入 ${recentIelts.length} 次练习`,
              })
              : el('p', {
                className: 'help',
                text: '上面是最近一次成绩，今天还没有新记录',
              }),
          ])
          : el('div', {
            className: 'empty soft',
            text: '还没有雅思成绩，做完真题来写一笔 ✍️',
          }),
      ]),
    ]),
  );

  animateCounts(root);
  root._cleanup = () => live.unsub();
}

function reviewDashboardCard(review, ctx) {
  const mistake = review.mistakeReview || { total: 0, due: 0, reviewedToday: 0 };
  const hasVocabulary = review.words > 0;
  const hasMistakes = mistake.total > 0;
  const hasContent = hasVocabulary || hasMistakes;
  const track = (title, count, description, actionLabel, subview, available) => el('div', { className: 'dashboard-review-track' }, [
    el('div', {}, [
      el('strong', { text: title }),
      el('p', { className: 'muted', text: description }),
    ]),
    el('strong', { className: 'dashboard-review-count', text: String(count) }),
    el('button', {
      type: 'button',
      className: `btn btn-sm ${available ? 'btn-primary' : 'btn-ghost'}`,
      text: actionLabel,
      onClick: () => ctx.navigate('ielts', subview),
    }),
  ]);
  return el('section', { className: 'card dashboard-review-card' }, [
    el('div', { className: 'dashboard-review-main' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { text: '今日学习' }),
        hasContent ? el('span', { className: 'badge', text: '分流学习' }) : null,
      ]),
      el('p', { className: 'muted', text: hasContent ? '词汇与真题错题使用各自的学习流程。' : '导入词汇或真题错题后开始安排' }),
      el('div', { className: 'dashboard-review-tracks' }, [
        track(
          '词汇复习',
          review.todayDue,
          hasVocabulary ? `${review.scheduledDue} 个到期 · ${review.newAvailable} 个新词` : '导入阅读 538 词或听力错词',
          review.todayDue ? '开始词汇' : '打开词库',
          review.todayDue ? 'review' : 'vocabulary',
          Boolean(review.todayDue),
        ),
        track(
          '真题复盘',
          mistake.due,
          hasMistakes ? `${mistake.unreviewed} 道未复盘 · ${mistake.practiceDue} 道需再做` : '导入阅读错题本开始',
          mistake.due ? '开始复盘' : '打开复盘',
          'mistake-review',
          Boolean(mistake.due),
        ),
      ]),
    ]),
  ]);
}

function smartCoachCard(plan, ctx) {
  const action = el('button', {
    type: 'button',
    className: `btn btn-sm ${plan.action === 'rollover' ? 'btn-ghost' : 'btn-primary'}`,
    text: plan.actionLabel,
    onClick: () => {
      if (plan.action === 'rollover') {
        const count = rolloverOpenTasksToToday();
        toast(count ? `已整理 ${count} 项任务到今天` : '没有需要整理的任务', count ? 'success' : 'info');
        ctx.refresh();
        return;
      }
      if (plan.action === 'start' && plan.actionTask) {
        pomodoro.setTaskId(plan.actionTask.id);
        pomodoro.setMode('focus');
        pomodoro.setCustomDuration(plan.suggestedRound);
      } else if (plan.action === 'timer') {
        pomodoro.setTaskId(null);
        pomodoro.setMode('focus');
        pomodoro.setCustomDuration(plan.suggestedRound);
      }
      if (plan.action === 'start' || plan.action === 'timer') {
        ctx.navigate('timer');
        pomodoro.start();
      } else if (plan.action === 'review') {
        ctx.navigate('ielts', 'review');
      } else if (plan.action === 'mistake-review') {
        ctx.navigate('ielts', 'mistake-review');
      } else if (plan.action === 'stats') {
        ctx.navigate('stats');
      } else {
        ctx.navigate('tasks');
      }
    },
  });

  return el('section', { className: 'card coach-card' }, [
    el('div', { className: 'card-header coach-header' }, [
      el('div', { className: 'coach-title-wrap' }, [
        el('span', { className: 'coach-mark', text: '✦', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('h3', { text: '智能学习建议' }),
          el('p', { className: 'coach-caption', text: '根据你的近期记录，给出下一步' }),
        ]),
      ]),
      el('span', {
        className: 'badge coach-badge',
        text: plan.focusToday
          ? `今日 ${formatMinutes(plan.focusToday)}`
          : plan.overdueTasks.length
            ? '待整理'
            : plan.nextTask
              ? `建议 ${plan.suggestedRound} 分钟`
              : '准备开始',
      }),
    ]),
    el('div', { className: 'coach-main' }, [
      el('div', { className: 'coach-copy' }, [
        el('strong', { className: 'coach-headline', text: plan.headline }),
        el('p', { className: 'coach-detail', text: plan.detail }),
      ]),
      action,
    ]),
    plan.signals.length
      ? el('div', { className: 'coach-signals' }, plan.signals.slice(0, 3).map((signal) =>
        el('span', { className: 'coach-signal', text: signal }),
      ))
      : null,
  ]);
}

function createLiveTimer(ctx) {
  const slot = el('div', { className: 'live-timer-slot' });
  const unsub = pomodoro.subscribePomodoro((st) => {
    const active = st.running || st.remainingMs < st.totalMs;
    if (!active) {
      slot.replaceChildren();
      return;
    }
    slot.replaceChildren(
      el(
        'section',
        {
          className: `card live-timer-card${st.running ? ' running' : ' paused'}`,
          onClick: () => ctx.navigate('timer'),
        },
        [
          el('div', { className: 'live-timer-main' }, [
            el('span', { className: 'badge', text: st.modeLabel }),
            el('span', {
              className: 'live-timer-time',
              text: pomodoro.formatMs(st.remainingMs),
            }),
            el('span', {
              className: 'muted',
              text: st.running ? '进行中 · 点击查看' : '已暂停 · 点击继续',
            }),
          ]),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-primary',
            text: st.running ? '暂停' : '继续',
            onClick: (e) => {
              e.stopPropagation();
              pomodoro.toggle();
            },
          }),
        ],
      ),
    );
  });
  return { el: slot, unsub };
}

/** Days until the exam; null when unset/invalid, negative when past. */
function examDaysAway(dateStr, today) {
  return daysUntilDate(dateStr, today);
}

/** Dashboard chip: 🔥 streak always, 📅 countdown when it is still ahead. */
function examCountdownChip(dateStr, today) {
  const days = examDaysAway(dateStr, today);
  if (days == null || days < 0) return null;
  if (days === 0) return el('span', { className: 'chip chip-hot', text: '📅 今天考试，加油！' });
  return el('span', {
    className: days <= 7 ? 'chip chip-hot' : 'chip',
    text: `📅 距考试 ${days} 天`,
  });
}

function greeting() {  const h = new Date().getHours();
  if (h < 5) return '夜深了，注意休息';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了，注意休息';
}

function stat(label, value, hint, extra = {}) {
  return el('div', { className: 'card stat-card' }, [
    el('div', { className: 'stat-top' }, [
      el('div', { className: 'stat-label', text: label }),
      extra.icon ? el('span', { className: 'stat-icon', text: extra.icon, 'aria-hidden': 'true' }) : null,
    ]),
    el('div', { className: 'stat-value', text: value }),
    el('div', { className: 'stat-bottom' }, [
      hint ? el('span', { className: 'stat-hint', text: hint }) : null,
      extra.delta
        ? el('span', {
          className: `stat-delta ${extra.delta.up ? 'up' : 'down'}`,
          text: `${extra.delta.up ? '↑' : '↓'} ${extra.delta.text}`,
        })
        : null,
    ]),
    extra.spark ? el('div', { className: 'stat-spark' }, [extra.spark]) : null,
  ]);
}

/** Signed week-over-week change; only meaningful once last week has data. */
function weekDelta(total, last) {
  if (!last || last <= 0) return null;
  const pct = Math.round(Math.abs(total - last) / last * 100);
  if (!pct) return null;
  return { up: total >= last, text: `较上周 ${pct}%` };
}

/**
 * Stat-tile sparkline: 2px line in the de-emphasized ink, last point accented
 * with a 2px surface ring (dataviz mark spec). Pure SVG, no interaction.
 */
function sparkline(points, w = 96, h = 26) {
  const values = (points.length ? points : [0]).map((v) => Number(v) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - 4) / (values.length - 1) : 0;
  const coords = values.map((v, i) => {
    const x = 2 + i * step;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lx, ly] = coords[coords.length - 1].split(',');
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false"><polyline points="${coords.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="3" fill="var(--accent-var)" stroke="var(--bg-elevated)" stroke-width="2"/></svg>`;
  return el('span', { className: 'spark', html: svg });
}

/** Ease-out count-up for standalone numeric stat values (skips reduced motion). */
function animateCounts(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  container.querySelectorAll('.stat-value').forEach((node) => {
    const target = Number(node.textContent);
    if (!Number.isFinite(target) || target <= 0) return;
    const start = performance.now();
    const duration = Math.min(900, 300 + target * 60);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      node.textContent = String(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function taskQuickList(tasks, ctx, coach) {
  if (!tasks.length) {
    return el('div', { className: 'empty soft', text: '今天还没有任务' });
  }
  const sorted = [
    ...tasks.filter((task) => !task.done).sort((a, b) => {
      const ai = coach.rankedTasks.findIndex((item) => item.id === a.id);
      const bi = coach.rankedTasks.findIndex((item) => item.id === b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }),
    ...tasks.filter((task) => task.done),
  ];
  return el(
    'div',
    { className: 'list' },
    sorted.slice(0, 8).map((t) =>
      el('div', { className: `list-item compact${t.done ? ' done' : ''}` }, [
        el('input', {
          type: 'checkbox',
          checked: t.done,
          onChange: () => {
            toggleTask(t.id);
          },
        }),
        el('div', { className: 'item-body' }, [
          el('div', { className: 'item-title', text: t.text }),
        ]),
        !t.done
          ? el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: '番茄',
            title: '关联并开始',
            onClick: () => {
              pomodoro.setTaskId(t.id);
              pomodoro.setMode('focus');
              ctx.navigate('timer');
              pomodoro.start();
            },
          })
          : null,
      ]),
    ),
  );
}

function quickAddTask(date) {
  const input = el('input', {
    type: 'text',
    placeholder: '添加今日任务，回车保存',
    autocomplete: 'off',
  });
  const form = el(
    'form',
    {
      className: 'btn-row quick-add',
      onSubmit: (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        addTask({ text: input.value, date });
        input.value = '';
      },
    },
    [
      input,
      el('button', {
        type: 'submit',
        className: 'btn btn-primary btn-sm',
        text: '添加',
      }),
    ],
  );
  input.style.flex = '1';
  return form;
}

function miniWeekBars(week) {
  const maxMin = Math.max(1, ...week.map((d) => d.minutes));
  return el(
    'div',
    { className: 'mini-week' },
    week.map((d) => {
      const h = Math.max(4, (d.minutes / maxMin) * 72);
      return el('div', { className: 'mini-week-col', title: `${d.date} · ${d.minutes} 分钟` }, [
        el('div', {
          className: 'mini-week-bar',
          style: {
            height: `${h}px`,
            opacity: d.minutes ? '1' : '0.3',
          },
        }),
        el('div', { className: 'mini-week-label', text: d.label }),
        el('div', {
          className: 'mini-week-val',
          text: d.minutes ? String(d.minutes) : '·',
        }),
      ]);
    }),
  );
}

function summaryBanner(data, today) {
  const taskCount = data.tasks.filter((t) => t.date === today && t.done).length;
  const ieltsCount = data.ielts.filter((i) => i.date === today).length;
  const focusCount = data.sessions.filter((s) => s.date === today && s.type === 'focus').length;
  const reviewCount = (data.reviewLogs || []).filter((log) => {
    const reviewedAt = new Date(log.reviewedAt || '');
    return !Number.isNaN(reviewedAt.getTime()) && todayStr(reviewedAt) === today;
  }).length;
  const parts = [];
  if (focusCount) parts.push(`🍅 ${focusCount} 个番茄`);
  if (taskCount) parts.push(`✅ ${taskCount} 项任务`);
  if (ieltsCount) parts.push(`🎯 ${ieltsCount} 次雅思`);
  if (reviewCount) parts.push(`${reviewCount} 项复习`);
  if (!parts.length) return null;
  return el('div', {
    className: 'card',
    style: {
      background: 'var(--accent-soft-var)',
      borderColor: 'transparent',
      fontSize: '0.9rem',
      fontWeight: 600,
      textAlign: 'center',
      padding: '12px',
    },
    text: `今天已记录 · ${parts.join(' · ')}`,
  });
}
