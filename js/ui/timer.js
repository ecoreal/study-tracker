import { el, toast } from './components.js';
import { getData } from '../store.js';
import * as pomodoro from '../pomodoro.js';

/**
 * @param {HTMLElement} root
 * @param {{ refresh: () => void }} ctx
 */
export function renderTimer(root, ctx) {
  const data = getData();
  const { todayStr } = awaitableToday();
  const tasks = data.tasks.filter((t) => t.date === todayStr && !t.done);

  const ringWrap = el('div', { className: 'timer-ring-wrap' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'timer-ring');
  svg.setAttribute('viewBox', '0 0 120 120');

  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('class', 'timer-ring-track');
  track.setAttribute('cx', '60');
  track.setAttribute('cy', '60');
  track.setAttribute('r', '52');

  const progress = document.createElementNS(svgNS, 'circle');
  progress.setAttribute('class', 'timer-ring-progress');
  progress.setAttribute('cx', '60');
  progress.setAttribute('cy', '60');
  progress.setAttribute('r', '52');
  const C = 2 * Math.PI * 52;
  progress.setAttribute('stroke-dasharray', String(C));
  progress.setAttribute('stroke-dashoffset', '0');

  svg.append(track, progress);

  const center = el('div', { className: 'timer-center' }, [
    el('div', { className: 'timer-mode', dataset: { role: 'mode' }, text: '专注' }),
    el('div', { className: 'timer-time', dataset: { role: 'time' }, text: '25:00' }),
    el('div', { className: 'timer-sub', dataset: { role: 'sub' }, text: '准备开始' }),
  ]);

  ringWrap.append(svg, center);

  const modeTabs = el('div', { className: 'mode-tabs' }, [
    modeBtn('focus', '专注'),
    modeBtn('short', '短休'),
    modeBtn('long', '长休'),
  ]);

  function modeBtn(mode, label) {
    return el('button', {
      type: 'button',
      className: 'btn btn-ghost btn-sm',
      dataset: { mode },
      text: label,
      onClick: () => {
        const st = pomodoro.getState();
        if (st.running) {
          toast('请先暂停计时再切换模式', 'error');
          return;
        }
        pomodoro.setMode(mode);
      },
    });
  }

  const controls = el('div', { className: 'timer-controls' }, [
    el('button', {
      type: 'button',
      className: 'btn btn-primary',
      dataset: { role: 'toggle' },
      text: '开始',
      onClick: () => {
        const st = pomodoro.getState();
        if (st.running) pomodoro.pause();
        else pomodoro.start();
      },
    }),
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: '重置',
      onClick: () => pomodoro.reset(),
    }),
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: '跳过',
      onClick: () => {
        if (confirm('确定跳过当前阶段？已进行的专注可能仍会记入。')) {
          pomodoro.skip();
        }
      },
    }),
  ]);

  const taskSelect = el(
    'select',
    {
      onChange: (e) => pomodoro.setTaskId(e.target.value || null),
    },
    [
      el('option', { value: '', text: '不关联任务' }),
      ...tasks.map((t) => el('option', { value: t.id, text: t.text })),
    ],
  );

  const side = el('section', { className: 'card' }, [
    el('h3', { text: '本轮设置' }),
    el('div', { className: 'form-grid' }, [
      el('div', { className: 'form-row' }, [
        el('label', { text: '关联今日任务' }),
        taskSelect,
        el('p', { className: 'help', text: '完成后仍可在日志里补充说明。' }),
      ]),
      el('div', { className: 'form-row' }, [
        el('label', { text: '当前配置（可在设置中修改）' }),
        el('p', {
          className: 'help',
          text: `专注 ${data.settings.pomodoro.focus} 分钟 · 短休 ${data.settings.pomodoro.shortBreak} 分钟 · 长休 ${data.settings.pomodoro.longBreak} 分钟 · 每 ${data.settings.pomodoro.longEvery} 个专注后长休`,
        }),
      ]),
      el('div', { className: 'form-row' }, [
        el('label', { text: '今日已完成专注' }),
        el('p', {
          className: 'help',
          dataset: { role: 'focus-count-hint' },
          text: '',
        }),
      ]),
    ]),
  ]);

  const panel = el('section', { className: 'card timer-panel' }, [
    modeTabs,
    ringWrap,
    controls,
  ]);

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '番茄钟' }),
          el('p', { text: '专注一段，休息一段。结束时会桌面通知（需授权）。' }),
        ]),
      ]),
      el('div', { className: 'timer-layout' }, [panel, side]),
    ]),
  );

  const unsub = pomodoro.subscribePomodoro((st) => {
    ringWrap.classList.remove('mode-short', 'mode-long');
    if (st.mode === 'short') ringWrap.classList.add('mode-short');
    if (st.mode === 'long') ringWrap.classList.add('mode-long');

    const ratio = st.totalMs ? st.remainingMs / st.totalMs : 0;
    progress.setAttribute('stroke-dashoffset', String(C * (1 - ratio)));

    center.querySelector('[data-role="mode"]').textContent = st.modeLabel;
    center.querySelector('[data-role="time"]').textContent = pomodoro.formatMs(st.remainingMs);
    center.querySelector('[data-role="sub"]').textContent = st.running
      ? '进行中'
      : st.remainingMs === st.totalMs
        ? '准备开始'
        : '已暂停';

    const toggle = controls.querySelector('[data-role="toggle"]');
    if (toggle) toggle.textContent = st.running ? '暂停' : '开始';

    modeTabs.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === st.mode);
    });

    const hint = side.querySelector('[data-role="focus-count-hint"]');
    if (hint) {
      const todayFocus = getData().sessions.filter(
        (s) => s.date === todayStr && s.type === 'focus',
      ).length;
      hint.textContent = `今日记录 ${todayFocus} 个 · 本轮周期计数 ${st.focusCount}`;
    }
  });

  // cleanup when view destroyed — main clears root, GC is fine; also stop leaking:
  root._cleanup = () => unsub();
}

function awaitableToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { todayStr: `${y}-${m}-${day}` };
}
