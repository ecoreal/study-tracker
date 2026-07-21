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

const viewRoot = document.getElementById('view-root');
const nav = document.getElementById('main-nav');
const syncEl = document.getElementById('sync-status');
const themeBtn = document.getElementById('theme-toggle');

const ctx = {
  navigate(view) {
    if (!VIEWS[view]) return;
    currentView = view;
    location.hash = view === 'dashboard' ? '' : view;
    paintNav();
    render();
  },
  refresh() {
    render();
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
}

function queueRender() {
  if (renderQueued) return;
  // Don't thrash timer view every tick from store; store changes are rare.
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // Keep timer running UI via its own subscription; full re-render on data change
    if (currentView === 'timer') {
      // re-render timer side panels (task list) but pomodoro sub re-binds
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
});

// Data change → re-render + debounced gist push
subscribe(() => queueRender());
setOnChangeHook(() => schedulePush());

// Pomodoro complete toast
pomodoro.setOnComplete(({ skipped, type }) => {
  if (skipped) toast('已跳过当前阶段', 'info');
  else if (type === 'focus') toast('专注完成，休息一下！', 'success');
  else toast('休息结束', 'success');
  // refresh stats on other views
  if (currentView !== 'timer') queueRender();
});

// Boot
readHash();
paintNav();
render();
initSync().catch(() => {});

console.info('[study-tracker] ready');
