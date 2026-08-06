import { el, toast, confirmModal } from './components.js';
import { getData, updateSettings, todayStr } from '../store.js';
import * as pomodoro from '../pomodoro.js';

const FOCUS_PRESETS = [15, 25, 45, 50, 60, 90];
const SHORT_PRESETS = [3, 5, 10, 15];
const LONG_PRESETS = [15, 20, 30, 45];

/**
 * @param {HTMLElement} root
 * @param {{ refresh: () => void }} ctx
 */
export function renderTimer(root, ctx) {
  const data = getData();
  const p0 = data.settings.pomodoro;
  const tasks = data.tasks.filter((t) => t.date === todayStr() && !t.done);
  const suppress = () => ctx.suppressTimerRerender && ctx.suppressTimerRerender();

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
        syncDurationInputs();
      },
    });
  }

  // —— 自定义时长 ——
  const focusIn = minInput(p0.focus);
  const shortIn = minInput(p0.shortBreak);
  const longIn = minInput(p0.longBreak);
  const everyIn = minInput(p0.longEvery, 1, 12);
  const customRoundIn = minInput(p0.focus); // 当前模式本轮时长

  const durationHint = el('p', {
    className: 'help',
    dataset: { role: 'duration-hint' },
    text: '',
  });

  function applySavedDurations({ toastOk = true } = {}) {
    const focus = clamp(focusIn.value, 1, 180, 25);
    const shortBreak = clamp(shortIn.value, 1, 60, 5);
    const longBreak = clamp(longIn.value, 1, 90, 15);
    const longEvery = clamp(everyIn.value, 1, 12, 4);
    focusIn.value = String(focus);
    shortIn.value = String(shortBreak);
    longIn.value = String(longBreak);
    everyIn.value = String(longEvery);

    suppress();
    updateSettings({ pomodoro: { focus, shortBreak, longBreak, longEvery } });

    const st = pomodoro.getState();
    if (st.running) {
      if (toastOk) toast('已保存默认时长；当前计时结束后生效', 'info');
      return;
    }
    // 按当前模式应用新默认
    pomodoro.reloadDurationsIfIdle();
    syncDurationInputs();
    if (toastOk) toast('时长已更新', 'success');
  }

  function applyCustomRound() {
    const st = pomodoro.getState();
    if (st.running) {
      toast('请先暂停再改本轮时长', 'error');
      return;
    }
    const minutes = clamp(customRoundIn.value, 1, 180, 25);
    customRoundIn.value = String(minutes);
    pomodoro.setCustomDuration(minutes);
    toast(`本轮设为 ${minutes} 分钟`, 'success');
  }

  function setPreset(kind, minutes) {
    if (kind === 'focus') focusIn.value = String(minutes);
    if (kind === 'short') shortIn.value = String(minutes);
    if (kind === 'long') longIn.value = String(minutes);
    applySavedDurations({ toastOk: true });
    // 若当前模式匹配，同步本轮输入
    const st = pomodoro.getState();
    if (
      (kind === 'focus' && st.mode === 'focus') ||
      (kind === 'short' && st.mode === 'short') ||
      (kind === 'long' && st.mode === 'long')
    ) {
      customRoundIn.value = String(minutes);
    }
  }

  function syncDurationInputs() {
    const p = getData().settings.pomodoro;
    focusIn.value = String(p.focus);
    shortIn.value = String(p.shortBreak);
    longIn.value = String(p.longBreak);
    everyIn.value = String(p.longEvery);
    const st = pomodoro.getState();
    const mins = Math.max(1, Math.round(st.totalMs / 60000));
    customRoundIn.value = String(mins);
    durationHint.textContent = st.running
      ? '计时进行中：改默认时长会在本轮结束后生效；改本轮请先暂停。'
      : '可改默认时长，或只改「本轮分钟」后点应用。';
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
      onClick: () => {
        pomodoro.reset();
        syncDurationInputs();
      },
    }),
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: '跳过',
      onClick: async () => {
          const ok = await confirmModal({
            title: '跳过当前阶段',
            message: '确定跳过当前阶段？已进行的专注可能仍会记入。',
            confirmText: '跳过',
            danger: true,
          });
          if (!ok) return;
          pomodoro.skip();
          syncDurationInputs();
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
    el('h3', { text: '时长设置' }),
    el('div', { className: 'form-grid' }, [
      el('div', { className: 'form-row' }, [
        el('label', { text: '本轮分钟（仅当前阶段）' }),
        el('div', { className: 'btn-row' }, [
          customRoundIn,
          el('button', {
            type: 'button',
            className: 'btn btn-primary btn-sm',
            text: '应用本轮',
            onClick: applyCustomRound,
          }),
        ]),
      ]),
      el('div', { className: 'form-row inline' }, [
        field('默认专注', focusIn),
        field('默认短休', shortIn),
        field('默认长休', longIn),
        field('每 N 个专注后长休', everyIn),
      ]),
      el('div', { className: 'btn-row' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-primary btn-sm',
          text: '保存为默认',
          onClick: () => applySavedDurations({ toastOk: true }),
        }),
      ]),
      el('div', { className: 'form-row' }, [
        el('label', { text: '专注快捷' }),
        el(
          'div',
          { className: 'btn-row presets' },
          FOCUS_PRESETS.map((m) =>
            el('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              text: `${m} 分`,
              onClick: () => setPreset('focus', m),
            }),
          ),
        ),
      ]),
      el('div', { className: 'form-row' }, [
        el('label', { text: '短休快捷' }),
        el(
          'div',
          { className: 'btn-row presets' },
          SHORT_PRESETS.map((m) =>
            el('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              text: `${m} 分`,
              onClick: () => setPreset('short', m),
            }),
          ),
        ),
      ]),
      el('div', { className: 'form-row' }, [
        el('label', { text: '长休快捷' }),
        el(
          'div',
          { className: 'btn-row presets' },
          LONG_PRESETS.map((m) =>
            el('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              text: `${m} 分`,
              onClick: () => setPreset('long', m),
            }),
          ),
        ),
      ]),
      durationHint,
      el('div', { className: 'form-row' }, [
        el('label', { text: '关联今日任务' }),
        taskSelect,
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

  // 回车保存默认 / 应用本轮
  for (const input of [focusIn, shortIn, longIn, everyIn]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySavedDurations({ toastOk: true });
      }
    });
  }
  customRoundIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCustomRound();
    }
  });

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
          el('p', { text: '可自定义专注/休息时长；结束时桌面通知（需授权）。' }),
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
        (s) => s.date === todayStr() && s.type === 'focus',
      ).length;
      hint.textContent = `今日记录 ${todayFocus} 个 · 本轮周期计数 ${st.focusCount}`;
    }

    // 不在 running 时每 tick 改 input，避免打字被冲掉；仅在未运行且 total 变化时同步
    if (!st.running && document.activeElement !== customRoundIn) {
      const mins = Math.max(1, Math.round(st.totalMs / 60000));
      if (customRoundIn.value !== String(mins)) customRoundIn.value = String(mins);
    }
    durationHint.textContent = st.running
      ? '计时进行中：改默认时长会在本轮结束后生效；改本轮请先暂停。'
      : '可改默认时长，或只改「本轮分钟」后点应用。';
  });

  syncDurationInputs();
  root._cleanup = () => unsub();
}

function minInput(value, min = 1, max = 180) {
  return el('input', {
    type: 'number',
    min: String(min),
    max: String(max),
    step: '1',
    value: String(value),
    className: 'duration-input',
  });
}

function clamp(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
