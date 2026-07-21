/**
 * Global floating mini pomodoro bar (visible on all views).
 */

import { el } from './components.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} mount
 * @param {{ navigate: (v: string) => void }} ctx
 */
export function mountMiniBar(mount, ctx) {
  const timeEl = el('span', { className: 'mini-time', text: '25:00' });
  const modeEl = el('span', { className: 'mini-mode', text: '专注' });
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

  const bar = el('div', {
    className: 'mini-bar hidden',
    title: '点击打开番茄钟 · 空格键开始/暂停',
    onClick: () => ctx.navigate('timer'),
  }, [
    statusDot,
    modeEl,
    timeEl,
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
    // Show when running, paused mid-round, or always when not on timer? Prefer always subtle, emphasize when active.
    const idleFresh = !st.running && st.remainingMs === st.totalMs;
    bar.classList.toggle('hidden', idleFresh && false); // always show for discoverability
    bar.classList.toggle('running', st.running);
    bar.classList.toggle('paused', !st.running && st.remainingMs < st.totalMs);
    bar.classList.toggle('mode-short', st.mode === 'short');
    bar.classList.toggle('mode-long', st.mode === 'long');

    modeEl.textContent = st.modeLabel;
    timeEl.textContent = pomodoro.formatMs(st.remainingMs);
    toggleBtn.textContent = st.running ? '暂停' : st.remainingMs < st.totalMs ? '继续' : '开始';
  });
}
