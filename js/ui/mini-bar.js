/**
 * Global floating mini pomodoro bar (visible on all views).
 */

import { el } from './components.js';
import { getData } from '../store.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} mount
 * @param {{ navigate: (v: string) => void }} ctx
 */
export function mountMiniBar(mount, ctx) {
  const timeEl = el('span', { className: 'mini-time', text: '25:00' });
  const modeEl = el('span', { className: 'mini-mode', text: '专注' });
  const taskEl = el('span', { className: 'mini-task', hidden: true });
  const statusDot = el('span', { className: 'mini-dot' });

  const toggleBtn = el('button', {
    type: 'button',
    className: 'btn btn-primary btn-sm',
    text: '开始',
    onClick: (e) => {
      e.stopPropagation();
      pomodoro.toggle();
    },
  });

  const openArea = el('button', {
    type: 'button',
    className: 'mini-open-area',
    title: '打开番茄钟',
    'aria-label': '打开番茄钟',
    onClick: () => ctx.navigate('timer'),
  }, [statusDot, modeEl, taskEl, timeEl]);

  const bar = el('div', {
    className: 'mini-bar hidden',
  }, [
    openArea,
    toggleBtn,
    el('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      text: '打开',
      onClick: (e) => {
        e.stopPropagation();
        ctx.navigate('timer');
      },
    }),
  ]);

  mount.replaceChildren(bar);

  return pomodoro.subscribePomodoro((st) => {
    const idleFresh = !st.running && st.remainingMs === st.totalMs;
    bar.hidden = idleFresh;
    mount.classList.toggle('is-visible', !idleFresh);
    document.body.classList.toggle('mini-timer-visible', !idleFresh);
    bar.classList.toggle('running', st.running);
    bar.classList.toggle('paused', !st.running && st.remainingMs < st.totalMs);
    bar.classList.toggle('mode-short', st.mode === 'short');
    bar.classList.toggle('mode-long', st.mode === 'long');

    modeEl.textContent = st.modeLabel;
    const task = st.taskId
      ? (getData().tasks.find((item) => item.id === st.taskId) || null)
      : null;
    taskEl.textContent = task?.text || '';
    taskEl.hidden = !task;
    timeEl.textContent = pomodoro.formatMs(st.remainingMs);
    toggleBtn.textContent = st.running ? '暂停' : st.remainingMs < st.totalMs ? '继续' : '开始';
    openArea.title = task ? `${task.text} · 打开番茄钟` : '打开番茄钟';
    openArea.setAttribute('aria-label', task ? `${task.text}，打开番茄钟` : '打开番茄钟');
  });
}
