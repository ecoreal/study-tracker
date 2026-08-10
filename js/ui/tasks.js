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

let selectedDate = todayStr();
let refocusQuickAdd = false;

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (v: string) => void }} ctx
 */
export function renderTasks(root, ctx) {
  let filterDate = selectedDate || todayStr();

  const dateInput = el('input', {
    type: 'date',
    value: filterDate,
    'aria-label': '任务日期',
    onChange: (e) => setDate(e.target.value || todayStr()),
  });
  const listRoot = el('div');
  const dateBadge = el('span', { className: 'badge muted', text: dateLabel(filterDate) });
  const summary = el('p', { className: 'help task-summary', text: '' });
  const textInput = el('input', {
    type: 'text',
    placeholder: '输入任务，按回车添加',
    autocomplete: 'off',
    dataset: { role: 'task-quick-add' },
    'aria-label': '新任务内容',
  });

  function setDate(next) {
    filterDate = next;
    selectedDate = next;
    dateInput.value = next;
    dateBadge.textContent = dateLabel(next);
    paintList();
  }

  function shiftDate(days) {
    const [y, m, d] = filterDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + days);
    setDate(todayStr(next));
  }

  const quickForm = el('form', {
    className: 'task-quick-form',
    onSubmit: (e) => {
      e.preventDefault();
      const task = addTask({ text: textInput.value, date: filterDate });
      if (!task) {
        toast('请输入任务内容', 'error');
        textInput.focus();
        return;
      }
      refocusQuickAdd = true;
      toast('任务已添加', 'success');
    },
  }, [
    textInput,
    el('button', { type: 'submit', className: 'btn btn-primary', text: '添加' }),
  ]);

  const dateToolbar = el('div', { className: 'task-date-toolbar' }, [
    el('button', {
      type: 'button',
      className: 'btn btn-ghost btn-icon task-date-prev',
      text: '←',
      title: '前一天',
      'aria-label': '查看前一天',
      onClick: () => shiftDate(-1),
    }),
    dateInput,
    el('button', {
      type: 'button',
      className: 'btn btn-ghost task-today-btn',
      text: '今天',
      onClick: () => setDate(todayStr()),
    }),
    el('button', {
      type: 'button',
      className: 'btn btn-ghost btn-icon task-date-next',
      text: '→',
      title: '后一天',
      'aria-label': '查看后一天',
      onClick: () => shiftDate(1),
    }),
  ]);

  function paintList() {
    listRoot.replaceChildren();
    const items = getData().tasks.filter((task) => task.date === filterDate);
    const done = items.filter((task) => task.done).length;
    summary.textContent = items.length
      ? `${items.length} 项 · ${done} 项完成 · ${items.length - done} 项待办`
      : '这一天还没有任务';

    if (!items.length) {
      listRoot.append(el('div', { className: 'empty soft', text: '暂无任务' }));
      return;
    }

    const sorted = [...items.filter((task) => !task.done), ...items.filter((task) => task.done)];
    listRoot.append(el('div', { className: 'list' }, sorted.map((task) =>
      el('div', { className: `list-item task-item${task.done ? ' done' : ''}` }, [
        el('input', {
          type: 'checkbox',
          checked: task.done,
          'aria-label': `${task.done ? '标记为未完成' : '标记为已完成'}：${task.text}`,
          onChange: () => toggleTask(task.id),
        }),
        el('div', { className: 'item-body' }, [
          el('div', { className: 'item-title', text: task.text }),
          el('div', { className: 'item-meta', text: task.done ? '已完成' : '待完成' }),
        ]),
        el('div', { className: 'item-actions' }, [
          !task.done ? el('button', {
            type: 'button',
            className: 'btn btn-sm btn-primary',
            text: '专注',
            title: '关联到番茄钟',
            onClick: () => {
              pomodoro.setTaskId(task.id);
              pomodoro.setMode('focus');
              ctx.navigate('timer');
              toast('任务已关联，可开始专注', 'success');
            },
          }) : null,
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: '编辑',
            onClick: async () => {
              const next = await promptModal({ title: '编辑任务', label: '内容', value: task.text });
              if (next != null && next.trim()) {
                updateTask(task.id, { text: next.trim() });
                toast('任务已更新', 'success');
              }
            },
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-danger',
            text: '删除',
            onClick: async () => {
              const ok = await modal({
                title: '删除任务',
                body: el('p', { text: `确定删除「${task.text}」？` }),
                confirmText: '删除',
                danger: true,
              });
              if (ok) {
                removeTask(task.id);
                toast('任务已删除', 'info');
              }
            },
          }),
        ]),
      ]),
    )));
  }

  paintList();

  root.append(el('div', { className: 'view' }, [
    el('div', { className: 'view-header' }, [
      el('div', {}, [
        el('h2', { text: '任务' }),
        el('p', { text: '安排当天任务，需要时直接进入专注。' }),
      ]),
      dateBadge,
    ]),
    el('section', { className: 'card task-board' }, [
      dateToolbar,
      quickForm,
      el('div', { className: 'task-list-head' }, [
        summary,
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-ghost',
          text: '结转未完成',
          title: '把过去日期的未完成任务移到今天',
          onClick: () => {
            selectedDate = todayStr();
            filterDate = selectedDate;
            const count = rolloverOpenTasksToToday();
            if (!count) setDate(selectedDate);
            toast(count ? `已结转 ${count} 项到今天` : '没有需要结转的任务', count ? 'success' : 'info');
          },
        }),
      ]),
      listRoot,
    ]),
  ]));

  if (refocusQuickAdd) {
    refocusQuickAdd = false;
    requestAnimationFrame(() => textInput.focus());
  }
}

function dateLabel(date) {
  const today = todayStr();
  if (date === today) return '今天';
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const delta = Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
  if (delta === -1) return '昨天';
  if (delta === 1) return '明天';
  return `${m} 月 ${d} 日`;
}
