/* Visual bookmarklet bridge installed from Study Tracker. */
(async () => {
  const targetOrigin = 'https://ecoreal.github.io';
  const targetUrl = `${targetOrigin}/study-tracker/#ielts=records`;
  const target = window.open(targetUrl, 'study-tracker-reading-import');
  if (!target) {
    alert('请允许弹出窗口后重新点击“爱听写同步”');
    return;
  }

  try {
    // v1 = reading error book, v2 = listening error book (verified against
    // the site's own bundle: index-ce218f30.js). A listening failure must
    // not break the reading sync.
    const [mistakePayload, listeningPayload, resultPayload] = await Promise.all([
      request('/api/study/yuedu-zhenti/v1/errors-new', { page: 1, page_size: 1000 }),
      request('/api/study/zhenti/v2/errors-new', { page: 1, page_size: 1000 }).catch(() => null),
      readCurrentResult(),
    ]);
    const mistakes = collectMistakes(mistakePayload, 'reading', '爱听写 · 阅读错题');
    const listeningMistakes = collectMistakes(listeningPayload, 'listening', '爱听写 · 听力错题');
    const practiceRecords = collectPracticeRecords(resultPayload);
    if (!mistakes.length && !listeningMistakes.length && !practiceRecords.length) {
      alert('当前页面没有识别到可同步的成绩或错题。请在完成作答后的结果页使用。');
      return;
    }
    // Legacy type name on purpose: old SW-cached pages only understand
    // 'reading-mistakes' + records; new pages read every field below.
    const message = {
      type: 'study-tracker:reading-mistakes',
      records: mistakes,
      mistakes,
      practiceRecords,
      listeningMistakes,
    };
    const send = () => target.postMessage(message, targetOrigin);
    send();
    setTimeout(send, 1200);
    setTimeout(send, 3000);
    alert(`已发送 ${practiceRecords.length} 条做题记录、${mistakes.length} 道阅读错题和 ${listeningMistakes.length} 道听力错题，请切回 Study Tracker 查看。`);
  } catch (error) {
    alert(error.message || '同步失败，请确认已登录爱听写并位于结果页');
  }

  async function request(url, data) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    const payload = await response.json();
    if (payload?.status === 401 || payload?.code === 401) throw new Error('爱听写登录状态已失效，请先登录');
    return payload;
  }

  async function readCurrentResult() {
    const match = location.pathname.match(/\/ielts\/read-result\/([^/]+)\/(\d+)/);
    if (!match) return null;
    const [, type, id] = match;
    const manualResultId = new URLSearchParams(location.search).get('manual_result_id')
      || new URLSearchParams(location.search).get('manualResultId');
    const query = manualResultId ? { result: { id: Number(manualResultId) } } : {};
    let endpoint;
    if (type === 'read-jy') endpoint = `/api/study/yuedu-zhenti/v1/jianya/test/show/${id}`;
    else if (type === 'read-g-jy') endpoint = `/api/study/yuedu-g-zhenti/v1/jianya/test/show/${id}`;
    else if (type === 'read-jj') endpoint = `/api/study/yuedu-zhenti/v1/jijing/test/show/${id}`;
    else if (type === 'read-jy-part') endpoint = `/api/study/yuedu-zhenti/v1/jianya/part/show/${id}`;
    else if (type === 'read-g-jy-part') endpoint = `/api/study/yuedu-g-zhenti/v1/jianya/part/show/${id}`;
    else if (type === 'read-jj-part') endpoint = `/api/study/yuedu-zhenti/v1/jijing/part/show/${id}`;
    else return null;
    const detail = await request(endpoint, query);
    return { detail, type, targetId: id };
  }

  function collectPracticeRecords(payload) {
    if (!payload?.detail) return [];
    const root = resultRoot(payload.detail);
    const candidates = [];
    walkResults(root?.practice_result_history_grouped, candidates, '', 0);
    for (const value of [root?.practice_result, root?.practice_result_shoudong, root?.result]) {
      if (value && typeof value === 'object') candidates.push({ ...value, scope_type: value.scope_type || inferScope(payload.type) });
    }
    const paper = paperName(root, payload.type, payload.targetId);
    const unique = new Map();
    for (const candidate of candidates) {
      const result = candidate.result && typeof candidate.result === 'object' ? candidate.result : candidate;
      const resultId = positive(result.id || candidate.result_id || candidate.id);
      const scope = candidate.scope_type || result.scope_type || inferScope(payload.type);
      const correctCount = finite(result.correct_count ?? result.zhengquegeshu);
      if (!resultId || correctCount == null) continue;
      // Band conversion lives in the app (js/ielts.js) — send raw counts + variant only.
      const resolved = resolveQuestionCount(result, root, scope, correctCount);
      if (!resolved.count) continue;
      const submittedAt = text(candidate.submitted_at || result.submitted_at || result.created_at || candidate.created_at);
      unique.set(`${scope}:${resultId}`, {
        externalRef: `idictation:reading:${scope}:${resultId}`,
        paper: scope === 'part' ? `${paper} · 单篇` : paper,
        date: normalizeDate(submittedAt),
        scope,
        variant: payload.type.includes('g-jy') ? 'reading-gt' : 'reading',
        correctCount,
        questionCount: resolved.count,
        correctRate: correctCount / resolved.count,
        notes: `爱听写自动同步 · 正确 ${correctCount}/${resolved.count}${resolved.estimated ? '（题数估算）' : ''}${submittedAt ? ` · ${submittedAt}` : ''}`,
        source: 'iDictation',
      });
    }
    return [...unique.values()];
  }

  /**
   * Peel API envelopes ({status, detail} / values / data — possibly nested)
   * down to the object that actually carries the practice results.
   */
  function resultRoot(value) {
    let root = parseMaybeJson(value);
    for (let i = 0; i < 4; i += 1) {
      if (!root || typeof root !== 'object') return root;
      if (root.practice_result || root.practice_result_history_grouped || root.result || root.parts || root.jianya_name) return root;
      const inner = parseMaybeJson(root.values ?? root.data ?? root.detail);
      if (!inner || typeof inner !== 'object') return root;
      root = inner;
    }
    return root;
  }

  function walkResults(value, out, group, depth) {
    if (depth > 6 || value == null) return;
    const parsed = parseMaybeJson(value);
    if (parsed !== value) return walkResults(parsed, out, group, depth + 1);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item && typeof item === 'object') out.push({ ...item, scope_type: item.scope_type || groupScope(group) });
      });
      return;
    }
    if (typeof value !== 'object') return;
    Object.entries(value).forEach(([key, item]) => walkResults(item, out, key, depth + 1));
  }

  function collectMistakes(value, subject, sourceLabel) {
    const found = [];
    walkMistakes(parseMaybeJson(value), found, 0, subject, sourceLabel);
    const unique = new Map();
    for (const record of found) {
      const key = [record.subject, record.externalRef, record.question, record.correctAnswer].join('|').toLowerCase();
      if (key && !unique.has(key)) unique.set(key, record);
    }
    return [...unique.values()];
  }

  function walkMistakes(value, found, depth, subject, sourceLabel) {
    if (depth > 8 || value == null) return;
    const parsed = parseMaybeJson(value);
    if (parsed !== value) return walkMistakes(parsed, found, depth + 1, subject, sourceLabel);
    if (Array.isArray(value)) return value.forEach((item) => walkMistakes(item, found, depth + 1, subject, sourceLabel));
    if (typeof value !== 'object') return;
    const record = normalizeMistake(value, subject, sourceLabel);
    if (record) found.push(record);
    else Object.values(value).forEach((item) => walkMistakes(item, found, depth + 1, subject, sourceLabel));
  }

  function normalizeMistake(row, subject, sourceLabel) {
    const externalRef = text(pick(row, ['题号', 'questionNo', 'question_number', 'questionNumber', 'number', 'externalRef']));
    const question = text(pick(row, ['题目', 'question', 'questionText', 'question_text', 'stem', 'content']));
    const correctAnswer = text(pick(row, ['正确答案', 'correctAnswer', 'correct_answer', 'answer', 'rightAnswer']));
    const original = text(pick(row, ['原文', 'original', 'originalText', 'passage', 'reference']));
    const userAnswer = text(pick(row, ['我的答案', 'userAnswer', 'user_answer', 'yourAnswer', 'selectedAnswer']));
    if (!externalRef && !question && !correctAnswer) return null;
    const rawRef = externalRef || text(pick(row, ['id', 'question_id']));
    const partMatch = rawRef.match(/(?:Passage|Part|Section)\s*(\d+)/i);
    const paper = text(pick(row, ['paper', 'paperName', 'testName', 'test_name', 'examName']))
      || rawRef.replace(/\s+Passage\s*\d+.*$/i, '').trim() || '爱听写阅读错题';
    return {
      subject, paper,
      date: normalizeDate(pick(row, ['日期', 'date', 'createdAt', 'created_at'])),
      part: partMatch ? Number(partMatch[1]) : null,
      ans: rawRef, orig: original, question, userAnswer, correctAnswer, externalRef: rawRef,
      note: text(pick(row, ['笔记', 'note', 'notes'])), source: sourceLabel,
    };
  }

  function paperName(root, type, id) {
    const prefix = type.includes('g-jy') ? '剑雅 G 类' : type.includes('jj') ? '阅读机经' : '剑雅';
    return text(root?.jianya_name || root?.test_name || root?.title || root?.name) || `${prefix} #${id}`;
  }

  /**
   * Question total, most-trusted source first: explicit field -> question
   * list length -> correct+wrong sum -> rate-derived -> exam-format default.
   * Only the final default is a guess; it is flagged so notes can say so.
   */
  function resolveQuestionCount(result, root, scope, correctCount) {
    const explicit = finite(pick(result, ['question_count', 'total_question', 'timu_count', 'zongtishu', 'tishu']))
      || (scope === 'part' ? partListCount(root) : 0);
    if (explicit) return { count: explicit, estimated: false };
    const wrongRaw = pick(result, ['wrong_count', 'error_count', 'cuoti_count', 'cuotishu', 'wrong_number']);
    if (wrongRaw !== '' && wrongRaw != null) {
      const sum = correctCount + finite(wrongRaw);
      if (sum > 0) return { count: sum, estimated: false };
    }
    const rate = finiteRate(pick(result, ['correct_rate', 'accuracy', 'zhengquelv', 'zhengquelv_rate']));
    if (rate > 0 && rate <= 1) {
      const derived = Math.round(correctCount / rate);
      if (derived >= correctCount && derived <= 60) return { count: derived, estimated: false };
    }
    // A full IELTS reading paper is always 40 questions; per-passage totals vary.
    if (scope === 'test') return { count: 40, estimated: false };
    return { count: 13, estimated: true };
  }

  /** Real question totals from a single-part detail payload, when present. */
  function partListCount(root) {
    const holders = Array.isArray(root?.parts) && root.parts.length === 1 ? [root.parts[0], root] : [root];
    for (const holder of holders) {
      if (!holder || typeof holder !== 'object') continue;
      const count = finite(pick(holder, ['question_count']))
        || arrayLen(holder.question_number) || arrayLen(holder.questions) || arrayLen(holder.question_list);
      if (count) return count;
    }
    return 0;
  }

  function inferScope(type) { return type.endsWith('-part') ? 'part' : 'test'; }
  function groupScope(group) { return String(group).toLowerCase() === 'test' ? 'test' : 'part'; }
  function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
  function finite(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }
  function arrayLen(value) { return Array.isArray(value) ? value.length : 0; }
  /** Accepts 0-1 fractions or percentages ("85%", 85) -> fraction. */
  function finiteRate(value) {
    const n = Number(text(value).replace('%', ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n <= 1 ? n : n <= 100 ? n / 100 : 0;
  }
  function normalizeDate(value) {
    const raw = text(value);
    const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    return new Date().toISOString().slice(0, 10);
  }
  function pick(row, aliases) {
    for (const key of aliases) if (row[key] != null && row[key] !== '') return row[key];
    const normalized = new Map(Object.entries(row).map(([key, value]) => [key.replace(/[\s_-]/g, '').toLowerCase(), value]));
    for (const key of aliases) {
      const value = normalized.get(key.replace(/[\s_-]/g, '').toLowerCase());
      if (value != null && value !== '') return value;
    }
    return '';
  }
  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    const raw = value.trim();
    if (!raw || !/^[\[{]/.test(raw)) return value;
    try { return JSON.parse(raw); } catch { return value; }
  }
  function text(value) {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '').trim();
  }
})();
