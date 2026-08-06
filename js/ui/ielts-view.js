import { el, toast, modal } from './components.js';
import {
  getData,
  addIelts,
  updateIelts,
  removeIelts,
  todayStr,
  uid,
} from '../store.js';
import {
  computeOverall,
  formatBand,
  bandOptions,
  bandOf,
  hasDetail,
  correctRatePct,
  bandFromRaw,
  requiredRateForBand,
  normalizeMistake,
  mistakeIsEmpty,
  mistakeText,
  aggregatePartStats,
  weekKeyOf,
  weekLabel,
  weekKeyOffset,
  PART_QUESTIONS,
  MISTAKE_TAGS,
  QUESTION_TAGS_READING,
  LISTENING_RAW_TO_BAND,
  READING_AC_RAW_TO_BAND,
  READING_GT_RAW_TO_BAND,
} from '../ielts.js';

const SUBJECT_LABEL = { listening: '听力', reading: '阅读' };

export function renderIelts(root) {
  let activeTab = 'form'; // form | analysis | mistakes | records
  let mistakeFilter = 'all'; // all | listening | reading

  const viewRoot = el('div', { className: 'view' });

  const tabsWrap = el('div', { className: 'ielts-tabs', role: 'tablist' }, [
    tabBtn('form', '录入'),
    tabBtn('analysis', '学习分析'),
    tabBtn('mistakes', '错题本'),
    tabBtn('records', '记录'),
    tabBtn('bandtable', '分段表'),
  ]);
  const bodyWrap = el('div');

  function tabBtn(key, label) {
    return el('button', {
      type: 'button',
      role: 'tab',
      className: `ielts-tab${activeTab === key ? ' active' : ''}`,
      dataset: { tab: key },
      text: label,
      onClick: () => setTab(key),
    });
  }

  function setTab(key) {
    activeTab = key;
    tabsWrap.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
    paintBody();
  }

  function paintBody() {
    bodyWrap.replaceChildren();
    if (activeTab === 'form') renderForm(bodyWrap);
    else if (activeTab === 'analysis') renderAnalysis(bodyWrap);
    else if (activeTab === 'mistakes') renderMistakes(bodyWrap);
    else if (activeTab === 'bandtable') renderBandTable(bodyWrap);
    else renderRecords(bodyWrap);
  }

  viewRoot.append(
    el('div', { className: 'view-header' }, [
      el('h2', { text: '雅思学习' }),
      el('p', { text: '录入练习/模考，跟踪分 Part 正确率与错题复盘。' }),
    ]),
    tabsWrap,
    bodyWrap,
  );
  root.append(viewRoot);
  // 允许通过 URL hash 直达 sub-tab：#ielts=analysis / mistakes / records
  const hashSub = (location.hash || '').match(/ielts=([a-z]+)/);
  if (hashSub && ['form', 'analysis', 'mistakes', 'records', 'bandtable'].includes(hashSub[1])) {
    activeTab = hashSub[1];
    tabsWrap.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
  }
  paintBody();


  /* =========================
   * Tab 1: 录入
   * ========================= */
  function renderForm(container) {
    const bands = bandOptions();
    const modeSelect = el('select', {}, [
      el('option', { value: 'full', text: '全套' }),
      el('option', { value: 'listening', text: '听力' }),
      el('option', { value: 'reading', text: '阅读' }),
      el('option', { value: 'writing', text: '写作' }),
      el('option', { value: 'speaking', text: '口语' }),
    ]);
    const dateInput = el('input', { type: 'date', value: todayStr() });
    const paperInput = el('input', {
      type: 'text',
      placeholder: '例如 剑 19 Test 2 / C18 T2',
      autocomplete: 'off',
    });

    const mkBand = (name, label) => {
      const sel = el('select', { name }, [
        el('option', { value: '', text: '--' }),
        ...bands.map((b) => el('option', { value: b, text: b })),
      ]);
      return el('div', { className: 'form-row' }, [el('label', { text: label }), sel]);
    };
    const L = mkBand('listening', 'Listening');
    const R = mkBand('reading', 'Reading');
    const W = mkBand('writing', 'Writing');
    const S = mkBand('speaking', 'Speaking');
    const O = mkBand('overall', 'Overall（可自动）');
    const overallPreview = el('p', { className: 'help', style: { marginTop: '4px' }, text: '选满四科后自动显示预估值，一键填入' });
    // 实时预览 Overall
    function updateOverallPreview() {
      const lb = Number(L.querySelector('select').value) || null;
      const rb = Number(R.querySelector('select').value) || null;
      const wb = Number(W.querySelector('select').value) || null;
      const sb = Number(S.querySelector('select').value) || null;
      const missing = [];
      if (lb == null) missing.push('Listening');
      if (rb == null) missing.push('Reading');
      if (wb == null) missing.push('Writing');
      if (sb == null) missing.push('Speaking');
      if (missing.length === 0) {
        const o = computeOverall(lb, rb, wb, sb);
        if (o != null) overallPreview.innerHTML = `按四科 ≈ <b>${o.toFixed(1)}</b> <a href="#" id="overall-live-fill" style="cursor:pointer">填入</a>`;
      } else {
        overallPreview.textContent = `缺 ${missing.join('、')}，填满后自动预估 Overall`;
      }
    }
    for (const wrap of [L, R, W, S]) {
      wrap.querySelector('select').addEventListener('change', updateOverallPreview);
    }
    // 为实时预览的「填入」链接加点击——用事件委托（因为 link 是 later 插入的 innerHTML）
    overallPreview.addEventListener('click', (e) => {
      if (e.target.id === 'overall-live-fill') {
        const o = computeOverall(
          Number(L.querySelector('select').value),
          Number(R.querySelector('select').value),
          Number(W.querySelector('select').value),
          Number(S.querySelector('select').value),
        );
        if (o != null) O.querySelector('select').value = o.toFixed(1);
        toast(`Overall = ${o.toFixed(1)}`, 'success');
      }
    });
    const notes = el('textarea', { placeholder: '范文、口语话题、备注…', rows: 2 });

    const autoBtn = el('button', {
      type: 'button',
      className: 'btn btn-sm btn-ghost',
      text: '按四科自动算 Overall',
      onClick: () => {
        const o = computeOverall(selVal(L), selVal(R), selVal(W), selVal(S));
        if (o == null) { toast('请先填满四科分数', 'error'); return; }
        O.querySelector('select').value = o.toFixed(1);
        toast(`Overall = ${o.toFixed(1)}`, 'success');
      },
    });

    // Part stats + mistakes (始终展现，可选填)
    const listeningUI = buildSubjectForm('listening');
    const readingUI  = buildSubjectForm('reading');
    const subscoreWrap = el('div', { className: 'subscore-grid' }, [listeningUI.container, readingUI.container]);
    // 模式联动：写作/口语模式下无需听读明细，折叠减少干扰
    const subscoreHint = el('p', { className: 'help', hidden: true, style: { margin: '4px 0 0' }, text: '写作 / 口语模式无需填写听力、阅读明细，直接在上方填对应分数即可。' });
    function syncSubscore() {
      const hidden = modeSelect.value === 'writing' || modeSelect.value === 'speaking';
      subscoreWrap.hidden = hidden;
      subscoreHint.hidden = !hidden;
    }
    modeSelect.addEventListener('change', syncSubscore);
    syncSubscore();

    // 试卷联想：从历史记录去重
    const paperList = el('datalist', { id: 'ielts-paper-history' });
    const knownPapers = [...new Set(getData().ielts.map((i) => (i.paper || '').trim()).filter(Boolean))];
    knownPapers.forEach((p) => paperList.append(el('option', { value: p })));
    paperInput.setAttribute('list', 'ielts-paper-history');

    formSubmit({
      container, dateInput, paperInput, paperList, modeSelect,
      L, R, W, S, O, notes, autoBtn, overallPreview, subscoreWrap, subscoreHint,
      listeningUI, readingUI,
    });
  }

  function buildSubjectForm(subject, initial = null) {
    const parts = PART_QUESTIONS[subject] || [10, 10, 10, 10];
    const tagOptions = subject === 'reading' ? QUESTION_TAGS_READING : MISTAKE_TAGS;
    const sec = initial && typeof initial === 'object' ? initial : null;
    const partStats = sec && sec.partStats && typeof sec.partStats === 'object' ? sec.partStats : {};
    const partInputs = parts.map((questions, i) => {
      const rec = partStats[String(i + 1)] || null;
      const total = el('input', { type: 'number', min: '0', max: String(questions), value: String(rec ? rec.total : questions) });
      const correct = el('input', { type: 'number', min: '0', max: String(questions), value: rec && rec.correct != null ? String(rec.correct) : '', placeholder: '对几题' });
      return {
        total, correct,
        row: el('div', { className: 'part-line' }, [
          el('span', { className: 'part-label', text: subject === 'reading' ? `Passage ${i + 1}` : `Part ${i + 1}` }),
          el('div', { className: 'part-inputs' }, [
            el('div', { className: 'part-field' }, [ el('label', { text: '对题' }), correct ]),
            el('div', { className: 'part-field' }, [ el('label', { text: `总题 /${questions}` }), total ]),
          ]),
        ]),
      };
    });

    const mistakesWrap = el('div', { className: 'mistake-form-list' });
    const addBtn = el('button', {
      type: 'button',
      className: 'btn btn-sm btn-ghost',
      text: '+ 记错题',
      onClick: () => {
        mistakesWrap.append(buildMistakeRow(parts.length, tagOptions, {}));
        recount();
      },
    });

    function recount() {
      mistakesWrap.querySelectorAll('.mistake-form').forEach((n, i) => {
        n.querySelector('.mistake-form-no').textContent = `错题 ${i + 1}`;
      });
    }

    if (sec && Array.isArray(sec.mistakes)) {
      for (const m of sec.mistakes) {
        const norm = normalizeMistake(m);
        if (norm && !mistakeIsEmpty(norm)) mistakesWrap.append(buildMistakeRow(parts.length, tagOptions, norm));
      }
      recount();
    }

    return {
      container: el('div', { className: 'subscore-block' }, [
        el('div', { className: 'subscore-title', text: `${SUBJECT_LABEL[subject]}明细（可对空，只用分数也行）` }),
        el('div', { className: 'part-stack' }, partInputs.map((p) => p.row)),
        mistakesWrap,
        el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [addBtn]),
      ]),
      read() {
        const partStats = {};
        partInputs.forEach((inp, i) => {
          const t = Number(inp.total.value);
          const cRaw = inp.correct.value.trim();
          // 只有明确填写"对题数"的 Part 才计入统计，避免空值稀释正确率
          if (cRaw === '' || !Number.isFinite(t) || t <= 0) return;
          const c = Number(cRaw);
          if (Number.isFinite(c)) {
            partStats[String(i + 1)] = { total: t, correct: Math.min(t, c) };
          }
        });
        const mistakes = [];
        mistakesWrap.querySelectorAll('.mistake-form').forEach((node) => {
          const m = readMistakeRow(node);
          const norm = normalizeMistake(m);
          if (norm && !mistakeIsEmpty(norm)) {
            if (!norm.id) norm.id = uid('mk');
            mistakes.push(norm);
          }
        });
        return {
          partStats: Object.keys(partStats).length ? partStats : null,
          mistakes,
        };
      },
      reset() {
        partInputs.forEach((inp, i) => {
          inp.total.value = String(parts[i]);
          inp.correct.value = '';
        });
        mistakesWrap.replaceChildren();
      },
    };
  }

  function buildMistakeRow(partCount, tags, initial) {
    const field = (node, name) => { node.dataset.field = name; return node; };
    const partSel = field(el('select', {}, [
      el('option', { value: '', text: 'Part' }),
      ...Array.from({ length: partCount }, (_, i) => el('option', { value: String(i + 1), text: `P${i + 1}` })),
    ]), 'part');
    partSel.value = initial.part != null ? String(initial.part) : '';
    const ans = field(el('input', { type: 'text', placeholder: '你的答案 / 题号', value: initial.ans || '', autocomplete: 'off' }), 'ans');
    const orig = field(el('input', { type: 'text', placeholder: '原文定位（原文原词）', value: initial.orig || '', autocomplete: 'off' }), 'orig');
    const sub = field(el('input', { type: 'text', placeholder: '正确同义替换（如 car → vehicle）', value: initial.sub || '', autocomplete: 'off' }), 'sub');
    const reason = field(el('textarea', { placeholder: '错因 / 之后怎么改', rows: 2 }), 'reason');
    reason.value = initial.reason || '';
    const tagSel = field(el('select', {}, [
      el('option', { value: '', text: '错因类型' }),
      ...tags.map((t) => el('option', { value: t, text: t })),
    ]), 'tag');
    tagSel.value = initial.tag || '';
    const note = field(el('input', { type: 'text', placeholder: '备注（可选）', value: initial.note || '', autocomplete: 'off' }), 'note');

    const delBtn = el('button', {
      type: 'button',
      className: 'btn btn-ghost btn-icon btn-sm',
      'aria-label': '删除此错题',
      text: '×',
    });

    const node = el('div', { className: 'mistake-form' }, [
      el('div', { className: 'mistake-form-head' }, [
        el('span', { className: 'mistake-form-no', text: '错题' }),
        delBtn,
      ]),
      el('div', { className: 'form-row inline' }, [
        el('div', { className: 'form-row' }, [el('label', { text: 'Part' }), partSel]),
        el('div', { className: 'form-row' }, [el('label', { text: '题目/题号' }), ans]),
        el('div', { className: 'form-row' }, [el('label', { text: '错因类型' }), tagSel]),
      ]),
      el('div', { className: 'form-row inline' }, [
        el('div', { className: 'form-row' }, [el('label', { text: '原文' }), orig]),
        el('div', { className: 'form-row' }, [el('label', { text: '同替' }), sub]),
      ]),
      el('div', { className: 'form-row' }, [el('label', { text: '错因' }), reason]),
      el('div', { className: 'form-row' }, [el('label', { text: '备注' }), note]),
    ]);
    delBtn.addEventListener('click', () => {
      node.remove();
      // 重新编号
      node.parentElement.querySelectorAll('.mistake-form').forEach((n, i) => {
        n.querySelector('.mistake-form-no').textContent = `错题 ${i + 1}`;
      });
    });
    return node;
  }

  function readMistakeRow(node) {
    const vals = (name) => node.querySelector(`[data-field="${name}"]`)?.value.trim() ?? '';
    return {
      part: vals('part') || null,
      ans: vals('ans'),
      tag: vals('tag') || '',
      orig: vals('orig'),
      sub: vals('sub'),
      reason: vals('reason'),
      note: vals('note'),
    };
  }

  function selVal(wrap) {
    const v = wrap.querySelector('select').value;
    return v === '' ? null : Number(v);
  }

  function formSubmit(ctx) {
    const { container, dateInput, paperInput, paperList, modeSelect, L, R, W, S, O, notes, autoBtn, overallPreview, subscoreWrap, subscoreHint, listeningUI, readingUI } = ctx;
    let saved = false; // onSubmit 改 true 后，「保存后去错题本」才允许跳 tab
    const resetForm = () => {
      paperInput.value = '';
      notes.value = '';
      dateInput.value = todayStr();
      for (const wrap of [L, R, W, S, O]) wrap.querySelector('select').value = '';
      listeningUI.reset();
      readingUI.reset();
    };
    const form = el('form', {
      className: 'card form-grid',
      onSubmit: (e) => {
        saved = false;
        e.preventDefault();
        const listening = listeningUI.read();
        const reading = readingUI.read();
        const lb = selVal(L);
        const rb = selVal(R);

        const listeningAgg = listening.partStats ? aggregatePartStats('listening', listening.partStats) : null;
        const readingAgg = reading.partStats ? aggregatePartStats('reading', reading.partStats) : null;
        const listeningOk = bandOf(selVal(L)) != null || (listeningAgg != null && listeningAgg.total > 0)
          || listening.mistakes.length > 0;
        const readingOk = bandOf(selVal(R)) != null || (readingAgg != null && readingAgg.total > 0)
          || reading.mistakes.length > 0;

        if (!listeningOk && !readingOk && selVal(W) == null && selVal(S) == null && selVal(O) == null) {
          toast('请至少填写一个分数 / Part 统计 / 错题', 'error');
          return;
        }



        const entry = {
          date: dateInput.value || todayStr(),
          paper: paperInput.value.trim(),
          mode: modeSelect.value,
          listening: listeningOk ? buildSection('listening', lb, listening, listeningAgg) : null,
          reading: readingOk ? buildSection('reading', rb, reading, readingAgg) : null,
          writing: selVal(W),
          speaking: selVal(S),
          overall: selVal(O),
          notes: notes.value.trim(),
        };
        if (entry.mode === 'full' && entry.overall == null) {
          entry.overall = computeOverall(lb, rb, selVal(W), selVal(S));
        }
        // 填了 partStats 但没填 band 时 -> 由 raw 数换 band
        if (entry.listening && entry.listening.band == null && entry.listening.partStats) {
          entry.listening.band = estimateBandFromPartStats('listening', entry.listening.partStats);
        }
        if (entry.reading && entry.reading.band == null && entry.reading.partStats) {
          entry.reading.band = estimateBandFromPartStats('reading', entry.reading.partStats);
        }
        addIelts(entry);
        saved = true;
        resetForm();
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
      el('div', { className: 'form-row inline band-row' }, [L, R, W, S, O]),
      overallPreview,
      subscoreWrap,
      subscoreHint,
      el('div', { className: 'form-row' }, [el('label', { text: '备注' }), notes]),
      el('div', { className: 'btn-row' }, [
        el('button', { type: 'submit', className: 'btn btn-primary', text: '保存成绩' }),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          text: '保存后去错题本',
          onClick: () => {
            form.requestSubmit();
            if (saved) setTab('mistakes');
          },
        }),
      ]),
      paperList,
    ]);
    container.append(form);
  }

  /* =========================
   * Tab 2: 学习分析
   * ========================= */
  function renderAnalysis(container) {
    const data = getData();
    const goals = data.settings.ieltsGoals || {};
    const items = data.ielts;

    const today = todayStr();
    const currentWeek = weekKeyOf(today);
    const weekItems = items.filter((it) => weekKeyOf(it.date) === currentWeek);

    const wrap = el('section', { className: 'card form-grid' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { text: '当周目标达成情况' }),
        el('span', { className: 'muted', text: `数据来源：当周听力和阅读做题记录 · ${weekLabel(currentWeek)}` }),
      ]),
      el('p', { className: 'help', text: '在「设置」里填雅思目标分，这里自动对照所需正确率。' }),
    ]);

    // Targets summary
    const targetRow = el('div', { className: 'target-row' }, [
      targetChip('听力目标', goals.listening, () => setTab('records')),
      targetChip('阅读目标', goals.reading, () => setTab('records')),
      targetChip('总分目标', goals.overall, () => setTab('records')),
    ]);
    wrap.append(targetRow);

    // Listening table
    wrap.append(subjectGoalTable('listening', weekItems, goals.listening, '听力'));
    // Reading table
    wrap.append(subjectGoalTable('reading', weekItems, goals.reading, '阅读'));

    container.append(wrap);

    /* 4 周趋势 */
    const trendWrap = el('section', { className: 'card form-grid' }, [
      el('div', { className: 'card-header' }, [el('h3', { text: '正确率过往 4 周趋势' })]),
    ]);
    const weeks = [0, -1, -2, -3].map((n) => weekKeyOffset(currentWeek, n));
    const subjects = [
      { key: 'listening', label: '听力', goalKey: 'listening' },
      { key: 'reading', label: '阅读', goalKey: 'reading' },
    ];
    trendWrap.append(
      el('div', { className: 'trend-legend' },
        subjects.map((s) => el('span', {
          className: 'trend-legend-item',
          dataset: { k: s.key },
        }, [
          el('span', { className: `trend-swatch ${s.key}` }),
          s.label,
        ]),
      )),
    );
    trendWrap.append(renderWeeklyTrend(items, weeks, subjects, goals));
    container.append(trendWrap);
  }

  function targetChip(label, band) {
    return el('div', { className: 'target-chip' }, [
      el('div', { className: 'tc-label', text: label }),
      el('div', { className: 'tc-value', text: band != null ? band.toFixed(1) : '--' }),
    ]);
  }

  function subjectGoalTable(subject, items, targetBand, title) {
    const parts = PART_QUESTIONS[subject] || [10, 10, 10, 10];
    const agg = {};
    parts.forEach((_, i) => { agg[i + 1] = { total: 0, correct: 0 }; });
    for (const item of items) {
      const sec = item[subject];
      if (!sec || typeof sec !== 'object') continue;
      const ps = sec.partStats;
      if (!ps) continue;
      for (const [k, v] of Object.entries(ps)) {
        const idx = Number(k);
        if (!agg[idx]) continue;
        agg[idx].total += Number(v.total) || 0;
        agg[idx].correct += Number(v.correct) || 0;
      }
    }

    const req = requiredRateForBand(subject, targetBand);
    const reqPct = req != null ? `${Math.round(req * 100)}%` : '--';
    const headLabel = subject === 'reading' ? 'Passage' : 'Part';

    const table = el('div', { className: 'goal-table-wrap' }, [
      el('div', { className: 'subscore-title', text: `${title}（本周）` }),
      el('table', { className: 'goal-table' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { text: headLabel }),
            el('th', { text: '做题数量' }),
            el('th', { text: '我的正确率' }),
            el('th', { text: targetBand != null ? `目标分 ${Number(targetBand).toFixed(1)} 正确率` : '目标分正确率' }),
            el('th', { text: '达标' }),
          ]),
        ]),
        el('tbody', {}, parts.map((_, i) => {
          const p = agg[i + 1];
          const pct = p.total > 0 ? Math.round((p.correct / p.total) * 100) : null;
          const ok = pct != null && req != null && (p.correct / p.total) >= req;
          return el('tr', {}, [
            el('td', { text: `${headLabel} ${i + 1}` }),
            el('td', { text: p.total > 0 ? `${p.total} 题` : '--' }),
            el('td', { text: pct != null ? `${pct}%` : '--' }),
            el('td', { text: reqPct }),
            el('td', {}, [
              req == null
                ? el('span', { className: 'badge muted', text: '先设置目标分' })
                : (pct == null
                    ? el('span', { className: 'badge muted', text: '--' })
                    : el('span', { className: `badge ${ok ? 'accent' : 'warn'}`, text: ok ? 'OK' : 'NOT' })),
            ]),
          ]);
        })),
      ]),
    ]);
    return table;
  }

  function renderWeeklyTrend(items, weeks, subjects, goals) {
    const perWeek = weeks.map((wk) => {
      const row = { weekKey: wk, label: weekLabel(wk) };
      for (const s of subjects) {
        let total = 0, correct = 0;
        for (const it of items) {
          if (weekKeyOf(it.date) !== wk) continue;
          const sec = it[s.key];
          if (!sec || typeof sec !== 'object' || !sec.partStats) continue;
          for (const v of Object.values(sec.partStats)) {
            total += Number(v.total) || 0;
            correct += Number(v.correct) || 0;
          }
        }
        row[s.key] = total > 0 ? { total, correct, rate: correct / total } : null;
      }
      return row;
    }).reverse(); // oldest on the left

    const cols = perWeek.map((wk) => {
      return el('div', { className: 'trend-col' }, [
        el('div', { className: 'trend-bars' }, subjects.map((s) => {
          const rec = wk[s.key];
          const heightPct = rec ? Math.max(4, rec.rate * 100) : 0;
          return el('div', { className: `trend-bar ${s.key}`, style: { height: `${heightPct}%`}, title: rec ? `${s.label} ${Math.round(rec.rate * 100)}% (${rec.correct}/${rec.total})` : `${s.label} 无数据` });
        })),
        el('div', { className: 'trend-week', text: wk.label }),
        el('div', { className: 'trend-vals' }, subjects.map((s) => {
          const rec = wk[s.key];
          return el('span', { className: `trend-val ${s.key}`, text: rec ? `${Math.round(rec.rate * 100)}%` : '--' });
        })),
      ]);
    });
    return el('div', { className: 'trend-grid' }, cols);
  }


  /* =========================
   * Tab 3: 错题本
   * ========================= */
  function renderMistakes(container) {
    const gatherMistakes = () => {
      const data = getData();
      const flat = [];
      for (const item of data.ielts) {
        for (const subject of ['listening', 'reading']) {
          const sec = item[subject];
          if (!sec || typeof sec !== 'object' || !Array.isArray(sec.mistakes)) continue;
          for (const m of sec.mistakes) {
            const norm = normalizeMistake(m);
            if (norm && !mistakeIsEmpty(norm)) flat.push({ item, subject, mistake: norm });
          }
        }
      }
      return flat;
    }

    const filterRow = el('div', { className: 'btn-row' }, [
      filterBtn('all', '全部'),
      filterBtn('listening', '听力'),
      filterBtn('reading', '阅读'),
      tagSelect,
    ]);
    const tagOpts = ['', ...MISTAKE_TAGS];
    let tagFilterValue = '';
    const tagSelect = el('select', {
      className: 'mistake-tag-filter',
      onChange: () => {
        tagFilterValue = tagSelect.value;
        paintMistakes();
      },
    }, [
      el('option', { value: '', text: '全部错因类型' }),
      ...tagOpts.filter(Boolean).map((t) => el('option', { value: t, text: t })),
    ]);
    const listRoot = el('div');
    function filterBtn(key, label) {
      return el('button', {
        type: 'button',
        className: `btn btn-sm btn-ghost${mistakeFilter === key ? ' btn-primary' : ''}`,
        dataset: { f: key },
        text: label,
        onClick: () => {
          mistakeFilter = key;
          filterRow.querySelectorAll('button').forEach((b) => {
            b.className = `btn btn-sm btn-ghost${b.dataset.f === key ? ' btn-primary' : ''}`;
          });
          paintMistakes();
        },
      });
    }

    function paintMistakes() {
      listRoot.replaceChildren();
      const flat = gatherMistakes();
      const rows = flat.filter((r) => {
        if (mistakeFilter !== 'all' && r.subject !== mistakeFilter) return false;
        if (tagFilterValue && r.mistake.tag !== tagFilterValue) return false;
        return true;
      });
      if (!rows.length) {
        listRoot.append(el('div', { className: 'empty', text: '还没有错题记录，去「录入」页记一条' }));
        return;
      }
      listRoot.append(el('div', { className: 'mistake-grid' }, rows.map(mistakeCard)));
    }

    function mistakeCard(r) {
      const { item, subject, mistake } = r;
      const partLabel = mistake.part != null && mistake.part !== '' ? `P${mistake.part}` : '';
      const parts = [
        partLabel,
        mistake.ans,
        mistake.orig ? `原: ${mistake.orig}` : '',
        mistake.sub ? `同替: ${mistake.sub}` : '',
        mistake.reason ? `因: ${mistake.reason}` : '',
      ].filter(Boolean);
      const head = el('div', { className: 'mistake-card-head' }, [
        el('span', { className: 'badge accent', text: `${SUBJECT_LABEL[subject]} · ${item.date}` }),
        el('span', { className: 'muted', text: item.paper || '未命名' }),
      ]);
      const chips = el('div', { className: 'mistake-chips' }, [
        mistake.tag ? el('span', { className: 'badge', text: mistake.tag }) : null,
      ]);
      const body = el('div', { className: 'mistake-body' }, [
        el('div', { className: 'mistake-text', text: parts.join(' · ') || mistake.note || '(空)' }),
        mistake.note ? el('div', { className: 'mistake-note', text: mistake.note }) : null,
      ]);
      const actions = el('div', { className: 'mistake-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-ghost',
          text: '复盘',
          onClick: () => openMistakeModal(item, subject, mistake, 'review'),
        }),
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-ghost',
          text: '编辑',
          onClick: () => openMistakeModal(item, subject, mistake, 'edit'),
        }),
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-danger',
          text: '删除',
          onClick: async () => {
            const ok = await modal({
              title: '删除错题',
              body: el('p', { text: `确定删除这条${SUBJECT_LABEL[subject]}错题？此操作不可恢复。` }),
              confirmText: '删除',
              danger: true,
            });
            if (!ok) return;
            removeMistake(item.id, subject, mistake.id);
            toast('已删除错题', 'success');
            paintMistakes();
          },
        }),
      ]);
      return el('div', { className: 'mistake-card' }, [head, chips, body, actions]);
    }

    container.append(
      el('section', { className: 'card form-grid' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '错题本' }),
          el('span', { className: 'muted', text: `${gatherMistakes().length} 条 · 跨所有真题` }),
        ]),
        filterRow,
        listRoot,
      ]),
    );
    paintMistakes();
  }

  function removeMistake(itemId, subject, mistakeId) {
    const data = getData();
    const item = data.ielts.find((x) => x.id === itemId);
    if (!item) return;
    const sec = item[subject];
    if (!sec || typeof sec !== 'object' || !Array.isArray(sec.mistakes)) return;
    sec.mistakes = sec.mistakes.filter((m) => {
      const n = normalizeMistake(m);
      return !n || n.id !== mistakeId;
    });
    updateIelts(itemId, { [subject]: sec });
  }

  function openMistakeModal(item, subject, mistake, mode) {
    const parts = PART_QUESTIONS[subject] || [10,10,10,10];
    const tagOptions = subject === 'reading' ? QUESTION_TAGS_READING : MISTAKE_TAGS;
    const mkRow = (label, input) => el('div', { className: 'form-row' }, [el('label', { text: label }), input]);
    const partSel = el('select', {}, [
      el('option', { value: '', text: 'Part' }),
      ...parts.map((_, i) => el('option', { value: String(i + 1), text: `P${i + 1}` })),
    ]);
    partSel.value = mistake.part != null ? String(mistake.part) : '';
    const ans = el('input', { type: 'text', value: mistake.ans || '' });
    const orig = el('input', { type: 'text', value: mistake.orig || '' });
    const sub = el('input', { type: 'text', value: mistake.sub || '' });
    const reason = el('textarea', { rows: 3 }); reason.value = mistake.reason || '';
    const tag = el('select', {}, [el('option', { value: '', text: '错因类型' }), ...tagOptions.map((t) => el('option', { value: t, text: t }))]);
    tag.value = mistake.tag || '';
    const note = el('input', { type: 'text', value: mistake.note || '' });

    const isReview = mode === 'review';
    if (isReview) {
      [ans, orig, sub, reason, note].forEach((i) => { i.disabled = true; });
      [partSel, tag].forEach((i) => { i.disabled = true; });
    }

    const body = el('div', { className: 'form-grid' }, [
      mkRow('Part', partSel),
      mkRow('题目 / 你的答案', ans),
      mkRow('原文', orig),
      mkRow('同替', sub),
      mkRow('错因', reason),
      mkRow('错因类型', tag),
      mkRow('备注', note),
    ]);

    modal({
      title: `${item.paper || '未命名'} · ${SUBJECT_LABEL[subject]}${isReview ? ' · 复盘' : ' · 编辑错题'}`,
      size: 'lg',
      body,
      confirmText: isReview ? '保存' : '保存',
    }).then((ok) => {
      if (!ok) return;
      upsertMistake(item.id, subject, mistake.id, {
        part: partSel.value || null,
        ans: ans.value.trim(),
        orig: orig.value.trim(),
        sub: sub.value.trim(),
        reason: reason.value.trim(),
        tag: tag.value,
        note: note.value.trim(),
      });
      toast('已保存', 'success');
      paintBody();
    });
  }

  function upsertMistake(itemId, subject, mistakeId, patch) {
    const data = getData();
    const item = data.ielts.find((x) => x.id === itemId);
    if (!item) return;
    const sec = item[subject];
    if (!sec || typeof sec !== 'object') return;
    const list = Array.isArray(sec.mistakes) ? sec.mistakes : [];
    const idx = list.findIndex((m) => (normalizeMistake(m) || {}).id === mistakeId);
    if (idx < 0) return;
    const merged = { ...(normalizeMistake(list[idx]) || {}), ...patch };
    list[idx] = merged;
    updateIelts(itemId, { [subject]: sec });
  }

  /* =========================
   * Tab 5: 分段表（听力/阅读 对题数 → 分数）
   * ========================= */
  function renderBandTable(container) {
    const data = getData();
    const last = data.ielts[0];
    // 统计全部历史成绩分布（多成绩高亮）
    const allL = []; const allR = [];
    for (const it of data.ielts) {
      const lb = bandOf(it.listening);
      if (lb != null) allL.push(lb);
      const rb = bandOf(it.reading);
      if (rb != null) allR.push(rb);
    }
    const rawForBand = (band, table) => {
      const idx = table.indexOf(Math.round(band * 2) / 2);
      if (idx < 0) {
        // 近似找最接近的 raw
        for (let i = 0; i < table.length; i++) if (table[i] >= band) return i;
        return null;
      }
      return idx;
    };
    const allLCounts = {}; allL.forEach((b) => { const r = rawForBand(b, LISTENING_RAW_TO_BAND); if (r != null) allLCounts[r] = (allLCounts[r] || 0) + 1; });
    const allRCounts = {}; allR.forEach((b) => { const r = rawForBand(b, READING_AC_RAW_TO_BAND); if (r != null) allRCounts[r] = (allRCounts[r] || 0) + 1; });
    const allGTCounts = {}; allR.forEach((b) => { const r = rawForBand(b, READING_GT_RAW_TO_BAND); if (r != null) allGTCounts[r] = (allGTCounts[r] || 0) + 1; });

    // 以最近一次成绩的 band 为准高亮对应题数区间
    const lastL = last ? bandOf(last.listening) : null;
    const lastR = last ? bandOf(last.reading) : null;
    const lastLCorrect = lastL != null ? rawForBand(lastL, LISTENING_RAW_TO_BAND) : null;
    const lastRCorrect = lastR != null ? rawForBand(lastR, READING_AC_RAW_TO_BAND) : null;

    // 考试类型：默认 Academic（用户考试目标）
    let examType = 'academic'; // academic | general

    const bandMap = (arr) => {
      const map = {};
      arr.forEach((band, raw) => {
        if (!map[band]) map[band] = [];
        map[band].push(raw);
      });
      return map;
    };
    const Lmap = bandMap(LISTENING_RAW_TO_BAND);
    const Rmap = bandMap(READING_AC_RAW_TO_BAND);
    const GTmap = bandMap(READING_GT_RAW_TO_BAND);
    const Lbands = Object.keys(Lmap).map(Number).sort((a, b) => b - a);
    const Rbands = Object.keys(Rmap).map(Number).sort((a, b) => b - a);
    const GTbands = Object.keys(GTmap).map(Number).sort((a, b) => b - a);

    const row = (band, map, { highlightRaw, countMap }) => {
      const list = map[band];
      const min = Math.min(...list);
      const max = Math.max(...list);
      // 该 band 是否命中过历史成绩（任一对题数区间内）
      const hasCount = list.some((raw) => (countMap[raw] || 0) > 0);
      const count = list.reduce((a, raw) => a + (countMap[raw] || 0), 0);
      const isMine = highlightRaw != null && highlightRaw >= min && highlightRaw <= max;
      return el('tr', { className: isMine ? 'band-row-mine' : '' }, [
        el('td', { className: 'band-cell', text: band.toFixed(1) }),
        el('td', { text: min === max ? `${min} 题` : `${min}~${max} 题` }),
        el('td', { className: 'band-raw' }, [
          el('span', { className: 'band-raw-dots', text: '●'.repeat(Math.max(1, Math.round((max - min + 1) / 4))) }),
          hasCount ? el('span', { className: 'badge', text: `×${count}` }) : null,
          isMine ? el('span', { className: 'badge', text: '最近' }) : null,
        ]),
      ]);
    };

    const table = (title, note, map, bands, highlightRaw, countMap) => el('div', { className: 'card band-table-card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { text: title }),
        el('span', { className: 'badge', text: '共 40 题' }),
      ]),
      el('p', { className: 'help', text: note }),
      el('div', { className: 'goal-table-wrap' }, [
        el('table', { className: 'goal-table band-table' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: '分数' }),
              el('th', { text: '对题数' }),
              el('th', { text: '分布' }),
            ]),
          ]),
          el('tbody', {}, bands.map((b) => row(b, map, { highlightRaw, countMap }))),
        ]),
      ]),
    ]);

    const grid = el('div', { className: 'band-grid' });
    const typeTabs = el('div', { className: 'btn-row band-type-tabs' }, [
      typeBtn('academic', 'Academic'),
      typeBtn('general', 'General Training'),
    ]);

    function typeBtn(key, label) {
      return el('button', {
        type: 'button',
        className: `btn btn-sm btn-ghost${examType === key ? ' btn-primary' : ''}`,
        dataset: { type: key },
        text: label,
        onClick: () => {
          examType = key;
          typeTabs.querySelectorAll('button').forEach((b) => {
            b.className = `btn btn-sm btn-ghost${b.dataset.type === examType ? ' btn-primary' : ''}`;
          });
          paintGrid();
        },
      });
    }

    function paintGrid() {
      grid.replaceChildren();
      if (examType === 'academic') {
        grid.append(
          table('听力', 'Listening · Academic', Lmap, Lbands, lastLCorrect, allLCounts),
          table('阅读 · Academic', 'Reading · Academic', Rmap, Rbands, lastRCorrect, allRCounts),
        );
      } else {
        grid.append(
          table('听力', 'Listening（与 Academic 相同）', Lmap, Lbands, lastLCorrect, allLCounts),
          table('阅读 · General Training', 'Reading · General Training', GTmap, GTbands, null, allGTCounts),
        );
      }
    }
    paintGrid();

    container.append(
      el('section', { className: 'view' }, [
        el('div', { className: 'view-header' }, [
          el('div', {}, [
            el('h2', { text: '雅思分段表' }),
            el('p', { text: '听力 / 阅读各答对多少题，对应多少分（官方 40 题标准）。' }),
          ]),
        ]),
        typeTabs,
        grid,
        el('p', { className: 'help', style: { textAlign: 'center' } }, [
          '所有考试成绩会在对应 band 行显示 ×N 出现次数。',
          lastL != null ? ` 你最近听力 ${formatBand(lastL)}，阅读 ${formatBand(lastR)}，标记为「最近」。` : ' 录入成绩后这里会显示你的位置。',
        ]),
      ]),
    );
  }

  /* =========================
   * Tab 4: 记录（复用旧趋势 + 历史 + 编辑弹窗）
   * ========================= */
  function renderRecords(container) {
    let range = '30';
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
          paintRecords();
        },
      });
    }

    function filtered() {
      const all = [...getData().ielts].sort((a, b) => a.date.localeCompare(b.date));
      if (range === 'all') return all;
      const days = Number(range);
      const cut = new Date();
      cut.setDate(cut.getDate() - days);
      return all.filter((i) => i.date >= todayStr(cut));
    }

    function paintRecords() {
      const items = filtered();
      chartRoot.replaceChildren();
      // 最佳成绩速览（当前筛选范围内）
      const best = { listening: null, reading: null, writing: null, speaking: null, overall: null };
      for (const it of items) {
        for (const k of Object.keys(best)) {
          const b = bandOf(it[k]);
          if (b != null && (best[k] == null || b > best[k])) best[k] = b;
        }
      }
      const goals = getData().settings.ieltsGoals || {};
      const goalOf = (k) => (k === 'overall' ? goals.overall : k === 'listening' ? goals.listening : k === 'reading' ? goals.reading : null);
      const hasBest = Object.values(best).some((b) => b != null);
      if (hasBest) {
        const pills = [
          ['听力', 'listening'], ['阅读', 'reading'], ['写作', 'writing'], ['口语', 'speaking'], ['Overall', 'overall'],
        ].map(([label, key]) => {
          const b = best[key];
          const goal = goalOf(key);
          const met = b != null && goal != null && b >= goal;
          return el('div', {
            className: `score-pill ${key === 'overall' ? 'overall' : ''}${met ? ' met' : ''}`,
            title: goal != null ? `目标 ${goal.toFixed(1)}` : '未设目标',
          }, [
            el('div', { className: 'k', text: label }),
            el('div', { className: 'v', text: b != null ? b.toFixed(1) : '—' }),
            goal != null
              ? el('div', { className: 'sub', text: met ? `达标 ${goal.toFixed(1)}` : `目标 ${goal.toFixed(1)}` })
              : el('div', { className: 'sub', text: '未设目标' }),
          ]);
        });
        chartRoot.append(
          el('div', { className: 'best-row', title: '当前筛选范围内各技能最佳成绩' }, [
            el('span', { className: 'best-label', text: '最佳成绩' }),
            el('div', { className: 'score-grid' }, pills),
          ]),
        );
      }
      const withOverall = items.filter((i) => i.overall != null);
      if (withOverall.length >= 2) {
        chartRoot.append(sparkline(withOverall, 'Overall', '#0f766e'));
      } else {
        chartRoot.append(el('div', { className: 'empty', text: `再录 ${2 - withOverall.length} 条带 Overall 的记录就会显示趋势` }));
        if (withOverall.length < 2) {
          chartRoot.append(el('button', {
            type: 'button', className: 'btn btn-sm btn-ghost', style: { marginTop: '8px' },
            text: '去录入',
            onClick: () => setTab('form'),
          }));
        }
      }
      // 分技能趋势 sparkline (4条小图)
      const sectionSparklineRoot = el('div', { className: 'section-sparklines', style: { marginTop: '8px' } });
      const secKeys = [
        { key: 'listening', label: '听力', color: '#14b8a6' },
        { key: 'reading', label: '阅读', color: '#f59e0b' },
        { key: 'writing', label: '写作', color: '#8b5cf6' },
        { key: 'speaking', label: '口语', color: '#ec4899' },
      ];
      for (const sec of secKeys) {
        const seq = items.map((i) => ({ date: i.date, val: bandOf(i[sec.key]) })).filter((x) => x.val != null);
        if (seq.length >= 2) {
          sectionSparklineRoot.append(miniSparkline(seq, sec.label, sec.color));
        }
      }
      chartRoot.append(sectionSparklineRoot);

      listRoot.replaceChildren();
      const desc = [...items].reverse();
      if (!desc.length) {
        listRoot.append(el('div', { className: 'empty', text: '这个范围内还没有记录' }));
        return;
      }
      listRoot.append(el('div', { className: 'list' }, desc.map(renderHistoryItem)));
    }

    container.append(
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [el('h3', { text: 'Overall 趋势' }), rangeTabs]),
        chartRoot,
      ]),
      el('section', { className: 'card' }, [
        el('div', { className: 'card-header' }, [el('h3', { text: '历史记录' })]),
        listRoot,
      ]),
    );

    paintRecords();
  }

  function renderHistoryItem(item) {
    const detailL = hasDetail(item.listening) || bandOf(item.listening) != null;
    const detailR = hasDetail(item.reading) || bandOf(item.reading) != null;
    return el('div', { className: 'list-item' }, [
      el('div', { className: 'item-body' }, [
        el('div', { className: 'item-title' }, [
          el('span', { className: 'badge accent', text: item.paper || '未命名' }),
          document.createTextNode(` ${item.date} · ${modeLabel(item.mode)}`),
        ]),
        el('div', { className: 'score-grid', style: { marginTop: '8px' } }, [
          scorePill('L', item.listening),
          scorePill('R', item.reading),
          scorePill('W', item.writing),
          scorePill('S', item.speaking),
          scorePill('OVR', item.overall, true),
        ]),
        item.notes ? el('div', { className: 'item-meta', text: item.notes }) : null,
        detailL ? sectionDetail('听力', item.listening) : null,
        detailR ? sectionDetail('阅读', item.reading) : null,
      ]),
      el('div', { className: 'item-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-ghost',
          text: '编辑',
          onClick: () => openHistoryEdit(item),
        }),
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-danger',
          text: '删除',
          onClick: () => confirmDelete(item),
        }),
      ]),
    ]);
  }

  function sectionDetail(label, section) {
    const band = bandOf(section);
    const pct = correctRatePct(section);
    const mistakes = section && typeof section === 'object' && Array.isArray(section.mistakes) ? section.mistakes : [];
    const parts = [];
    if (band != null) parts.push(`${label} Band ${formatBand(band)}`);
    if (pct != null) parts.push(`正确率 ${pct}%`);
    const head = el('div', { className: 'section-detail' }, [
      el('div', { className: 'section-detail-head', text: parts.join(' · ') || label }),
    ]);
    if (mistakes.length) {
      head.append(
        el('ul', { className: 'mistake-list' }, mistakes.map((m) => el('li', { text: mistakeText(normalizeMistake(m)) }))),
      );
    }
    return head;
  }

  async function confirmDelete(item) {
    const ok = await modal({
      title: '删除成绩',
      body: el('p', { text: `确定删除 ${item.date} 的「${item.paper || '未命名'}」吗？此操作不可恢复。` }),
      confirmText: '删除',
      danger: true,
    });
    if (ok) { removeIelts(item.id); toast('已删除', 'success'); paintBody(); }
  }

  function openHistoryEdit(item) {
    const bands = bandOptions();
    const mk = (name, label, value) => {
      const sel = el('select', { name }, [
        el('option', { value: '', text: '--' }),
        ...bands.map((b) => el('option', { value: b, text: b })),
      ]);
      sel.value = value != null ? Number(value).toFixed(1) : '';
      return el('div', { className: 'form-row' }, [el('label', { text: label }), sel]);
    };
    const modeSelect = el('select', {}, [
      el('option', { value: 'full', text: '全套' }),
      el('option', { value: 'listening', text: '听力' }),
      el('option', { value: 'reading', text: '阅读' }),
      el('option', { value: 'writing', text: '写作' }),
      el('option', { value: 'speaking', text: '口语' }),
    ]);
    modeSelect.value = item.mode || 'full';
    const dateIn = el('input', { type: 'date', value: item.date || todayStr() });
    const paperIn = el('input', { type: 'text', value: item.paper || '', autocomplete: 'off' });
    const listeningBand = mk('listeningBand', 'Listening', bandOf(item.listening));
    const readingBand = mk('readingBand', 'Reading', bandOf(item.reading));
    const writingIn = mk('writing', 'Writing', bandOf(item.writing));
    const speakingIn = mk('speaking', 'Speaking', bandOf(item.speaking));
    const overallIn = mk('overall', 'Overall', bandOf(item.overall));
    const notesIn = el('textarea', { rows: 2 }); notesIn.value = item.notes || '';
    const listeningUI = buildSubjectForm('listening', item.listening);
    const readingUI = buildSubjectForm('reading', item.reading);

    modal({
      title: '编辑成绩',
      size: 'lg',
      body: el('div', { className: 'form-grid' }, [
        el('div', { className: 'form-row inline' }, [
          el('div', { className: 'form-row' }, [el('label', { text: '日期' }), dateIn]),
          el('div', { className: 'form-row' }, [el('label', { text: '试卷' }), paperIn]),
          el('div', { className: 'form-row' }, [el('label', { text: '模式' }), modeSelect]),
        ]),
        el('div', { className: 'form-row inline' }, [listeningBand, readingBand]),
        el('div', { className: 'form-row inline' }, [writingIn, speakingIn, overallIn]),
        el('div', { className: 'subscore-grid' }, [listeningUI.container, readingUI.container]),
        el('div', { className: 'form-row' }, [el('label', { text: '备注' }), notesIn]),
      ]),
      confirmText: '保存',
    }).then((ok) => {
      if (!ok) return;
      const parse = (wrap) => {
        const v = wrap.querySelector('select').value;
        return v === '' ? null : Number(v);
      };
      const lb = parse(listeningBand);
      const rb = parse(readingBand);
      const listening = listeningUI.read();
      const reading = readingUI.read();
      const listeningAgg = listening.partStats ? aggregatePartStats('listening', listening.partStats) : null;
      const readingAgg = reading.partStats ? aggregatePartStats('reading', reading.partStats) : null;
      const next = {
        date: dateIn.value || todayStr(),
        paper: paperIn.value.trim(),
        mode: modeSelect.value,
        listening: buildSection('listening', lb, listening, listeningAgg),
        reading: buildSection('reading', rb, reading, readingAgg),
        writing: parse(writingIn),
        speaking: parse(speakingIn),
        overall: parse(overallIn),
        notes: notesIn.value.trim(),
      };
      if (next.mode === 'full' && next.overall == null) {
        next.overall = computeOverall(lb, rb, next.writing, next.speaking);
      }
      // 填了 partStats 但没填 band 时 -> 由 raw 数换 band
      if (next.listening && next.listening.band == null && next.listening.partStats) {
        next.listening.band = estimateBandFromPartStats('listening', next.listening.partStats);
      }
      if (next.reading && next.reading.band == null && next.reading.partStats) {
        next.reading.band = estimateBandFromPartStats('reading', next.reading.partStats);
      }
      updateIelts(item.id, next);
      toast('已保存', 'success');
      paintBody();
    });
  }

}

/* =========================
 * 纯展示助手
 * ========================= */

function buildSection(subject, band, ui, agg) {
  if (band == null && (agg == null || agg.total === 0) && ui.mistakes.length === 0) return null;
  const out = { band, correctRate: agg && agg.total > 0 ? agg.correct / agg.total : 0, mistakes: ui.mistakes };
  if (ui.partStats) out.partStats = ui.partStats;
  return out;
}

function estimateBandFromPartStats(subject, partStats) {
  if (!partStats) return null;
  const agg = aggregatePartStats(subject, partStats);
  if (agg.total >= 35 && agg.total <= 45) return bandFromRaw(subject, agg.correct);
  return null;
}

function modeLabel(m) {
  return (
    { full: '全套', listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' }[m] || m
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

function sparkline(items, label = 'Overall', color = '#0f766e') {
  const w = 640, h = 160, pad = 24;
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
  axis.setAttribute('x1', String(pad)); axis.setAttribute('x2', String(w - pad));
  axis.setAttribute('y1', String(h - pad)); axis.setAttribute('y2', String(h - pad));
  svg.append(axis);
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'line'); path.setAttribute('d', d); path.style.stroke = color; svg.append(path);
  for (const p of pts) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(p.x)); c.setAttribute('cy', String(p.y)); c.setAttribute('r', '4');
    c.style.fill = color;
    const t = document.createElementNS(svgNS, 'title');
    t.textContent = `${p.item.date} · ${formatBand(p.item.overall)}`;
    c.append(t);
    svg.append(c);
  }
  const labels = el('div', {
    className: 'item-meta', style: { marginTop: '8px' },
    text: `${label} · ${items[0].date} ~ ${items[items.length - 1].date} · ${items.length} 次 · 最新 ${formatBand(items[items.length - 1].overall)}`,
  });
  return el('div', {}, [svg, labels]);
}

/** 小尺寸分技能 sparkline，输入 [{date, val}] */
function miniSparkline(seq, label, color) {
  const w = 160, h = 44, pad = 6;
  const vals = seq.map((x) => x.val);
  const min = Math.min(...vals, 4);
  const max = Math.max(...vals, 8);
  const span = Math.max(0.5, max - min);
  const pts = seq.map((x, idx) => {
    const px = pad + (idx * (w - pad * 2)) / Math.max(1, seq.length - 1);
    const py = h - pad - ((x.val - min) / span) * (h - pad * 2);
    return { x: px, y: py, item: x };
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'sparkline mini');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d); path.style.stroke = color; path.setAttribute('stroke-width', '2'); path.setAttribute('fill', 'none');
  svg.append(path);
  for (const p of pts) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(p.x)); c.setAttribute('cy', String(p.y)); c.setAttribute('r', '2.5');
    c.style.fill = color;
    const t = document.createElementNS(svgNS, 'title');
    t.textContent = `${label} · ${p.item.date} · ${formatBand(p.item.val)}`;
    c.append(t);
    svg.append(c);
  }
  return el('div', { className: 'mini-sparkline', title: `${label} 趋势` }, [
    el('span', { className: 'mini-sparkline-label', text: label }),
    svg,
  ]);
}
