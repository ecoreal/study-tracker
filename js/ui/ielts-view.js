import { el, toast, modal } from './components.js';
import {
  getData,
  addIelts,
  updateIelts,
  removeIelts,
  todayStr,
} from '../store.js';
import {
  computeOverall,
  formatBand,
  bandOptions,
  bandOf,
  hasDetail,
  correctRatePct,
} from '../ielts.js';

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
  const mkPct = (name, label, placeholder = '如 0.75') =>
    el('div', { className: 'form-row section-mini' }, [
      el('label', { text: label }),
      el('input', { name, type: 'text', placeholder, autocomplete: 'off' }),
    ]);
  const mkMistakes = (name, label) =>
    el('div', { className: 'form-row section-mistakes' }, [
      el('label', { text: label }),
      el('textarea', { name, placeholder: '每行一条：题干 / 错原因…', rows: 2 }),
    ]);

  const L = mkBand('listening', 'Listening');
  const Lrate = mkPct('listeningRate', '正确率', '0.00 ~ 1.00');
  const Lmis = mkMistakes('listeningMistakes', '听力错题');
  const R = mkBand('reading', 'Reading');
  const Rrate = mkPct('readingRate', '正确率', '0.00 ~ 1.00');
  const Rmis = mkMistakes('readingMistakes', '阅读错题');
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
  function rateVal(wrap) {
    if (!wrap) return null;
    const v = wrap.querySelector('input').value.trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  function mistakesVal(wrap) {
    if (!wrap) return [];
    return wrap
      .querySelector('textarea')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const form = el('form', {
    className: 'card form-grid',
    onSubmit: (e) => {
      e.preventDefault();
      let overall = num(O);
      const listeningBand = num(L);
      const readingBand = num(R);
      const listening = {
        band: listeningBand,
        correctRate: rateVal(Lrate),
        mistakes: mistakesVal(Lmis),
      };
      const reading = {
        band: readingBand,
        correctRate: rateVal(Rrate),
        mistakes: mistakesVal(Rmis),
      };
      const hasListening =
        listeningBand != null ||
        (listening.correctRate != null && listening.correctRate > 0) ||
        listening.mistakes.length > 0;
      const hasReading =
        readingBand != null ||
        (reading.correctRate != null && reading.correctRate > 0) ||
        reading.mistakes.length > 0;
      const writing = num(W);
      const speaking = num(S);
      if (modeSelect.value === 'full' && overall == null) {
        overall = computeOverall(
          listeningBand,
          readingBand,
          writing,
          speaking,
        );
      }
      if (
        !hasListening &&
        !hasReading &&
        writing == null &&
        speaking == null &&
        overall == null
      ) {
        toast('请至少填写一个分数或正确率 / 错题', 'error');
        return;
      }
      addIelts({
        date: dateInput.value || todayStr(),
        paper: paperInput.value,
        mode: modeSelect.value,
        listening: hasListening ? listening : null,
        reading: hasReading ? reading : null,
        writing,
        speaking,
        overall,
        notes: notes.value,
      });
      paperInput.value = '';
      notes.value = '';
      Lrate.querySelector('input').value = '';
      Rrate.querySelector('input').value = '';
      Lmis.querySelector('textarea').value = '';
      Rmis.querySelector('textarea').value = '';
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
    el('div', { className: 'subscore-grid' }, [
      el('div', { className: 'subscore-block' }, [
        el('div', { className: 'subscore-title', text: '听力明细' }),
        Lrate,
        Lmis,
      ]),
      el('div', { className: 'subscore-block' }, [
        el('div', { className: 'subscore-title', text: '阅读明细' }),
        Rrate,
        Rmis,
      ]),
    ]),
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
        desc.map((item) => renderItem(item)),
      ),
    );
  }

  function renderItem(item) {
    const detailL = hasDetail(item.listening) || bandOf(item.listening) != null;
    const detailR = hasDetail(item.reading) || bandOf(item.reading) != null;

    return el('div', { className: 'list-item' }, [
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
          detailL ? sectionDetail('听力', item.listening) : null,
          detailR ? sectionDetail('阅读', item.reading) : null,
            ]),
            el('div', { className: 'item-actions' }, [
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: '编辑',
                onClick: () => openEdit(item),
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-danger',
                text: '删除',
                onClick: () => {
              confirmDelete(item);
                },
              }),
            ]),
    ]);
  }

  function sectionDetail(label, section) {
    const band = bandOf(section);
    const pct = correctRatePct(section);
    const mistakes =
      section && typeof section === 'object' && Array.isArray(section.mistakes)
        ? section.mistakes
        : [];
    const parts = [];
    if (band != null) parts.push(`${label} Band ${formatBand(band)}`);
    if (pct != null) parts.push(`正确率 ${pct}%`);
    const head = el('div', { className: 'section-detail' }, [
      el('div', {
        className: 'section-detail-head',
        text: parts.join(' · ') || label,
      }),
    ]);
    if (mistakes.length) {
      head.append(
        el('ul', { className: 'mistake-list' }, mistakes.map((m) => el('li', { text: m }))),
      );
    }
    return head;
  }

  async function confirmDelete(item) {
    const ok = await modal({
      title: '删除成绩',
      body: el('p', {
        text: `确定删除 ${item.date} 的「${item.paper || '未命名'}」吗？此操作不可恢复。`,
      }),
      confirmText: '删除',
      danger: true,
    });
    if (ok) {
      removeIelts(item.id);
      toast('已删除', 'success');
    }
  }

  function openEdit(item) {
    const bands = bandOptions();
    const mk = (name, label, value) => {
      const sel = el('select', { name }, [
        el('option', { value: '', text: '—' }),
        ...bands.map((b) => el('option', { value: b, text: b })),
      ]);
      sel.value = value != null ? Number(value).toFixed(1) : '';
      return el('div', { className: 'form-row' }, [el('label', { text: label }), sel]);
    };
    const inNum = (name, label, value, placeholder) => {
      const inp = el('input', {
        type: 'text',
        name,
        value: value != null && value !== '' ? String(value) : '',
        placeholder,
        autocomplete: 'off',
      });
      return el('div', { className: 'form-row' }, [el('label', { text: label }), inp]);
    };
    const inArea = (name, label, lines) => {
      const ta = el('textarea', { name, rows: 3, placeholder: '每行一条' });
      ta.value = Array.isArray(lines) ? lines.join('\n') : '';
      return el('div', { className: 'form-row' }, [el('label', { text: label }), ta]);
    };

    const dateIn = el('input', {
      type: 'date',
      value: item.date || todayStr(),
    });
    const paperIn = el('input', {
      type: 'text',
      value: item.paper || '',
      placeholder: '例如 C18 T2',
      autocomplete: 'off',
    });

    const listeningBand = mk('listeningBand', 'Listening 分数', bandOf(item.listening));
    const listeningRate = inNum(
      'listeningRate',
      '正确率',
      typeof item.listening === 'object' && item.listening?.correctRate != null
        ? Number(item.listening.correctRate).toFixed(2)
        : '',
      '0.00 ~ 1.00',
    );
    const listeningMis = inArea(
      'listeningMistakes',
      '听力错题',
      typeof item.listening === 'object' ? item.listening?.mistakes : [],
    );
    const readingBand = mk('readingBand', 'Reading 分数', bandOf(item.reading));
    const readingRate = inNum(
      'readingRate',
      '正确率',
      typeof item.reading === 'object' && item.reading?.correctRate != null
        ? Number(item.reading.correctRate).toFixed(2)
        : '',
      '0.00 ~ 1.00',
    );
    const readingMis = inArea(
      'readingMistakes',
      '阅读错题',
      typeof item.reading === 'object' ? item.reading?.mistakes : [],
    );
    const writingIn = mk('writing', 'Writing 分数', bandOf(item.writing));
    const speakingIn = mk('speaking', 'Speaking 分数', bandOf(item.speaking));
    const overallIn = mk('overall', 'Overall', bandOf(item.overall));
    const notesIn = el('textarea', { rows: 2, placeholder: '备注…' });
    notesIn.value = item.notes || '';

    const body = el('div', { className: 'form-grid' }, [
      el('div', { className: 'form-row inline' }, [
        el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateIn]),
        el('div', { className: 'form-row' }, [el('label', { text: '试卷' }), paperIn]),
      ]),
      el('div', { className: 'subscore-title', text: '听力' }),
      el('div', { className: 'form-row inline' }, [listeningBand, listeningRate]),
      listeningMis,
      el('div', { className: 'subscore-title', text: '阅读' }),
      el('div', { className: 'form-row inline' }, [readingBand, readingRate]),
      readingMis,
      el('div', { className: 'form-row inline' }, [writingIn, speakingIn, overallIn]),
      el('div', { className: 'form-row' }, [el('label', { text: '备注' }), notesIn]),
    ]);

    modal({
      title: '编辑成绩',
      body,
      confirmText: '保存',
    }).then((ok) => {
      if (!ok) return;
      const parseBand = (wrap) => {
        const v = wrap.querySelector('select').value;
        return v === '' ? null : Number(v);
      };
      const parseRate = (wrap) => {
        const raw = wrap.querySelector('input').value.trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isNaN(n) ? null : n;
      };
      const parseList = (wrap) =>
        wrap
          .querySelector('textarea')
          .value.split('\n')
          .map((s) => s.trim())
          .filter(Boolean);

      const lb = parseBand(listeningBand);
      const rb = parseBand(readingBand);
      const listening = {
        band: lb,
        correctRate: parseRate(listeningRate),
        mistakes: parseList(listeningMis),
      };
      const reading = {
        band: rb,
        correctRate: parseRate(readingRate),
        mistakes: parseList(readingMis),
      };
      const hasL =
        lb != null ||
        (listening.correctRate != null && listening.correctRate > 0) ||
        listening.mistakes.length > 0;
      const hasR =
        rb != null ||
        (reading.correctRate != null && reading.correctRate > 0) ||
        reading.mistakes.length > 0;

      updateIelts(item.id, {
        date: dateIn.value || todayStr(),
        paper: paperIn.value.trim(),
        listening: hasL ? listening : null,
        reading: hasR ? reading : null,
        writing: parseBand(writingIn),
        speaking: parseBand(speakingIn),
        overall: parseBand(overallIn),
        notes: notesIn.value.trim(),
      });
      toast('已保存', 'success');
      paint();
    });
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
  const band = bandOf(v);
  const pct = correctRatePct(v);
  return el('div', { className: `score-pill${overall ? ' overall' : ''}` }, [
    el('div', { className: 'k', text: k }),
    el('div', { className: 'v', text: band == null ? formatBand(v) : formatBand(band) }),
    pct != null ? el('div', { className: 'sub', text: `${pct}%` }) : null,
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
    const t = document.createElementNS(svgNS, 'title');
    t.textContent = `${p.item.date} · ${formatBand(p.item.overall)}${p.item.paper ? ` · ${p.item.paper}` : ''}`;
    c.append(t);
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
