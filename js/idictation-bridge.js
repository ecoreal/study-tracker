/*
 * This file is loaded by the visual bookmarklet installed from Study Tracker.
 * It runs on iDictation's own origin and session cookie, then sends only
 * reading mistake records to the Study Tracker tab through postMessage.
 */
(async () => {
  const targetOrigin = 'https://ecoreal.github.io';
  const targetUrl = `${targetOrigin}/study-tracker/#ielts=mistake-review`;
  const target = window.open(targetUrl, 'study-tracker-reading-import');
  if (!target) {
    alert('请允许弹出窗口后重新执行同步助手');
    return;
  }

  const response = await fetch('/api/study/yuedu-zhenti/v1/errors-new', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, page_size: 1000 }),
  });
  const payload = await response.json();
  if (payload?.status === 401 || payload?.code === 401) {
    alert('爱听写登录状态已失效，请先登录后再执行同步助手');
    return;
  }
  const records = collectRecords(payload);
  if (!records.length) {
    alert('没有识别到阅读错题。也可以在爱听写导出阅读错题本.xlsx后手动导入。');
    return;
  }
  const message = { type: 'study-tracker:reading-mistakes', records };
  const send = () => target.postMessage(message, targetOrigin);
  send();
  setTimeout(send, 1200);
  setTimeout(send, 3000);
  alert(`已发送 ${records.length} 道阅读错题，请切回 Study Tracker 查看。`);

  function collectRecords(value) {
    const found = [];
    walk(parseMaybeJson(value), found, 0);
    const unique = new Map();
    for (const record of found) {
      const key = [record.externalRef, record.question, record.correctAnswer].join('|').toLowerCase();
      if (key && !unique.has(key)) unique.set(key, record);
    }
    return [...unique.values()];
  }

  function walk(value, found, depth) {
    if (depth > 8 || value == null) return;
    const parsed = parseMaybeJson(value);
    if (parsed !== value) {
      walk(parsed, found, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, found, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = normalize(value);
    if (record) found.push(record);
    else Object.values(value).forEach((item) => walk(item, found, depth + 1));
  }

  function normalize(row) {
    const externalRef = text(pick(row, ['题号', 'questionNo', 'question_number', 'questionNumber', 'number', 'externalRef']));
    const question = text(pick(row, ['题目', 'question', 'questionText', 'question_text', 'stem', 'content']));
    const correctAnswer = text(pick(row, ['正确答案', 'correctAnswer', 'correct_answer', 'answer', 'rightAnswer']));
    const original = text(pick(row, ['原文', 'original', 'originalText', 'passage', 'reference']));
    const userAnswer = text(pick(row, ['我的答案', 'userAnswer', 'user_answer', 'yourAnswer', 'selectedAnswer']));
    if (!externalRef && !question && !correctAnswer) return null;
    const rawRef = externalRef || text(pick(row, ['id', 'question_id']));
    const partMatch = rawRef.match(/Passage\s*(\d+)/i);
    const paper = text(pick(row, ['paper', 'paperName', 'testName', 'test_name', 'examName']))
      || rawRef.replace(/\s+Passage\s*\d+.*$/i, '').trim()
      || '爱听写阅读错题';
    return {
      subject: 'reading',
      paper,
      date: text(pick(row, ['日期', 'date', 'createdAt', 'created_at'])) || new Date().toISOString().slice(0, 10),
      part: partMatch ? Number(partMatch[1]) : null,
      ans: rawRef,
      orig: original,
      question,
      userAnswer,
      correctAnswer,
      externalRef: rawRef,
      note: text(pick(row, ['笔记', 'note', 'notes'])),
      source: '爱听写 · 阅读错题',
    };
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
    const textValue = value.trim();
    if (!textValue || !/^[\[{]/.test(textValue)) return value;
    try { return JSON.parse(textValue); } catch { return value; }
  }

  function text(value) {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '').trim();
  }
})();
