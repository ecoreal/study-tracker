/** File adapters for vocabulary JSON and iDictation Excel exports. */

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const XLSX_INTEGRITY = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
let xlsxPromise = null;

export async function parseStudyFile(file) {
  if (!file) throw new Error('没有选择文件');
  const name = file.name || '导入文件';
  const extension = name.split('.').pop().toLowerCase();
  if (extension === 'json') {
    let value;
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error('JSON 文件无法解析');
    }
    const words = vocabularyFromJson(value, sourceLabel(name));
    if (!words.length) throw new Error('没有识别到单词字段');
    return { name, words, mistakes: [] };
  }
  if (!['xlsx', 'xls'].includes(extension)) throw new Error('仅支持 JSON、XLSX、XLS');

  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  } catch {
    throw new Error('Excel 文件无法解析');
  }
  const rows = workbook.SheetNames.flatMap((sheetName) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false }),
  );
  return parseRows(rows, name);
}

export function parseRows(rows, fileName = '导入文件') {
  const list = Array.isArray(rows) ? rows : [];
  const source = sourceLabel(fileName);
  const words = list.map((row) => normalizeWordRow(row, source)).filter(Boolean);
  const mistakes = list.map((row) => normalizeMistakeRow(row, source)).filter(Boolean);
  if (!words.length && !mistakes.length) {
    throw new Error('未识别到 iDictation 错词或阅读错题列');
  }
  return { name: fileName, words, mistakes };
}

export function vocabularyFromJson(value, source = 'JSON 导入') {
  let rows = [];
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === 'object') {
    for (const key of ['vocabulary', 'words', 'items', 'list', 'data', 'rows']) {
      if (Array.isArray(value[key])) {
        rows = value[key];
        break;
      }
    }
    if (!rows.length) {
      rows = Object.entries(value)
        .filter(([, definition]) => typeof definition === 'string' || (definition && typeof definition === 'object'))
        .map(([word, definition]) => (
          typeof definition === 'string' ? { word, definition } : { word, ...definition }
        ));
    }
  }
  return rows.map((row) => normalizeWordRow(row, source)).filter(Boolean);
}

function normalizeWordRow(row, source) {
  if (typeof row === 'string') return { word: row.trim(), source };
  if (!row || typeof row !== 'object') return null;
  const word = pick(row, ['单词', 'word', 'headword', 'headWord', 'name', '英文', 'text']);
  if (!String(word || '').trim()) return null;
  return {
    word: String(word).trim(),
    definition: text(pick(row, [
      '释义', 'definition', 'meaning', 'meaning_zh', 'chinese_meaning', 'mean', 'translate',
      'translation', 'trans', '中文', '中文释义',
    ])),
    phonetic: text(pick(row, ['音标', 'phonetic', 'phonetics', 'ipa', 'ukphone', 'usphone', 'uk_phonetic', 'us_phonetic'])),
    example: text(pick(row, ['例句', 'example', 'sentence', 'exampleSentence'])),
    exampleTranslation: text(pick(row, [
      '例句翻译', 'exampleTranslation', 'example_translate', 'example_tr', 'sentenceTranslation', '例句释义',
    ])),
    related: relatedText(row, String(word).trim()),
    source: text(pick(row, ['词书', '书名', 'source', 'book', 'source_book'])) || source,
    chapter: text(pick(row, ['章节', 'chapter', 'group', 'unit', '分类', 'level_label'])),
    errorCount: number(pick(row, ['错误次数', 'errorCount', 'error_count', 'wrongCount', 'frequency'])),
    errorSpelling: text(pick(row, ['错误拼写', 'errorSpelling', 'error_word', 'wrongSpelling'])),
  };
}

function relatedText(row, word) {
  const values = [];
  const highlighted = pick(row, ['highlighted_synonyms', '同义词', 'synonyms']);
  if (Array.isArray(highlighted)) values.push(...highlighted.map(text).filter(Boolean));
  else if (highlighted) values.push(text(highlighted));
  if (!values.length) {
    const synonym = text(pick(row, ['synonym', 'source_synonyms_raw', 'auxiliary_word', 'related']));
    if (synonym) values.push(synonym.replace(/^同义替换[:：]\s*/, ''));
  }
  const headword = text(pick(row, ['headword', '核心词']));
  if (headword && headword.toLocaleLowerCase('en-US') !== word.toLocaleLowerCase('en-US')) {
    values.unshift(`核心词：${headword}`);
  }
  return [...new Set(values)].join(' · ');
}

function normalizeMistakeRow(row, source) {
  if (!row || typeof row !== 'object') return null;
  const externalRef = text(pick(row, ['题号', '编号', 'questionNo', 'questionNumber', 'title']));
  const question = text(pick(row, ['题目', 'question', '题干']));
  const correctAnswer = text(pick(row, ['正确答案', 'correctAnswer', 'answer']));
  const original = text(pick(row, ['原文', 'original', 'passage', 'transcript']));
  if (!externalRef && !question && !correctAnswer) return null;

  const isListening = /听力/i.test(source) || /\bPart\s*\d+/i.test(externalRef);
  const sectionMatch = externalRef.match(/\b(?:Passage|Part)\s*(\d+)/i);
  const paper = externalRef
    .replace(/\s+(?:Passage|Part)\s*\d+.*$/i, '')
    .trim() || source;
  const note = [
    text(pick(row, ['笔记', 'note'])),
    text(pick(row, ['笔记内容标签', 'noteTag', '标签'])),
  ].filter(Boolean).join(' · ');
  return {
    subject: isListening ? 'listening' : 'reading',
    paper,
    date: normalizeDate(text(pick(row, ['日期', 'date', '错误时间']))),
    part: sectionMatch ? Number(sectionMatch[1]) : null,
    ans: externalRef,
    orig: original,
    sub: '',
    reason: '',
    tag: 'iDictation',
    note,
    question,
    userAnswer: text(pick(row, ['我的答案', 'userAnswer', 'yourAnswer', '错误答案'])),
    correctAnswer,
    externalRef,
    source: 'iDictation',
  };
}

function pick(row, aliases) {
  for (const key of aliases) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [key.replace(/[\s_-]/g, '').toLowerCase(), value]),
  );
  for (const key of aliases) {
    const value = normalized.get(key.replace(/[\s_-]/g, '').toLowerCase());
    if (value != null && value !== '') return value;
  }
  return '';
}

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeDate(value) {
  const textValue = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(textValue)) return textValue.slice(0, 10);
  const match = textValue.match(/^(\d{4})[/.年-](\d{1,2})[/.月-](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function sourceLabel(fileName) {
  return String(fileName || '导入词书').replace(/\.(json|xlsx?|csv)$/i, '').trim();
}

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_URL;
    script.integrity = XLSX_INTEGRITY;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel 组件初始化失败'));
    script.onerror = () => reject(new Error('Excel 组件加载失败，请检查网络'));
    document.head.append(script);
  });
  return xlsxPromise;
}
