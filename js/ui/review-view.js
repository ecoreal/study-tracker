import { el, modal, toast } from './components.js';
import { daysUntilDate } from '../ielts.js';
import {
  getData,
  getMeta,
  todayStr,
  updateSettings,
  upsertVocabulary,
  addVocabulary,
  updateVocabulary,
  removeVocabulary,
  importIeltsMistakes,
  markMistakeReview,
  applyReviewResult,
} from '../store.js';
import {
  buildReviewQueue,
  getReviewSummary,
  buildMistakeReviewQueue,
  getMistakeReviewSummary,
  previewRatings,
  rateCard,
  formatInterval,
  reviewStateLabel,
  normalizeSpelling,
} from '../review.js';
import { parseStudyFile } from '../importer.js';

const RATING_META = [
  { value: 1, label: '忘记', hint: 'Again', tone: 'again' },
  { value: 2, label: '困难', hint: 'Hard', tone: 'hard' },
  { value: 3, label: '记得', hint: 'Good', tone: 'good' },
  { value: 4, label: '简单', hint: 'Easy', tone: 'easy' },
];

export function renderReviewPanel(container, ctx) {
  const summary = getReviewSummary(getData());
  const queueCounts = {
    all: buildReviewQueue(getData(), { kind: 'all' }).length,
    word: buildReviewQueue(getData(), { kind: 'word' }).length,
  };
  const mount = el('div');
  container.append(mount);

  function paintOverview() {
    mount.replaceChildren(
      el('section', { className: 'review-hero' }, [
        el('div', { className: 'review-hero-copy' }, [
          el('span', { className: 'eyebrow', text: summary.todayDue ? '词汇复习' : '词汇已清空' }),
          el('strong', { className: 'review-due-number', text: String(summary.todayDue) }),
          el('span', { className: 'review-due-label', text: '个词待学习' }),
          el('p', {
            className: 'muted',
            text: planLine(summary),
          }),
        ]),
        el('div', { className: 'review-hero-actions' }, [
          startButton('all', '开始今日复习', 'btn-primary'),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '真题复盘',
            onClick: ctx.openMistakeReview,
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '管理词库',
            onClick: ctx.openVocabulary,
          }),
        ]),
      ]),
      examPacingBanner(summary),
      el('div', { className: 'review-stats' }, [
        stat('已复习', summary.reviewedToday, '今天'),
        stat('到期', summary.scheduledDue, '优先处理'),
        stat('新词', summary.newAvailable, `今日可学 · 库存 ${summary.newBacklog}`),
        stat('长期记忆', summary.mature, '间隔 ≥ 21 天'),
      ]),
      el('section', { className: 'card review-choice' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '词汇记忆' }),
          el('span', { className: 'badge', text: 'FSRS · 词汇专用' }),
        ]),
        el('div', { className: 'review-choice-grid single' }, [
          choice('word', '全部词汇', queueCounts.word, `${summary.words} 个词 · 阅读 538 + 听力错词`),
        ]),
      ]),
    );
  }

  function planLine(summary) {
    const exam = getData().settings?.ieltsGoals?.examDate;
    const days = daysUntilDate(exam, todayStr());
    const examText = days != null && days >= 0 ? ` · 距考试 ${days} 天` : '';
    const dueText = summary.scheduledDue ? `${summary.scheduledDue} 个到期` : '没有到期复习';
    if (!summary.dailyNew) return `${dueText} · 新词已暂停${examText}`;
    const remaining = Math.max(0, summary.dailyNew - summary.newToday);
    return `${dueText} · 今日新词 ${summary.newToday}/${summary.dailyNew}，还可学 ${remaining} 个${examText}`;
  }

  /** 考前节奏提示：按当前每日新词量，考前过不完第一轮时给出一键调整。 */
  function examPacingBanner(summary) {
    const days = daysUntilDate(getData().settings?.ieltsGoals?.examDate, todayStr());
    if (days == null || days <= 0 || !summary.dailyNew || !summary.newBacklog) return null;
    const required = Math.min(200, Math.ceil(summary.newBacklog / days));
    if (required <= summary.dailyNew) return null;
    return el('section', { className: 'card pacing-banner' }, [
      el('div', {}, [
        el('strong', { text: `⏳ 距考试还有 ${days} 天` }),
        el('p', {
          className: 'muted',
          text: `新词还剩 ${summary.newBacklog} 个，当前 ${summary.dailyNew} 个/天考前过不完第一轮。建议 ${required} 个/天。`,
        }),
      ]),
      el('button', {
        type: 'button',
        className: 'btn btn-primary btn-sm',
        text: `调整为 ${required}/天`,
        onClick: () => {
          updateSettings({ review: { dailyNew: required } });
          toast(`每日新词已调整为 ${required} 个`, 'success');
          ctx.refreshView();
        },
      }),
    ]);
  }

  function startButton(kind, label, style = 'btn-ghost') {
    return el('button', {
      type: 'button',
      className: `btn ${style}`,
      text: queueCounts[kind] ? `${label} · ${queueCounts[kind]}` : label,
      disabled: queueCounts[kind] === 0,
      onClick: () => startSession(kind),
    });
  }

  function stat(label, value, sub) {
    return el('div', { className: 'review-stat' }, [
      el('span', { className: 'review-stat-label', text: label }),
      el('strong', { text: String(value) }),
      el('span', { className: 'review-stat-sub', text: sub }),
    ]);
  }

  function choice(kind, label, due, total) {
    return el('button', {
      type: 'button',
      className: 'review-choice-button',
      disabled: due === 0,
      onClick: () => startSession(kind),
    }, [
      el('span', { className: 'review-choice-title', text: label }),
      el('strong', { text: due ? `${due} 项` : '已完成' }),
      el('span', { className: 'muted', text: total }),
    ]);
  }

  function startSession(kind) {
    const queue = buildReviewQueue(getData(), { kind });
    if (!queue.length) {
      toast('这一组今天已经完成', 'success');
      return;
    }
    const session = {
      queue,
      index: 0,
      results: { 1: 0, 2: 0, 3: 0, 4: 0 },
      learnedIds: new Set(),
      requeued: 0,
    };
    paintSession(session);
  }

  function paintSession(session) {
    if (session.index >= session.queue.length) {
      paintComplete(session);
      return;
    }
    const item = session.queue[session.index];
    const reviewSettings = getData().settings?.review || {};
    const mode = ['spelling', 'choice', 'synonym'].includes(reviewSettings.wordMode) ? reviewSettings.wordMode : 'synonym';
    // 不背单词-style: a brand-new word gets a learning pass first, then comes
    // back as a quiz at the end of today's queue.
    const isLearnPass = item.kind === 'word' && !item.card && !session.learnedIds.has(item.id);
    const progress = Math.round((session.index / session.queue.length) * 100);
    const cardBody = el('div', { className: 'study-card-body' });
    const ratingArea = el('div', { className: 'review-rating-area', hidden: true });
    let revealed = false;
    let ratingBusy = false;

    mount.replaceChildren(
      el('section', { className: 'review-session' }, [
        el('div', { className: 'review-session-head' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            text: '退出',
            onClick: ctx.refreshView,
          }),
          el('div', { className: 'review-session-progress' }, [
            el('span', { text: `${session.index + 1} / ${session.queue.length}` }),
            el('div', { className: 'progress', role: 'progressbar', 'aria-valuenow': progress }, [
              el('div', { className: 'progress-fill', style: { width: `${progress}%` } }),
            ]),
          ]),
          el('span', { className: 'badge', text: isLearnPass ? '新词' : item.kind === 'word' ? '单词' : '错题' }),
        ]),
        el('div', { className: 'study-card' }, [cardBody, ratingArea]),
      ]),
    );

    if (isLearnPass) {
      session.learnedIds.add(item.id);
      cardBody.append(
        el('div', { className: 'study-card-kicker' }, [
          el('span', { text: item.word.chapter || item.word.source || '词库' }),
          el('span', { className: 'badge', text: '新词' }),
        ]),
        el('div', { className: 'word-prompt' }, [
          el('h3', { text: item.word.word }),
          item.word.phonetic ? el('p', { className: 'word-phonetic', text: `/${item.word.phonetic}/` }) : null,
          speakButton(item.word.word),
        ]),
        el('div', { className: 'study-answer learn-card' }, [
          item.word.definition
            ? el('p', { className: 'learn-definition', text: item.word.definition })
            : el('p', { className: 'muted', text: '暂无释义' }),
          clusterChips(clusterOf(item.word))
            || (item.word.related ? el('p', { className: 'word-related', text: `同义替换：${item.word.related}` }) : null),
        ]),
        el('button', {
          type: 'button',
          className: 'btn btn-primary',
          text: '记住了，稍后测',
          onClick: () => {
            session.queue.push({ ...item });
            session.index += 1;
            paintSession(session);
          },
        }),
      );
      if (reviewSettings.autoPronounce !== false) speakWord(item.word.word);
      return;
    }

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      showAnswer(cardBody, item);
      ratingArea.hidden = false;
      paintRatings(ratingArea, item, session, () => ratingBusy, (value) => { ratingBusy = value; });
    };

    if (item.kind === 'word') renderWordPrompt(cardBody, item.word, mode, reveal);
    else renderMistakePrompt(cardBody, item, reveal);
    if (item.kind === 'word' && reviewSettings.autoPronounce !== false) speakWord(item.word.word);
  }

  function renderWordPrompt(root, word, mode, reveal) {
    // 538 的精髓：考点词 ↔ 同替词的双向识别（英文→英文，还原真题的替换链）
    if (mode === 'synonym') {
      const partner = synonymPartner(word);
      if (partner) {
        const options = buildSynonymOptions(word, partner);
        if (options) {
          renderWordChoice(root, word, options, reveal, '选出它的同义替换', partner);
          return;
        }
      }
      // 没有结构化同替关系的词回退到释义选择/认读
    }
    if (mode === 'choice' && word.definition) {
      const options = buildChoiceOptions(word);
      if (options) {
        renderWordChoice(root, word, options, reveal);
        return;
      }
      // 词库太小凑不齐干扰项时退回顾读模式
    }
    const useSpelling = mode === 'spelling' && Boolean(word.definition);
    root.append(
      el('div', { className: 'study-card-kicker' }, [
        el('span', { text: word.chapter || word.source || '词库' }),
        word.errorCount ? el('span', { className: 'badge warn', text: `错 ${word.errorCount} 次` }) : null,
      ]),
    );
    if (!useSpelling) {
      root.append(
        el('div', { className: 'word-prompt' }, [
          el('h3', { text: word.word }),
          word.phonetic ? el('p', { className: 'word-phonetic', text: `/${word.phonetic}/` }) : null,
          speakButton(word.word),
        ]),
        el('button', { type: 'button', className: 'btn btn-primary reveal-answer', text: '显示答案', onClick: reveal }),
      );
      return;
    }

    const input = el('input', {
      type: 'text',
      className: 'spelling-input',
      placeholder: '输入英文拼写',
      autocomplete: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
    });
    const feedback = el('div', { className: 'spelling-feedback', hidden: true });
    const check = () => {
      if (!input.value.trim()) {
        toast('先输入你的拼写', 'info');
        input.focus();
        return;
      }
      const correct = normalizeSpelling(input.value) === normalizeSpelling(word.word);
      feedback.className = `spelling-feedback ${correct ? 'correct' : 'incorrect'}`;
      feedback.textContent = correct ? '拼写正确' : `正确拼写：${word.word}`;
      feedback.hidden = false;
      input.disabled = true;
      reveal();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') check();
    });
    root.append(
      el('div', { className: 'spelling-prompt' }, [
        el('p', { className: 'spelling-definition', text: word.definition }),
        speakButton(word.word),
        input,
        el('button', { type: 'button', className: 'btn btn-primary', text: '检查拼写', onClick: check }),
        feedback,
      ]),
    );
    setTimeout(() => input.focus(), 50);
  }

  /** 词群 chips：首个（考点词）高亮，其余为同替词。 */
  function clusterChips(cluster) {
    if (!cluster || cluster.length < 2) return null;
    return el('div', { className: 'chip-row cluster-chips' }, [
      el('span', { className: 'cluster-label', text: '同替链' }),
      ...cluster.map((entry, i) => el('span', { className: `chip${i === 0 ? ' chip-hot' : ''}`, text: entry })),
    ]);
  }

  /** 按拼写（忽略大小写/多余空格）在词库里找词条。 */
  function findWord(text) {
    const target = normalizeSpelling(text);
    if (!target) return null;
    return (getData().vocabulary || []).find((item) => normalizeSpelling(item.word) === target) || null;
  }

  /** 完整词群：考点词 → [考点词, ...同替]；同替词 → [考点词, ...其同替]。 */
  function clusterOf(word) {
    if (Array.isArray(word.synonyms) && word.synonyms.length) return [word.word, ...word.synonyms];
    const head = String(word.headword || '').trim();
    if (head && normalizeSpelling(head) !== normalizeSpelling(word.word)) {
      const headEntry = findWord(head);
      return headEntry && Array.isArray(headEntry.synonyms) && headEntry.synonyms.length
        ? [head, ...headEntry.synonyms]
        : [head, word.word];
    }
    return null;
  }

  /**
   * 双向配对：考点词随机考它的一个同替词；同替词考它的考点词。
   * @returns {{answer: string, cluster: string[]} | null}
   */
  function synonymPartner(word) {
    const cluster = clusterOf(word);
    if (!cluster) return null;
    if (Array.isArray(word.synonyms) && word.synonyms.length) {
      const answer = word.synonyms[Math.floor(Math.random() * word.synonyms.length)];
      return { answer, cluster };
    }
    return { answer: cluster[0], cluster };
  }

  /**
   * 同替四选一的干扰项：只用其他词群的成员（它们也都是"某词的同替"，
   * 干扰性强），并且整群排除 —— 同群的词语义上同样正确，不能当错项。
   */
  function buildSynonymOptions(word, partner) {
    const own = new Set([
      normalizeSpelling(word.word),
      normalizeSpelling(partner.answer),
      ...(partner.cluster || []).map((entry) => normalizeSpelling(entry)),
    ]);
    const vocab = getData().vocabulary || [];
    const candidates = [];
    const seen = new Set();
    for (const item of vocab) {
      const label = String(item.word || '').trim();
      const key = normalizeSpelling(label);
      if (!label || own.has(key) || seen.has(key)) continue;
      const isMember = (Array.isArray(item.synonyms) && item.synonyms.length)
        || (String(item.headword || '').trim()
          && normalizeSpelling(item.headword) !== normalizeSpelling(item.word));
      if (!isMember) continue;
      seen.add(key);
      candidates.push(label);
    }
    const distractors = shuffle(candidates).slice(0, 3);
    if (distractors.length < 3) return null;
    return shuffle([{ text: partner.answer, correct: true }, ...distractors.map((d) => ({ text: d, correct: false }))]);
  }

  /** 四选一：正确释义 + 3 个干扰项，同章节的优先（难度更接近）。 */
  function buildChoiceOptions(word) {
    const vocab = getData().vocabulary || [];
    const usedWords = new Set([normalizeSpelling(word.word)]);
    const usedDefinitions = new Set([String(word.definition).trim()]);
    const pick = (pool) => {
      const out = [];
      for (const candidate of shuffle(pool)) {
        if (out.length >= 3) break;
        const definition = String(candidate.definition || '').trim();
        if (!definition || usedDefinitions.has(definition)) continue;
        if (usedWords.has(normalizeSpelling(candidate.word))) continue;
        usedDefinitions.add(definition);
        usedWords.add(normalizeSpelling(candidate.word));
        out.push({ text: definition, correct: false });
      }
      return out;
    };
    const others = vocab.filter((item) => item.id !== word.id);
    let distractors = pick(others.filter((item) => item.chapter && item.chapter === word.chapter));
    if (distractors.length < 3) distractors = [...distractors, ...pick(others)];
    if (distractors.length < 3) return null;
    return shuffle([{ text: String(word.definition).trim(), correct: true }, ...distractors]);
  }

  function renderWordChoice(root, word, options, reveal, badgeText = '选出正确释义', partner = null) {
    let answered = false;
    root.append(
      el('div', { className: 'study-card-kicker' }, [
        el('span', { text: word.chapter || word.source || '词库' }),
        el('span', { className: 'badge', text: badgeText }),
      ]),
      el('div', { className: 'word-prompt' }, [
        el('h3', { text: word.word }),
        word.phonetic ? el('p', { className: 'word-phonetic', text: `/${word.phonetic}/` }) : null,
        speakButton(word.word),
      ]),
      el('div', { className: 'choice-grid' }, options.map((option) => {
        const button = el('button', { type: 'button', className: `choice-option${partner ? ' word-option' : ''}` });
        if (option.correct) button.dataset.correct = '1';
        button.append(document.createTextNode(option.text));
        button.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          root.querySelectorAll('.choice-option').forEach((node) => {
            node.disabled = true;
            if (node.dataset.correct === '1') node.classList.add('correct');
          });
          if (!option.correct) button.classList.add('incorrect');
          setTimeout(reveal, 650);
        });
        return button;
      })),
    );
  }

  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function renderMistakePrompt(root, item, reveal) {
    const mistake = item.mistake;
    root.append(
      el('div', { className: 'study-card-kicker' }, [
        el('span', { text: `${item.subject === 'reading' ? '阅读' : '听力'} · ${item.entry.paper || '未命名'}` }),
        mistake.part ? el('span', { className: 'badge', text: `P${mistake.part}` }) : null,
      ]),
      el('div', { className: 'mistake-prompt' }, [
        mistake.externalRef ? el('strong', { text: mistake.externalRef }) : null,
        el('p', { text: mistake.question || mistake.ans || '回忆这道错题的正确答案' }),
        mistake.userAnswer ? el('div', { className: 'answer-line wrong', text: `上次作答：${mistake.userAnswer}` }) : null,
      ]),
      el('button', { type: 'button', className: 'btn btn-primary reveal-answer', text: '显示答案', onClick: reveal }),
    );
  }

  function showAnswer(root, item) {
    root.querySelector('.reveal-answer')?.remove();
    if (item.kind === 'word') {
      const word = item.word;
      root.append(el('div', { className: 'study-answer' }, [
        el('div', { className: 'study-answer-main' }, [
          el('strong', { text: word.word }),
          word.definition ? el('p', { text: word.definition }) : el('p', { className: 'muted', text: '暂无释义' }),
        ]),
        word.errorSpelling ? el('p', { className: 'answer-line wrong', text: `曾错拼：${word.errorSpelling}` }) : null,
        clusterChips(clusterOf(word))
          || (word.related ? el('p', { className: 'word-related', text: `同义替换：${word.related}` }) : null),
        word.example ? el('blockquote', {}, [
          el('span', { text: word.example }),
          word.exampleTranslation ? el('small', { text: word.exampleTranslation }) : null,
        ]) : null,
      ]));
      return;
    }
    const mistake = item.mistake;
    root.append(el('div', { className: 'study-answer' }, [
      mistake.correctAnswer
        ? el('div', { className: 'answer-line correct', text: `正确答案：${mistake.correctAnswer}` })
        : null,
      mistake.orig ? el('blockquote', {}, [el('span', { text: mistake.orig })]) : null,
      mistake.sub ? el('p', { text: `同义替换：${mistake.sub}` }) : null,
      mistake.reason ? el('p', { text: `错因：${mistake.reason}` }) : null,
      mistake.note ? el('p', { className: 'muted', text: mistake.note }) : null,
    ]));
  }

  function paintRatings(root, item, session, getBusy, setBusy) {
    const intervalNodes = {};
    root.replaceChildren(
      el('p', { className: 'rating-question', text: '这次回忆有多难？' }),
      el('div', { className: 'rating-grid' }, RATING_META.map((meta) => {
        const interval = el('span', { className: 'rating-interval', text: '计算中' });
        intervalNodes[meta.value] = interval;
        return el('button', {
          type: 'button',
          className: `rating-button ${meta.tone}`,
          onClick: async () => {
            if (getBusy()) return;
            setBusy(true);
            root.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            const reviewedAt = new Date();
            try {
              const result = await rateCard(item.card, meta.value, reviewedAt);
              ctx.suppressNextStoreRender();
              applyReviewResult({
                kind: item.kind,
                id: item.id,
                card: result.card,
                rating: meta.value,
                reviewedAt: reviewedAt.toISOString(),
                wasNew: !item.card,
              });
              item.card = result.card;
              session.results[meta.value] += 1;
              // 忘记的词本场稍后再来一次（每词最多重排 2 次，防死循环）
              if (meta.value === 1 && (item.requeues || 0) < 2) {
                session.queue.push({ ...item, requeues: (item.requeues || 0) + 1 });
                session.requeued += 1;
              }
              session.index += 1;
              paintSession(session);
            } catch (error) {
              setBusy(false);
              root.querySelectorAll('button').forEach((button) => { button.disabled = false; });
              toast(error.message || '复习计划计算失败', 'error');
            }
          },
        }, [
          el('strong', { text: meta.label }),
          el('span', { text: meta.hint }),
          interval,
        ]);
      })),
    );
    previewRatings(item.card).then((preview) => {
      for (const meta of RATING_META) {
        intervalNodes[meta.value].textContent = preview[meta.value]
          ? formatInterval(preview[meta.value].due)
          : '自动安排';
      }
    }).catch(() => {
      Object.values(intervalNodes).forEach((node) => { node.textContent = '自动安排'; });
    });
  }

  function paintComplete(session) {
    const remembered = session.results[3] + session.results[4];
    mount.replaceChildren(el('section', { className: 'review-complete' }, [
      el('span', { className: 'complete-mark', text: '✓' }),
      el('h3', { text: '本轮复习完成' }),
      el('p', { className: 'muted', text: `完成 ${session.queue.length} 项 · 记住 ${remembered} 项${session.requeued ? ` · 重学 ${session.requeued} 次` : ''}` }),
      el('div', { className: 'complete-ratings' }, RATING_META.map((meta) =>
        el('div', {}, [
          el('strong', { text: String(session.results[meta.value]) }),
          el('span', { text: meta.label }),
        ]),
      )),
      el('button', { type: 'button', className: 'btn btn-primary', text: '返回今日计划', onClick: () => ctx.refreshView() }),
    ]));
  }

  paintOverview();
}

/**
 * Real-test mistake review is deliberately a manual, chronological workflow.
 * It records whether the learner has understood the question and when it should
 * be practised again, without creating an FSRS card.
 */
export function renderMistakeReviewPanel(container, ctx) {
  const mount = el('div');
  let subject = 'all';
  const readingFileInput = el('input', {
    type: 'file',
    accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    hidden: true,
  });
  readingFileInput.addEventListener('change', () => importReadingFile(readingFileInput.files?.[0]));
  container.append(mount);

  function paintOverview() {
    const summary = getMistakeReviewSummary(getData());
    const queue = buildMistakeReviewQueue(getData(), { subject });
    mount.replaceChildren(
      el('section', { className: 'review-hero' }, [
        el('div', { className: 'review-hero-copy' }, [
          el('span', { className: 'eyebrow', text: summary.due ? '真题复盘' : '复盘已清空' }),
          el('strong', { className: 'review-due-number', text: String(summary.due) }),
          el('span', { className: 'review-due-label', text: '道题待复盘' }),
          el('p', { className: 'muted', text: `${summary.unreviewed} 道未复盘 · ${summary.practiceDue} 道需要再做` }),
        ]),
        el('div', { className: 'review-hero-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: queue.length ? `开始复盘 · ${queue.length}` : '暂无待复盘',
            disabled: !queue.length,
            onClick: () => startSession(queue),
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '导入阅读错题本',
            onClick: () => readingFileInput.click(),
          }),
          el('button', { type: 'button', className: 'btn btn-ghost', text: '管理错题本', onClick: ctx.openMistakes }),
          readingFileInput,
        ]),
      ]),
      el('div', { className: 'review-stats' }, [
        stat('全部错题', summary.total, '阅读 / 听力真题'),
        stat('未复盘', summary.unreviewed, '先理解错因'),
        stat('需要再做', summary.practiceDue, '到期后出现'),
        stat('已掌握', summary.reviewed, '手动标记'),
      ]),
      el('section', { className: 'card review-choice' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '选择真题范围' }),
          el('span', { className: 'badge', text: '不使用 FSRS' }),
        ]),
        el('div', { className: 'btn-row' }, [
          subjectButton('all', `全部 · ${summary.due}`),
          subjectButton('reading', `阅读 · ${buildMistakeReviewQueue(getData(), { subject: 'reading' }).length}`),
          subjectButton('listening', `听力 · ${buildMistakeReviewQueue(getData(), { subject: 'listening' }).length}`),
        ]),
        el('p', { className: 'muted', text: '复盘后手动选择“已掌握”或“需要再做”，系统只记录真题复盘状态。' }),
      ]),
      el('section', { className: 'card form-grid review-integration' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { text: '爱听写同步' }),
          el('span', { className: 'badge', text: '安装一次即可' }),
        ]),
        el('p', { className: 'muted', text: '把同步按钮拖到浏览器书签栏。在任何爱听写页面点击它都能同步阅读/听力错题本；在阅读结果页点击还会同步本次做题成绩。' }),
        el('div', { className: 'btn-row' }, [
          el('a', {
            className: 'btn btn-ghost',
            href: 'https://www.idictation.cn/ielts/read-result/',
            target: '_blank',
            rel: 'noopener',
            text: '打开爱听写阅读结果',
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '获取同步按钮',
            onClick: openIntegrationGuide,
          }),
        ]),
        syncLogBlock(),
      ]),
    );
  }

  /** Newest-first list of past iDictation syncs (device-local). */
  function syncLogBlock() {
    const log = (getMeta().syncLog || []).slice(0, 10);
    if (!log.length) return null;
    return el('div', { className: 'sync-log' }, [
      el('div', { className: 'sync-log-title', text: '最近同步' }),
      ...log.map((entry) => el('div', {
        className: 'sync-log-item',
        text: `${formatSyncTime(entry.at)} · 新增 ${entry.records || 0} 条做题记录、${entry.reading || 0} 道阅读错题、${entry.listening || 0} 道听力错题`,
      })),
    ]);
  }

  function formatSyncTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function importReadingFile(file) {
    if (!file) return;
    readingFileInput.value = '';
    try {
      const parsed = await parseStudyFile(file);
      const mistakes = parsed.mistakes.filter((item) => item.subject === 'reading');
      if (!mistakes.length) {
        toast('这个文件没有识别到阅读错题，请选择阅读错题本.xlsx', 'error');
        return;
      }
      const ok = await modal({
        title: '导入阅读错题本',
        size: 'md',
        confirmText: '导入真题复盘',
        body: el('div', { className: 'import-preview' }, [
          el('div', { className: 'import-preview-counts' }, [
            el('div', {}, [el('strong', { text: String(mistakes.length) }), el('span', { text: '阅读错题' })]),
            el('div', {}, [el('strong', { text: '独立' }), el('span', { text: '手动复盘流程' })]),
          ]),
          el('p', { className: 'muted', text: file.name }),
        ]),
      });
      if (!ok) return;
      ctx.suppressNextStoreRender();
      const result = importIeltsMistakes(mistakes);
      toast(`阅读错题已导入：新增 ${result.added} 道`, 'success');
      paintOverview();
    } catch (error) {
      toast(`${file.name}：${error.message}`, 'error');
    }
  }

  function openIntegrationGuide() {
    const loader = "javascript:(()=>{const s=document.createElement('script');s.src='https://ecoreal.github.io/study-tracker/js/idictation-bridge.js?v=4';document.documentElement.appendChild(s)})()";
    const bookmark = el('a', {
      className: 'btn btn-primary integration-bookmark',
      href: loader,
      draggable: 'true',
      text: '爱听写同步',
      title: '拖到浏览器书签栏后使用',
    });
    const address = el('input', {
      type: 'text',
      className: 'integration-url',
      value: loader,
      readonly: true,
      spellcheck: 'false',
      onClick: (event) => event.target.select(),
    });
    modal({
      title: '安装爱听写同步按钮',
      size: 'md',
      confirmText: '完成',
      body: el('div', { className: 'integration-install' }, [
        el('div', { className: 'integration-definition' }, [
          el('strong', { text: '什么是书签栏？' }),
          el('p', { className: 'muted', text: '就是浏览器顶部、网址下方那一排常用网站快捷按钮。' }),
        ]),
        el('p', { text: '方式一：先显示书签栏，再把下面的按钮拖进去。' }),
        el('p', { className: 'muted integration-shortcut', text: 'Chrome / Edge：Ctrl + Shift + B（Mac：Command + Shift + B）' }),
        el('div', { className: 'integration-bookmark-row' }, [bookmark]),
        el('div', { className: 'integration-fallback' }, [
          el('p', { text: '拖不动时，使用方式二：复制地址创建书签。' }),
          el('div', { className: 'integration-copy-row' }, [
            address,
            el('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              text: '复制地址',
              onClick: async () => {
                address.select();
                try {
                  await navigator.clipboard.writeText(loader);
                  toast('书签地址已复制', 'success');
                } catch {
                  toast('地址已选中，请按 Ctrl+C 复制', 'info');
                }
              },
            }),
          ]),
          el('ol', { className: 'integration-steps' }, [
            el('li', { text: '在当前浏览器按 Ctrl+D（Mac：Command+D）新建书签。' }),
            el('li', { text: '把书签名称改成“爱听写同步”，把网址替换为刚复制的地址。' }),
            el('li', { text: '以后打开爱听写阅读结果页，点击这个书签即可同步。' }),
          ]),
        ]),
        el('p', { className: 'muted', text: '手机浏览器通常没有可用的书签栏，手机端可以直接导出阅读错题本.xlsx后导入。' }),
      ]),
    });
  }

  function stat(label, value, sub) {
    return el('div', { className: 'review-stat' }, [
      el('span', { className: 'review-stat-label', text: label }),
      el('strong', { text: String(value) }),
      el('span', { className: 'review-stat-sub', text: sub }),
    ]);
  }

  function subjectButton(value, label) {
    return el('button', {
      type: 'button',
      className: `btn btn-sm ${subject === value ? 'btn-primary' : 'btn-ghost'}`,
      text: label,
      onClick: () => { subject = value; paintOverview(); },
    });
  }

  function startSession(queue) {
    if (!queue.length) {
      toast('这一组暂时没有待复盘题目', 'info');
      return;
    }
    paintSession({ queue, index: 0, results: { reviewed: 0, practice: 0 } });
  }

  function paintSession(session) {
    if (session.index >= session.queue.length) {
      const done = session.results.reviewed + session.results.practice;
      mount.replaceChildren(el('section', { className: 'review-complete' }, [
        el('span', { className: 'complete-mark', text: '✓' }),
        el('h3', { text: '真题复盘完成' }),
        el('p', { className: 'muted', text: `完成 ${done} 道 · 已掌握 ${session.results.reviewed} 道 · 需要再做 ${session.results.practice} 道` }),
        el('button', { type: 'button', className: 'btn btn-primary', text: '返回真题复盘', onClick: paintOverview }),
      ]));
      return;
    }
    const item = session.queue[session.index];
    const body = el('div', { className: 'study-card-body' });
    const actions = el('div', { className: 'review-rating-area', hidden: true });
    let revealed = false;
    const progress = Math.round((session.index / session.queue.length) * 100);
    mount.replaceChildren(el('section', { className: 'review-session' }, [
      el('div', { className: 'review-session-head' }, [
        el('button', { type: 'button', className: 'btn btn-ghost btn-sm', text: '退出', onClick: paintOverview }),
        el('div', { className: 'review-session-progress' }, [
          el('span', { text: `${session.index + 1} / ${session.queue.length}` }),
          el('div', { className: 'progress', role: 'progressbar', 'aria-valuenow': progress }, [
            el('div', { className: 'progress-fill', style: { width: `${progress}%` } }),
          ]),
        ]),
        el('span', { className: 'badge', text: item.subject === 'reading' ? '阅读真题' : '听力真题' }),
      ]),
      el('div', { className: 'study-card' }, [body, actions]),
    ]));

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      body.querySelector('.reveal-answer')?.remove();
      const mistake = item.mistake;
      body.append(el('div', { className: 'study-answer' }, [
        mistake.correctAnswer ? el('div', { className: 'answer-line correct', text: `正确答案：${mistake.correctAnswer}` }) : null,
        mistake.orig ? el('blockquote', {}, [el('span', { text: mistake.orig })]) : null,
        mistake.sub ? el('p', { text: `同义替换：${mistake.sub}` }) : null,
        mistake.reason ? el('p', { text: `错因：${mistake.reason}` }) : null,
        mistake.note ? el('p', { className: 'muted', text: mistake.note }) : null,
      ]));
      actions.hidden = false;
      actions.replaceChildren(
        el('p', { className: 'rating-question', text: '复盘结果' }),
        el('div', { className: 'btn-row' }, [
          actionButton('reviewed', '已掌握', 'btn-primary'),
          actionButton('practice', '需要再做', 'btn-ghost'),
        ]),
      );
    };
    body.append(
      el('div', { className: 'study-card-kicker' }, [
        el('span', { text: `${item.entry.paper || '未命名'} · ${item.entry.date || ''}` }),
        item.mistake.part ? el('span', { className: 'badge', text: `P${item.mistake.part}` }) : null,
      ]),
      el('div', { className: 'mistake-prompt' }, [
        item.mistake.externalRef ? el('strong', { text: item.mistake.externalRef }) : null,
        el('p', { text: item.mistake.question || item.mistake.ans || '回忆这道错题的正确答案' }),
        item.mistake.userAnswer ? el('div', { className: 'answer-line wrong', text: `上次作答：${item.mistake.userAnswer}` }) : null,
      ]),
      el('button', { type: 'button', className: 'btn btn-primary reveal-answer', text: '显示答案并复盘', onClick: reveal }),
    );

    function actionButton(status, label, style) {
      return el('button', {
        type: 'button',
        className: `btn ${style}`,
        text: label,
        onClick: () => {
          ctx.suppressNextStoreRender();
          markMistakeReview({
            id: item.id,
            status,
            nextPracticeDate: status === 'practice' ? addDaysIso(new Date(), 1) : null,
          });
          session.results[status] += 1;
          session.index += 1;
          paintSession(session);
        },
      });
    }
  }

  function addDaysIso(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next.toISOString();
  }

  paintOverview();
}

export function renderVocabularyPanel(container, ctx) {
  const fileInput = el('input', {
    type: 'file',
    accept: '.json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    multiple: true,
    hidden: true,
  });
  let query = '';
  let source = 'all';
  let status = 'all';
  let visible = 60;
  const listRoot = el('div');
  const countLabel = el('span', { className: 'muted' });
  const data = getData();
  const sources = [...new Set((data.vocabulary || []).map((word) => word.source).filter(Boolean))].sort();
  const search = el('input', {
    type: 'search',
    placeholder: '搜索单词、释义或章节',
    onInput: (event) => {
      query = event.target.value.trim().toLocaleLowerCase();
      visible = 60;
      paintList();
    },
  });
  const sourceSelect = el('select', {
    onChange: (event) => { source = event.target.value; visible = 60; paintList(); },
  }, [
    el('option', { value: 'all', text: '全部词书' }),
    ...sources.map((value) => el('option', { value, text: value })),
  ]);
  const statusSelect = el('select', {
    onChange: (event) => { status = event.target.value; visible = 60; paintList(); },
  }, [
    el('option', { value: 'all', text: '全部进度' }),
    el('option', { value: 'new', text: '新词' }),
    el('option', { value: 'due', text: '待复习' }),
    el('option', { value: 'scheduled', text: '已安排' }),
  ]);

  fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));
  container.append(
    el('section', { className: 'import-toolbar' }, [
      el('div', {}, [
        el('h3', { text: '词汇库' }),
        el('p', { className: 'muted', text: `${data.vocabulary.length} 个词 · 阅读 538 词 + 爱听写听力错词` }),
      ]),
      el('div', { className: 'btn-row' }, [
        el('a', {
          className: 'btn btn-ghost',
          href: 'https://www.idictation.cn/main/book',
          target: '_blank',
          rel: 'noopener',
          text: '打开 iDictation 词书',
        }),
        el('a', {
          className: 'btn btn-ghost',
          href: 'https://www.idictation.cn/main/errorBook',
          target: '_blank',
          rel: 'noopener',
          text: '打开错题本',
        }),
        el('button', { type: 'button', className: 'btn btn-primary', text: '导入文件', onClick: () => fileInput.click() }),
        el('button', { type: 'button', className: 'btn btn-ghost', text: '添加单词', onClick: () => editWord(null) }),
        fileInput,
      ]),
    ]),
    el('section', { className: 'card vocabulary-panel' }, [
      el('div', { className: 'vocabulary-filters' }, [search, sourceSelect, statusSelect]),
      el('div', { className: 'card-header vocabulary-count' }, [el('h3', { text: '单词' }), countLabel]),
      listRoot,
    ]),
  );
  paintList();

  async function handleFiles(files) {
    if (!files.length) return;
    const imported = [];
    for (const file of files) {
      try {
        imported.push(await parseStudyFile(file));
      } catch (error) {
        toast(`${file.name}：${error.message}`, 'error');
      }
    }
    fileInput.value = '';
    if (!imported.length) return;
    const words = imported.flatMap((item) => item.words);
    const mistakes = imported.flatMap((item) => item.mistakes);
    const ok = await modal({
      title: '确认导入',
      size: 'md',
      confirmText: '导入数据',
      body: el('div', { className: 'import-preview' }, [
        el('div', { className: 'import-preview-counts' }, [
          el('div', {}, [el('strong', { text: String(words.length) }), el('span', { text: '词汇' })]),
          el('div', {}, [el('strong', { text: String(mistakes.length) }), el('span', { text: '真题错题' })]),
        ]),
        el('p', { className: 'muted', text: imported.map((item) => item.name).join('、') }),
      ]),
    });
    if (!ok) return;
    const wordResult = upsertVocabulary(words);
    const mistakeResult = importIeltsMistakes(mistakes);
    toast(`已新增 ${wordResult.added} 个词、${mistakeResult.added} 道真题错题`, 'success');
  }

  function filteredWords() {
    const now = new Date();
    return (getData().vocabulary || []).filter((word) => {
      if (source !== 'all' && word.source !== source) return false;
      const wordStatus = !word.review ? 'new' : new Date(word.review.due) <= now ? 'due' : 'scheduled';
      if (status !== 'all' && status !== wordStatus) return false;
      if (!query) return true;
      return [word.word, word.definition, word.chapter, word.source]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    }).sort((a, b) => {
      const dueA = a.review ? Date.parse(a.review.due) : 0;
      const dueB = b.review ? Date.parse(b.review.due) : 0;
      if (dueA !== dueB) return dueA - dueB;
      return (Number(b.errorCount) || 0) - (Number(a.errorCount) || 0);
    });
  }

  function paintList() {
    const words = filteredWords();
    countLabel.textContent = `${words.length} 个`;
    listRoot.replaceChildren();
    if (!words.length) {
      listRoot.append(el('div', { className: 'empty', text: getData().vocabulary.length ? '没有符合条件的单词' : '导入词表后从这里开始复习' }));
      return;
    }
    listRoot.append(el('div', { className: 'vocabulary-list' }, words.slice(0, visible).map(wordRow)));
    if (words.length > visible) {
      listRoot.append(el('button', {
        type: 'button',
        className: 'btn btn-ghost vocabulary-more',
        text: `继续显示 · 还剩 ${words.length - visible}`,
        onClick: () => { visible += 60; paintList(); },
      }));
    }
  }

  function wordRow(word) {
    return el('div', { className: 'vocabulary-row' }, [
      el('div', { className: 'vocabulary-word' }, [
        el('strong', { text: word.word }),
        word.phonetic ? el('span', { text: `/${word.phonetic}/` }) : null,
      ]),
      el('div', { className: 'vocabulary-meaning' }, [
        el('span', { text: word.definition || '暂无释义' }),
        el('small', { text: [word.source, word.chapter].filter(Boolean).join(' · ') || '手动添加' }),
      ]),
      el('div', { className: 'vocabulary-status' }, [
        word.errorCount ? el('span', { className: 'badge warn', text: `错 ${word.errorCount}` }) : null,
        el('span', { className: 'badge', text: reviewStateLabel(word.review) }),
      ]),
      el('div', { className: 'vocabulary-actions' }, [
        el('button', { type: 'button', className: 'btn btn-sm btn-ghost', text: '编辑', onClick: () => editWord(word) }),
        el('button', {
          type: 'button',
          className: 'btn btn-sm btn-danger',
          text: '删除',
          onClick: async () => {
            const ok = await modal({
              title: '删除单词',
              body: el('p', { text: `确定删除 “${word.word}” 及其复习进度？` }),
              confirmText: '删除',
              danger: true,
            });
            if (ok) removeVocabulary(word.id);
          },
        }),
      ]),
    ]);
  }

  function editWord(word) {
    const field = (label, value = '', type = 'text') => {
      const input = el(type === 'textarea' ? 'textarea' : 'input', type === 'textarea' ? { rows: 3 } : { type });
      input.value = value;
      return { input, row: el('div', { className: 'form-row' }, [el('label', { text: label }), input]) };
    };
    const wordField = field('单词', word?.word);
    const definition = field('释义', word?.definition, 'textarea');
    const phonetic = field('音标', word?.phonetic);
    const example = field('例句', word?.example, 'textarea');
    const related = field('同义替换 / 关联词', word?.related, 'textarea');
    const sourceField = field('词书', word?.source || '手动添加');
    const chapter = field('章节', word?.chapter);
    modal({
      title: word ? '编辑单词' : '添加单词',
      size: 'lg',
      confirmText: '保存',
      body: el('div', { className: 'form-grid' }, [
        wordField.row, definition.row, phonetic.row, related.row, example.row, sourceField.row, chapter.row,
      ]),
    }).then((ok) => {
      if (!ok) return;
      const patch = {
        word: wordField.input.value.trim(),
        definition: definition.input.value.trim(),
        phonetic: phonetic.input.value.trim(),
        example: example.input.value.trim(),
        related: related.input.value.trim(),
        source: sourceField.input.value.trim(),
        chapter: chapter.input.value.trim(),
      };
      if (!patch.word) {
        toast('请填写单词', 'error');
        return;
      }
      if (word) updateVocabulary(word.id, patch);
      else addVocabulary(patch);
      toast('单词已保存', 'success');
    });
  }
}

export function renderReviewPreferences(container, ctx) {
  const settings = getData().settings?.review || {};
  const mode = el('select', {}, [
    el('option', { value: 'recognition', text: '看词回忆释义' }),
    el('option', { value: 'spelling', text: '根据释义拼写' }),
  ]);
  mode.value = settings.wordMode || 'recognition';
  container.append(el('section', { className: 'card form-grid review-settings' }, [
    el('h3', { text: '复习偏好' }),
    el('div', { className: 'form-row' }, [el('label', { text: '单词模式' }), mode]),
    el('p', { className: 'muted', text: '词汇复习不设置每日上限，到期词和新词都可以按需学习；真题错题请在“真题复盘”中单独处理。' }),
    el('div', { className: 'btn-row' }, [
      el('button', {
        type: 'button',
        className: 'btn btn-primary',
        text: '保存偏好',
        onClick: () => {
          ctx.suppressNextStoreRender();
          updateSettings({
            review: {
              wordMode: mode.value,
            },
          });
          toast('复习偏好已保存', 'success');
        },
      }),
    ]),
  ]));
}

function speakWord(word) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = getData().settings?.review?.accent === 'en-US' ? 'en-US' : 'en-GB';
  utterance.rate = 0.85;
  speechSynthesis.speak(utterance);
}

function speakButton(word) {
  return el('button', {
    type: 'button',
    className: 'btn btn-ghost btn-icon speak-button',
    title: '朗读单词',
    'aria-label': `朗读 ${word}`,
    text: '🔊',
    onClick: () => {
      if (!('speechSynthesis' in window)) {
        toast('当前浏览器不支持朗读', 'error');
        return;
      }
      speakWord(word);
    },
  });
}
