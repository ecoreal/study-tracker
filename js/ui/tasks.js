import { el, toast, dateInputValue } from './components.js';
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
  const data = getData();
  let filterDate = todayStr();

  const dateInput = el('input', {
    type: 'date',
    value: filterDate,
    onChange: (e) => {
      filterDate = e.target.value || todayStr();
      paintList();
    },
  });

  const listRoot = el('div');

  const textInput = el('input', {
    type: 'text',
    placeholder: '新任务内容',
    autocomplete: 'off',
  });

  const form = el('form', {
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
  }, [
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
        },
      }),
    ]),
  ]);

  function paintList() {
    listRoot.replaceChildren();
    const items = getData().tasks.filter((t) => t.date === filterDate);
    if (!items.length) {
      listRoot.append(el('div', { className: 'empty', text: '这一天还没有任务' }));
      return;
    }
    listRoot.append(
      el(
        'div',
        { className: 'list' },
        items.map((t) =>
          el('div', { className: `list-item${t.done ? ' done' : ''}` }, [
            el('input', {
              type: 'checkbox',
              checked: t.done,
              onChange: () => toggleTask(t.id),
            }),
            el('div', { className: 'item-body' }, [
              el('div', { className: 'item-title', text: t.text }),
              el('div', { className: 'item-meta', text: t.done ? '已完成' : '进行中' }),
            ]),
            el('div', { className: 'item-actions' }, [
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-primary',
                text: '番茄',
                onClick: () => {
                  pomodoro.setTaskId(t.id);
                  pomodoro.setMode('focus');
                  ctx.navigate('timer');
                  toast('已关联任务，可直接开始', 'success');
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '编辑',
                onClick: () => {
                  const next = prompt('修改任务', t.text);
                  if (next != null && next.trim()) updateTask(t.id, { text: next.trim() });
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: () => {
                  if (confirm('删除该任务？')) removeTask(t.id);
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
          el('span', { className: 'badge', text: filterDate }),
        ]),
        listRoot,
      ]),
    ]),
  );

  // re-paint when store changes while this view is alive is handled by main re-render
  void dateInputValue;
}
