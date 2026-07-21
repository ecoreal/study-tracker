import { el, toast } from './components.js';
import {
  getData,
  addLog,
  updateLog,
  removeLog,
  todayStr,
} from '../store.js';

/**
 * @param {HTMLElement} root
 */
export function renderLogs(root) {
  const data = getData();
  let filterDate = todayStr();

  const dateInput = el('input', {
    type: 'date',
    value: filterDate,
    onChange: (e) => {
      filterDate = e.target.value || todayStr();
      paint();
    },
  });

  const subjectSelect = el(
    'select',
    {},
    data.settings.subjects.map((s) => el('option', { value: s, text: s })),
  );

  const contentInput = el('textarea', { placeholder: '学了什么？有什么收获？' });
  const minutesInput = el('input', {
    type: 'number',
    min: '0',
    step: '5',
    value: '30',
    placeholder: '分钟',
  });

  const listRoot = el('div');

  const form = el('form', {
    className: 'card form-grid',
    onSubmit: (e) => {
      e.preventDefault();
      const log = addLog({
        date: filterDate,
        subject: subjectSelect.value,
        content: contentInput.value,
        minutes: minutesInput.value,
      });
      if (!log) {
        toast('请填写内容或时长', 'error');
        return;
      }
      contentInput.value = '';
      toast('日志已保存', 'success');
    },
  }, [
    el('div', { className: 'card-header' }, [el('h3', { text: '写学习日志' })]),
    el('div', { className: 'form-row inline' }, [
      el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateInput]),
      el('div', { className: 'form-row' }, [el('label', { text: '科目' }), subjectSelect]),
      el('div', { className: 'form-row' }, [el('label', { text: '时长（分钟）' }), minutesInput]),
    ]),
    el('div', { className: 'form-row' }, [el('label', { text: '内容' }), contentInput]),
    el('div', { className: 'btn-row' }, [
      el('button', { type: 'submit', className: 'btn btn-primary', text: '保存日志' }),
    ]),
  ]);

  function paint() {
    listRoot.replaceChildren();
    // refresh subjects if settings changed
    const subjects = getData().settings.subjects;
    const cur = subjectSelect.value;
    subjectSelect.replaceChildren(...subjects.map((s) => el('option', { value: s, text: s })));
    if (subjects.includes(cur)) subjectSelect.value = cur;

    const items = getData().logs.filter((l) => l.date === filterDate);
    if (!items.length) {
      listRoot.append(el('div', { className: 'empty', text: '这一天还没有学习日志' }));
      return;
    }
    listRoot.append(
      el(
        'div',
        { className: 'list' },
        items.map((l) =>
          el('div', { className: 'list-item' }, [
            el('div', { className: 'item-body' }, [
              el('div', { className: 'item-title' }, [
                el('span', { className: 'badge', text: l.subject }),
                document.createTextNode(` ${l.content || '（无文字）'}`),
              ]),
              el('div', {
                className: 'item-meta',
                text: `${l.date} · ${l.minutes || 0} 分钟`,
              }),
            ]),
            el('div', { className: 'item-actions' }, [
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '编辑',
                onClick: () => {
                  const content = prompt('内容', l.content || '');
                  if (content == null) return;
                  const minutes = prompt('分钟', String(l.minutes || 0));
                  if (minutes == null) return;
                  updateLog(l.id, { content, minutes: Number(minutes) || 0 });
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: () => {
                  if (confirm('删除这条日志？')) removeLog(l.id);
                },
              }),
            ]),
          ]),
        ),
      ),
    );
  }

  paint();

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '学习日志' }),
          el('p', { text: '记录每天学了什么，方便复盘。' }),
        ]),
      ]),
      form,
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '当日记录' }),
          el('span', { className: 'badge', text: filterDate }),
        ]),
        listRoot,
      ]),
    ]),
  );

  // expose paint for external? main re-renders whole view
  root._paintLogs = paint;
}
