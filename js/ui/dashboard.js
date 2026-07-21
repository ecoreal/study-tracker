import { el } from './components.js';
import { getData, todayStr, toggleTask, addTask } from '../store.js';
import { streakDays, todayFocusStats, todayTasksStats } from '../stats.js';
import { formatBand } from '../ielts.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (v: string) => void }} ctx
 */
export function renderDashboard(root, ctx) {
  const data = getData();
  const today = todayStr();
  const focus = todayFocusStats(data, today);
  const tasks = todayTasksStats(data, today);
  const streak = streakDays(data);
  const todayTasks = data.tasks.filter((t) => t.date === today);
  const recentLog = data.logs.find((l) => l.date === today) || data.logs[0];
  const recentIelts = data.ielts.find((i) => i.date === today) || data.ielts[0];

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '今日' }),
          el('p', { text: `${today} · 保持节奏，完成比完美更重要` }),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '开始番茄钟',
            onClick: () => {
              ctx.navigate('timer');
              pomodoro.setMode('focus');
              pomodoro.start();
            },
          }),
        ]),
      ]),

      el('div', { className: 'grid-4' }, [
        stat('今日番茄', String(focus.count), `${focus.minutes} 分钟专注`),
        stat('专注时长', `${focus.minutes}`, '分钟'),
        stat(
          '待办完成',
          tasks.total ? `${tasks.done}/${tasks.total}` : '0',
          tasks.total ? `${Math.round(tasks.rate * 100)}%` : '暂无任务',
        ),
        stat('连续学习', String(streak), '天'),
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
        ]),

        el('section', { className: 'card' }, [
          el('div', { className: 'card-header' }, [
            el('h3', { text: '动态摘要' }),
          ]),
          el('div', { className: 'list' }, [
            el('div', { className: 'list-item' }, [
              el('div', { className: 'item-body' }, [
                el('div', { className: 'item-title', text: '最近学习日志' }),
                el('div', {
                  className: 'item-meta',
                  text: recentLog
                    ? `${recentLog.date} · ${recentLog.subject} · ${recentLog.minutes || 0} 分钟 — ${recentLog.content || '（无内容）'}`
                    : '还没有日志，去「日志」写一条吧',
                }),
              ]),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '写日志',
                onClick: () => ctx.navigate('logs'),
              }),
            ]),
            el('div', { className: 'list-item' }, [
              el('div', { className: 'item-body' }, [
                el('div', { className: 'item-title', text: '最近雅思成绩' }),
                el('div', {
                  className: 'item-meta',
                  text: recentIelts
                    ? `${recentIelts.date} · ${recentIelts.paper || '未命名试卷'} · Overall ${formatBand(recentIelts.overall)}`
                    : '还没有成绩记录，去「雅思」录入真题得分',
                }),
              ]),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '录入',
                onClick: () => ctx.navigate('ielts'),
              }),
            ]),
            el('div', { className: 'list-item' }, [
              el('div', { className: 'item-body' }, [
                el('div', { className: 'item-title', text: '统计与打卡' }),
                el('div', {
                  className: 'item-meta',
                  text: `连续 ${streak} 天 · 查看本周专注与热力图`,
                }),
              ]),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '打开',
                onClick: () => ctx.navigate('stats'),
              }),
            ]),
          ]),
        ]),
      ]),
    ]),
  );
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
    return el('div', { className: 'empty', text: '今天还没有任务' });
  }
  return el(
    'div',
    { className: 'list' },
    tasks.slice(0, 6).map((t) =>
      el('div', { className: `list-item${t.done ? ' done' : ''}` }, [
        el('input', {
          type: 'checkbox',
          checked: t.done,
          onChange: () => {
            toggleTask(t.id);
            ctx.refresh();
          },
        }),
        el('div', { className: 'item-body' }, [
          el('div', { className: 'item-title', text: t.text }),
        ]),
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
  const form = el('form', {
    className: 'btn-row',
    style: { marginTop: '12px' },
    onSubmit: (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      addTask({ text: input.value, date });
      input.value = '';
      // parent will re-render via store subscription in main
    },
  }, [
    input,
    el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: '添加' }),
  ]);
  input.style.flex = '1';
  return form;
}
