import { el, toast, promptModal, modal } from './components.js';
import {
  getData,
  addTask,
  toggleTask,
  removeTask,
  updateTask,
  rolloverOpenTasksToToday,
  todayStr,
} from '../store.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (v: string) => void, refresh: () => void }} ctx
 */
export function renderTasks(root, ctx) {
  let filterDate = todayStr();

  const dateInput = el('input', {
    type: 'date',
    value: filterDate,
    onChange: (e) => {
      filterDate = e.target.value || todayStr();
      paintList();
      badge.textContent = filterDate;
    },
  });

  const listRoot = el('div');
  const badge = el('span', { className: 'badge', text: filterDate });
  const summary = el('p', { className: 'help', text: '' });

  const textInput = el('input', {
    type: 'text',
    placeholder: '新任务内容',
    autocomplete: 'off',
  });

  const form = el(
    'form',
    {
      className: 'card form-grid',
      onSubmit: (e) => {
        e.preventDefault();
        const t = addTask({ text: textInput.value, date: filterDate });
        if (!t) {
          toast('请输入任务内容', 'error');
          return;
        }
        textInput.value = '';
        toast('已添加任务', 'success');
      },
    },
    [
      el('div', { className: 'card-header' }, [el('h3', { text: '添加任务' })]),
      el('div', { className: 'form-row inline' }, [
        el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateInput]),
        el('div', { className: 'form-row' }, [el('label', { text: '内容' }), textInput]),
      ]),
      el('div', { className: 'btn-row' }, [
        el('button', { type: 'submit', className: 'btn btn-primary', text: '添加' }),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          text: '未完成结转到今天',
          onClick: () => {
            const n = rolloverOpenTasksToToday();
            toast(n ? `已结转 ${n} 项到今天` : '没有需要结转的任务', n ? 'success' : 'info');
            filterDate = todayStr();
            dateInput.value = filterDate;
            badge.textContent = filterDate;
          },
        }),
      ]),
    ],
  );

  function paintList() {
    listRoot.replaceChildren();
    const items = getData().tasks.filter((t) => t.date === filterDate);
    const done = items.filter((t) => t.done).length;
    summary.textContent = items.length
      ? `共 ${items.length} 项 · 完成 ${done} · 未完成 ${items.length - done}`
      : '这一天还没有任务';

    if (!items.length) {
      listRoot.append(el('div', { className: 'empty', text: '这一天还没有任务' }));
      return;
    }

    // open first, then done
    const sorted = [
      ...items.filter((t) => !t.done),
      ...items.filter((t) => t.done),
    ];

    listRoot.append(
      el(
        'div',
        { className: 'list' },
        sorted.map((t) =>
          el('div', { className: `list-item${t.done ? ' done' : ''}` }, [
            el('input', {
              type: 'checkbox',
              checked: t.done,
              onChange: () => toggleTask(t.id),
            }),
            el('div', { className: 'item-body' }, [
              el('div', { className: 'item-title', text: t.text }),
              el('div', {
                className: 'item-meta',
                text: t.done ? '已完成' : '进行中',
              }),
            ]),
            el('div', { className: 'item-actions' }, [
              !t.done
                ? el('button', {
                  type: 'button',
                  className: 'btn btn-sm btn-primary',
                  text: '番茄',
                  onClick: () => {
                    pomodoro.setTaskId(t.id);
                    pomodoro.setMode('focus');
                    ctx.navigate('timer');
                    toast('已关联任务，可直接开始', 'success');
                  },
                })
                : null,
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '编辑',
                onClick: async () => {
                  const next = await promptModal({
                    title: '编辑任务',
                    label: '内容',
                    value: t.text,
                  });
                  if (next != null && next.trim()) updateTask(t.id, { text: next.trim() });
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: async () => {
                  const ok = await modal({
                    title: '删除任务',
                    body: el('p', { text: `确定删除「${t.text}」？` }),
                    confirmText: '删除',
                    danger: true,
                  });
                  if (ok) removeTask(t.id);
                },
              }),
            ]),
          ]),
        ),
      ),
    );
  }

  paintList();

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '任务' }),
          el('p', { text: '按天管理待办，可一键关联番茄钟。' }),
        ]),
      ]),
      form,
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '任务列表' }),
          badge,
        ]),
        summary,
        listRoot,
      ]),
    ]),
  );
}
