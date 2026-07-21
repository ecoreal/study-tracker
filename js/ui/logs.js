import { el, toast, promptModal, modal } from './components.js';
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
      badge.textContent = filterDate;
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
  const badge = el('span', { className: 'badge', text: filterDate });
  const summary = el('p', { className: 'help', text: '' });

  const form = el(
    'form',
    {
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
    },
    [
      el('div', { className: 'card-header' }, [el('h3', { text: '写学习日志' })]),
      el('div', { className: 'form-row inline' }, [
        el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateInput]),
        el('div', { className: 'form-row' }, [el('label', { text: '科目' }), subjectSelect]),
        el('div', { className: 'form-row' }, [el('label', { text: '时长（分钟）' }), minutesInput]),
      ]),
      el('div', { className: 'form-row' }, [el('label', { text: '内容' }), contentInput]),
      el('div', { className: 'btn-row' }, [
        el('button', { type: 'submit', className: 'btn btn-primary', text: '保存日志' }),
        ...[15, 25, 30, 45, 60].map((m) =>
          el('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            text: `${m}分`,
            onClick: () => {
              minutesInput.value = String(m);
            },
          }),
        ),
      ]),
    ],
  );

  function paint() {
    listRoot.replaceChildren();
    const subjects = getData().settings.subjects;
    const cur = subjectSelect.value;
    subjectSelect.replaceChildren(...subjects.map((s) => el('option', { value: s, text: s })));
    if (subjects.includes(cur)) subjectSelect.value = cur;

    const items = getData().logs.filter((l) => l.date === filterDate);
    const totalMin = items.reduce((a, l) => a + (l.minutes || 0), 0);
    summary.textContent = items.length
      ? `${items.length} 条 · 合计 ${totalMin} 分钟`
      : '这一天还没有学习日志';

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
                onClick: async () => {
                  const content = await promptModal({
                    title: '编辑日志',
                    label: '内容',
                    value: l.content || '',
                    multiline: true,
                  });
                  if (content == null) return;
                  const minutes = await promptModal({
                    title: '编辑时长',
                    label: '分钟',
                    value: String(l.minutes || 0),
                  });
                  if (minutes == null) return;
                  updateLog(l.id, { content, minutes: Number(minutes) || 0 });
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: async () => {
                  const ok = await modal({
                    title: '删除日志',
                    body: el('p', { text: '确定删除这条日志？' }),
                    confirmText: '删除',
                    danger: true,
                  });
                  if (ok) removeLog(l.id);
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
          badge,
        ]),
        summary,
        listRoot,
      ]),
    ]),
  );
}
