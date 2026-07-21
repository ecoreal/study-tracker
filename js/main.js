import { getData, subscribe, setOnChangeHook, updateSettings } from './store.js';
import { schedulePush, initSync, subscribeSync } from './gist.js';
import { applyTheme, toggleTheme, watchSystemTheme } from './theme.js';
import { toast } from './ui/components.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderTimer } from './ui/timer.js';
import { renderTasks } from './ui/tasks.js';
import { renderLogs } from './ui/logs.js';
import { renderIelts } from './ui/ielts-view.js';
import { renderStats } from './ui/stats-view.js';
import { renderSettings } from './ui/settings.js';
import { mountMiniBar } from './ui/mini-bar.js';
import * as pomodoro from './pomodoro.js';

const VIEWS = {
  dashboard: renderDashboard,
  timer: renderTimer,
  tasks: renderTasks,
  logs: renderLogs,
  ielts: renderIelts,
  stats: renderStats,
  settings: renderSettings,
};

let currentView = 'dashboard';
let renderQueued = false;
/** When true, next store-driven re-render is skipped for timer view (duration edits still apply via pomodoro). */
let skipTimerRerender = false;

const viewRoot = document.getElementById('view-root');
const nav = document.getElementById('main-nav');
const syncEl = document.getElementById('sync-status');
const themeBtn = document.getElementById('theme-toggle');
const miniMount = document.getElementById('mini-bar-root');

const ctx = {
  navigate(view) {
    if (!VIEWS[view]) return;
    currentView = view;
    location.hash = view === 'dashboard' ? '' : view;
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
};

function paintNav() {
  nav.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
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
  const fn = VIEWS[currentView] || renderDashboard;
  fn(viewRoot, ctx);
  // body class for padding under mini bar
  document.body.dataset.view = currentView;
}

function queueRender() {
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
  if (h && VIEWS[h]) currentView = h;
  else currentView = 'dashboard';
}

// Nav clicks
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  ctx.navigate(btn.dataset.view);
});

window.addEventListener('hashchange', () => {
  readHash();
  paintNav();
  render();
});

// Theme
applyTheme(getData().settings.theme || 'system');
watchSystemTheme(() => getData().settings.theme || 'system');
themeBtn.addEventListener('click', () => {
  const next = toggleTheme(getData().settings.theme);
  updateSettings({ theme: next });
  applyTheme(next);
});

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
    : '同步状态';
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

// Boot
readHash();
paintNav();
render();
initSync().catch(() => {});

console.info('[study-tracker] ready');
