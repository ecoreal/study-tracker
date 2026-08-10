import { getData, subscribe, setOnChangeHook, updateSettings, getMeta, setMeta, upsertVocabulary } from './store.js';
import { schedulePush, initSync, subscribeSync } from './gist.js';
import { applyTheme, toggleTheme, watchSystemTheme, applyAppearance } from './theme.js';
import { toast } from './ui/components.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderTimer } from './ui/timer.js';
import { renderTasks } from './ui/tasks.js';
import { renderIelts } from './ui/ielts-view.js';
import { renderStats } from './ui/stats-view.js';
import { renderSettings } from './ui/settings.js';
import { mountMiniBar } from './ui/mini-bar.js';
import * as pomodoro from './pomodoro.js';
import { vocabularyFromJson } from './importer.js';

const VIEWS = {
  dashboard: renderDashboard,
  timer: renderTimer,
  tasks: renderTasks,
  ielts: renderIelts,
  stats: renderStats,
  settings: renderSettings,
};

let currentView = 'dashboard';
let renderQueued = false;
let skipNextStoreRender = false;
/** When true, next store-driven re-render is skipped for timer view (duration edits still apply via pomodoro). */
let skipTimerRerender = false;

const viewRoot = document.getElementById('view-root');
const nav = document.getElementById('main-nav');
const syncEl = document.getElementById('sync-status');
const themeBtn = document.getElementById('theme-toggle');
const miniMount = document.getElementById('mini-bar-root');

const ctx = {
  navigate(view, subview = '') {
    if (!VIEWS[view]) return;
    if (currentView === view && document.body.dataset.view === view && !subview) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    currentView = view;
    const nextUrl = view === 'dashboard'
      ? `${location.pathname}${location.search}`
      : `#${view}${subview ? `=${subview}` : ''}`;
    history.pushState(null, '', nextUrl);
    paintNav();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  refresh() {
    render();
  },
  /** Call before updateSettings from timer page to avoid wiping inputs */
  suppressTimerRerender() {
    skipTimerRerender = true;
  },
  /** Keep stateful workflows (for example a review session) mounted for one store write. */
  suppressNextStoreRender() {
    skipNextStoreRender = true;
  },
};

function paintNav() {
  nav.querySelectorAll('.nav-item').forEach((btn) => {
    const active = btn.dataset.view === currentView;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

function render() {
  if (viewRoot._cleanup) {
    try {
      viewRoot._cleanup();
    } catch { /* ignore */ }
    viewRoot._cleanup = null;
  }
  viewRoot.replaceChildren();
  // Remove skeleton — view will fill content
  viewRoot.classList.remove('skeleton-loaded');
  const fn = VIEWS[currentView] || renderDashboard;
  fn(viewRoot, ctx);
  // body class for padding under mini bar
  document.body.dataset.view = currentView;
}

function queueRender() {
  if (skipNextStoreRender) {
    skipNextStoreRender = false;
    return;
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // Timer has its own subscription — full remount on every store write breaks inputs & ring animation
    if (currentView === 'timer') {
      if (skipTimerRerender) {
        skipTimerRerender = false;
        return;
      }
      // Still refresh if data changed from outside (e.g. gist pull) — remount is OK then
      render();
      return;
    }
    render();
  });
}

function readHash() {
  const h = (location.hash || '').replace(/^#/, '');
  // 支持子 tab 直达：如 #ielts=records → 雅思 → 记录
  const base = h.split('=')[0];
  if (h && VIEWS[h]) currentView = h;
  else if (base && VIEWS[base]) currentView = base;
  else currentView = 'dashboard';
}

// Nav clicks
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  ctx.navigate(btn.dataset.view);
});

window.addEventListener('hashchange', () => {
  const previous = currentView;
  readHash();
  paintNav();
  if (previous !== currentView || document.body.dataset.view !== currentView) render();
});

window.addEventListener('popstate', () => {
  const previous = currentView;
  readHash();
  paintNav();
  if (previous !== currentView || document.body.dataset.view !== currentView) render();
});

nav.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const items = [...nav.querySelectorAll('.nav-item')];
  const current = Math.max(0, items.indexOf(document.activeElement));
  let next = current;
  if (e.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
  if (e.key === 'ArrowRight') next = (current + 1) % items.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = items.length - 1;
  e.preventDefault();
  items[next].focus();
});

// Theme & appearance
applyTheme(getData().settings.theme || 'system');
applyAppearance(getData().settings);
watchSystemTheme(() => getData().settings.theme || 'system');
themeBtn.addEventListener('click', () => {
  const next = toggleTheme(getData().settings.theme);
  updateSettings({ theme: next });
  applyTheme(next);
});
syncEl.addEventListener('click', () => ctx.navigate('settings'));

// Sync status chip
subscribeSync((s) => {
  syncEl.textContent = s.message;
  syncEl.className = 'sync-status';
  if (s.status === 'ok') syncEl.classList.add('ok');
  else if (s.status === 'warn') syncEl.classList.add('warn');
  else if (s.status === 'err') syncEl.classList.add('err');
  else if (s.status === 'busy') syncEl.classList.add('busy');
  syncEl.title = s.lastSync
    ? `上次同步：${new Date(s.lastSync).toLocaleString()}`
    : '打开同步设置';
});

// Data change → re-render + debounced gist push
subscribe(() => queueRender());
setOnChangeHook(() => schedulePush());

// Pomodoro complete toast
pomodoro.setOnComplete(({ skipped, type, nextMode }) => {
  if (skipped) toast('已跳过当前阶段', 'info');
  else if (type === 'focus') {
    const nextLabel = nextMode === 'long' ? '长休息' : '短休息';
    toast(`专注完成 → ${nextLabel}`, 'success');
  } else toast('休息结束 → 专注', 'success');
  if (currentView !== 'timer') queueRender();
});

// Mini bar
if (miniMount) mountMiniBar(miniMount, ctx);

// Space to toggle pomodoro when not typing
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  e.preventDefault();
  pomodoro.toggle();
});

// Global keyboard shortcuts for view navigation
const SHORTCUTS = {
  d: 'dashboard',
  t: 'timer',
  k: 'tasks',
  i: 'ielts',
  a: 'stats',
  s: 'settings',
};
window.addEventListener('keydown', (e) => {
  // Ignore if typing in an input or meta/ctrl/alt is held
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
  if (e.key in SHORTCUTS && SHORTCUTS[e.key] !== currentView) {
    e.preventDefault();
    ctx.navigate(SHORTCUTS[e.key]);
  }
});

// Boot
readHash();
paintNav();
render();
initSync()
  .catch(() => {})
  .then(() => seedBundledVocabulary())
  .catch(() => {});

console.info('[study-tracker] ready');

async function seedBundledVocabulary() {
  const meta = getMeta();
  if (meta.bundledVocabularyVersion === '538-v1') return;
  const response = await fetch('./雅思阅读538考点词.json', { cache: 'no-cache' });
  if (!response.ok) return;
  const source = await response.json();
  const words = vocabularyFromJson(source, '雅思阅读538考点词');
  if (!words.length) return;
  const result = upsertVocabulary(words);
  setMeta({
    bundledVocabularyVersion: '538-v1',
    bundledVocabularyCount: words.length,
  });
  if (result.added || result.updated) {
    toast(`已自动导入 538 考点词，新增 ${result.added} 个`, 'success');
  }
}
