import { el, progressBar } from './components.js';
import { getData, todayStr, toggleTask, addTask } from '../store.js';
import { streakDays, todayFocusStats, todayTasksStats, weekFocusMinutes } from '../stats.js';
import { formatBand, bandOf } from '../ielts.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (v: string) => void, refresh: () => void }} ctx
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

  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  const greet = greeting();
  const live = createLiveTimer(ctx);

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: greet }),
          el('p', { text: `${today} 星期${weekday} · 连续学习 ${streak} 天` }),
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
        stat('今日番茄', String(focus.count), `目标 ${countGoal} 个`),
        stat('专注时长', `${focus.minutes} 分`, focus.minutes ? `目标 ${minGoal} 分钟` : '目标 120 分钟'),
        stat(
          '待办完成',
          tasks.total ? `${tasks.done}/${tasks.total}` : '0',
          tasks.total ? `${Math.round(tasks.rate * 100)}%` : '添加一个任务吧',
        ),
        stat('本周专注', `${weekTotal}`, '分钟'),
      ]),

      /* 今日概览横幅 */
      summaryBanner(data, today),

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
          taskQuickList(todayTasks, ctx),
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

  root._cleanup = () => live.unsub();
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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了，注意休息';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了，注意休息';
}

function stat(label, value, hint) {
  return el('div', { className: 'card stat-card' }, [
    el('div', { className: 'stat-label', text: label }),
    el('div', { className: 'stat-value', text: value }),
    el('div', { className: 'stat-hint', text: hint }),
  ]);
}

function taskQuickList(tasks, ctx) {
  if (!tasks.length) {
    return el('div', { className: 'empty soft', text: '今天还没有任务' });
  }
  return el(
    'div',
    { className: 'list' },
    tasks.slice(0, 8).map((t) =>
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
  const parts = [];
  if (focusCount) parts.push(`🍅 ${focusCount} 个番茄`);
  if (taskCount) parts.push(`✅ ${taskCount} 项任务`);
  if (ieltsCount) parts.push(`🎯 ${ieltsCount} 次雅思`);
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
