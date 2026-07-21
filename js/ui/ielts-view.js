import { el, toast } from './components.js';
import {
  getData,
  addIelts,
  updateIelts,
  removeIelts,
  todayStr,
} from '../store.js';
import { computeOverall, formatBand, bandOptions } from '../ielts.js';

/**
 * @param {HTMLElement} root
 */
export function renderIelts(root) {
  let range = '30'; // 7 | 30 | all

  const dateInput = el('input', { type: 'date', value: todayStr() });
  const paperInput = el('input', {
    type: 'text',
    placeholder: '例如 C18 T2 / 剑 19 Test 1',
    autocomplete: 'off',
  });
  const modeSelect = el('select', {}, [
    el('option', { value: 'full', text: '全套' }),
    el('option', { value: 'listening', text: '听力' }),
    el('option', { value: 'reading', text: '阅读' }),
    el('option', { value: 'writing', text: '写作' }),
    el('option', { value: 'speaking', text: '口语' }),
  ]);

  const bands = bandOptions();
  const mkBand = (name, label) => {
    const sel = el('select', { name }, [
      el('option', { value: '', text: '—' }),
      ...bands.map((b) => el('option', { value: b, text: b })),
    ]);
    return el('div', { className: 'form-row' }, [el('label', { text: label }), sel]);
  };

  const L = mkBand('listening', 'Listening');
  const R = mkBand('reading', 'Reading');
  const W = mkBand('writing', 'Writing');
  const S = mkBand('speaking', 'Speaking');
  const O = mkBand('overall', 'Overall（可自动）');
  const notes = el('textarea', { placeholder: '错题、范文、口语话题备注…' });

  const autoBtn = el('button', {
    type: 'button',
    className: 'btn btn-sm btn-ghost',
    text: '按四科自动算 Overall',
    onClick: () => {
      const o = computeOverall(
        num(L),
        num(R),
        num(W),
        num(S),
      );
      if (o == null) {
        toast('请先填满四科分数', 'error');
        return;
      }
      O.querySelector('select').value = o.toFixed(1);
      toast(`Overall = ${o.toFixed(1)}`, 'success');
    },
  });

  function num(wrap) {
    const v = wrap.querySelector('select').value;
    return v === '' ? null : Number(v);
  }

  const form = el('form', {
    className: 'card form-grid',
    onSubmit: (e) => {
      e.preventDefault();
      let overall = num(O);
      const listening = num(L);
      const reading = num(R);
      const writing = num(W);
      const speaking = num(S);
      if (modeSelect.value === 'full' && overall == null) {
        overall = computeOverall(listening, reading, writing, speaking);
      }
      if (
        listening == null &&
        reading == null &&
        writing == null &&
        speaking == null &&
        overall == null
      ) {
        toast('请至少填写一个分数', 'error');
        return;
      }
      addIelts({
        date: dateInput.value || todayStr(),
        paper: paperInput.value,
        mode: modeSelect.value,
        listening,
        reading,
        writing,
        speaking,
        overall,
        notes: notes.value,
      });
      paperInput.value = '';
      notes.value = '';
      for (const wrap of [L, R, W, S, O]) wrap.querySelector('select').value = '';
      toast('雅思成绩已记录', 'success');
    },
  }, [
    el('div', { className: 'card-header' }, [
      el('h3', { text: '录入真题得分' }),
      autoBtn,
    ]),
    el('div', { className: 'form-row inline' }, [
      el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateInput]),
      el('div', { className: 'form-row' }, [el('label', { text: '试卷' }), paperInput]),
      el('div', { className: 'form-row' }, [el('label', { text: '模式' }), modeSelect]),
    ]),
    el('div', { className: 'form-row inline' }, [L, R, W, S, O]),
    el('div', { className: 'form-row' }, [el('label', { text: '备注' }), notes]),
    el('div', { className: 'btn-row' }, [
      el('button', { type: 'submit', className: 'btn btn-primary', text: '保存成绩' }),
    ]),
  ]);

  const chartRoot = el('div');
  const listRoot = el('div');
  const rangeTabs = el('div', { className: 'btn-row' }, [
    rangeBtn('7', '近 7 天'),
    rangeBtn('30', '近 30 天'),
    rangeBtn('all', '全部'),
  ]);

  function rangeBtn(key, label) {
    return el('button', {
      type: 'button',
      className: `btn btn-sm btn-ghost${range === key ? ' btn-primary' : ''}`,
      dataset: { range: key },
      text: label,
      onClick: () => {
        range = key;
        rangeTabs.querySelectorAll('button').forEach((b) => {
          b.className = `btn btn-sm btn-ghost${b.dataset.range === range ? ' btn-primary' : ''}`;
        });
        paint();
      },
    });
  }

  function filtered() {
    const all = [...getData().ielts].sort((a, b) => a.date.localeCompare(b.date));
    if (range === 'all') return all;
    const days = Number(range);
    const cut = new Date();
    cut.setDate(cut.getDate() - days);
    const key = todayStr(cut);
    return all.filter((i) => i.date >= key);
  }

  function paint() {
    const items = filtered();
    // chart
    chartRoot.replaceChildren();
    const withOverall = items.filter((i) => i.overall != null);
    if (withOverall.length >= 2) {
      chartRoot.append(sparkline(withOverall));
    } else {
      chartRoot.append(
        el('div', {
          className: 'empty',
          text: withOverall.length ? '至少 2 条 Overall 才会显示趋势' : '暂无 Overall 数据',
        }),
      );
    }

    listRoot.replaceChildren();
    const desc = [...items].reverse();
    if (!desc.length) {
      listRoot.append(el('div', { className: 'empty', text: '这个范围内还没有记录' }));
      return;
    }
    listRoot.append(
      el(
        'div',
        { className: 'list' },
        desc.map((item) =>
          el('div', { className: 'list-item' }, [
            el('div', { className: 'item-body' }, [
              el('div', { className: 'item-title' }, [
                el('span', {
                  className: 'badge accent',
                  text: item.paper || '未命名',
                }),
                document.createTextNode(` ${item.date} · ${modeLabel(item.mode)}`),
              ]),
              el('div', { className: 'score-grid', style: { marginTop: '8px' } }, [
                scorePill('L', item.listening),
                scorePill('R', item.reading),
                scorePill('W', item.writing),
                scorePill('S', item.speaking),
                scorePill('OVR', item.overall, true),
              ]),
              item.notes
                ? el('div', { className: 'item-meta', text: item.notes })
                : null,
            ]),
            el('div', { className: 'item-actions' }, [
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '改 Overall',
                onClick: () => {
                  const v = prompt('Overall (0-9, 0.5 步进)', formatBand(item.overall));
                  if (v == null) return;
                  updateIelts(item.id, { overall: v === '' ? null : Number(v) });
                },
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: () => {
                  if (confirm('删除这条成绩？')) removeIelts(item.id);
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
          el('h2', { text: '雅思真题得分' }),
          el('p', { text: '记录每日/每次练习分数，跟踪 Overall 趋势。' }),
        ]),
      ]),
      form,
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: 'Overall 趋势' }),
          rangeTabs,
        ]),
        chartRoot,
      ]),
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [el('h3', { text: '历史记录' })]),
        listRoot,
      ]),
    ]),
  );
}

function modeLabel(m) {
  return (
    {
      full: '全套',
      listening: '听力',
      reading: '阅读',
      writing: '写作',
      speaking: '口语',
    }[m] || m
  );
}

function scorePill(k, v, overall = false) {
  return el('div', { className: `score-pill${overall ? ' overall' : ''}` }, [
    el('div', { className: 'k', text: k }),
    el('div', { className: 'v', text: formatBand(v) }),
  ]);
}

function sparkline(items) {
  const w = 640;
  const h = 160;
  const pad = 24;
  const vals = items.map((i) => Number(i.overall));
  const min = Math.min(...vals, 5);
  const max = Math.max(...vals, 7);
  const span = Math.max(0.5, max - min);

  const pts = items.map((item, idx) => {
    const x = pad + (idx * (w - pad * 2)) / Math.max(1, items.length - 1);
    const y = h - pad - ((Number(item.overall) - min) / span) * (h - pad * 2);
    return { x, y, item };
  });

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const axis = document.createElementNS(svgNS, 'line');
  axis.setAttribute('class', 'axis');
  axis.setAttribute('x1', String(pad));
  axis.setAttribute('x2', String(w - pad));
  axis.setAttribute('y1', String(h - pad));
  axis.setAttribute('y2', String(h - pad));
  svg.append(axis);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'line');
  path.setAttribute('d', d);
  svg.append(path);

  for (const p of pts) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '4');
    c.innerHTML = `<title>${p.item.date} · ${formatBand(p.item.overall)} · ${p.item.paper || ''}</title>`;
    // title as attribute alternative
    c.setAttribute('title', `${p.item.date}: ${formatBand(p.item.overall)}`);
    svg.append(c);
  }

  // labels under chart
  const labels = el('div', {
    className: 'item-meta',
    style: { marginTop: '8px' },
    text: `${items[0].date} → ${items[items.length - 1].date} · ${items.length} 次 · 最新 ${formatBand(items[items.length - 1].overall)}`,
  });

  return el('div', {}, [svg, labels]);
}
