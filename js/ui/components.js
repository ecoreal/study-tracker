/**
 * Shared UI helpers.
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'value') {
      node[k] = v;
    } else if (v === false || v == null) {
      /* skip */
    } else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const TOAST_ICONS = {
  info: 'ℹ️',
  success: '✅',
  error: '❌',
  warn: '⚠️',
};

const MAX_TOASTS = 3;
let controlId = 0;
let dialogId = 0;

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  // limit visible toasts
  while (root.children.length >= MAX_TOASTS) {
    const first = root.firstElementChild;
    first.classList.add('out');
    setTimeout(() => first.remove(), 200);
  }
  const icon = TOAST_ICONS[type] || '';
  const t = el('div', { className: `toast ${type}` }, [
    icon ? el('span', { className: 'toast-icon', text: icon }) : null,
    el('span', { className: 'toast-text', text: message }),
    el('button', {
      type: 'button',
      className: 'toast-close',
      'aria-label': '关闭',
      text: '×',
      onClick: (e) => {
        e.stopPropagation();
        t.classList.add('out');
        setTimeout(() => t.remove(), 200);
      },
    }),
  ]);
  root.append(t);
  // trigger reflow then add 'in' for animation
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    t.classList.add('out');
    setTimeout(() => {
      if (t.parentNode) t.remove();
    }, 200);
  }, 3200);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Modal dialog — 支持拖拽、尺寸档位、位置记忆。
 * @param {{
 *   title: string,
 *   body: HTMLElement|HTMLElement[],
 *   confirmText?: string,
 *   cancelText?: string,
 *   danger?: boolean,
 *   size?: 'sm'|'md'|'lg'|'xl',   // 默认 md(440px)；lg=640px；xl=860px
 *   draggable?: boolean,          // 默认 true
 *   rememberPos?: boolean,        // 默认 true，记住拖动位置
 *   confirmOnEnter?: boolean,
 * }} opts
 * @returns {Promise<boolean>} true if confirmed
 */
export function modal(opts = {}) {
  return new Promise((resolve) => {
    const size = opts.size || 'md';
    const draggable = opts.draggable !== false;
    const rememberPos = opts.rememberPos !== false;
    const posKey = `modal-pos:${opts.title || 'default'}`;
    const savedPos = rememberPos ? (() => { try { return JSON.parse(localStorage.getItem(posKey) || 'null'); } catch { return null; } })() : null;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const titleId = `dialog-title-${++dialogId}`;
    let closed = false;

    const backdrop = el('div', { className: 'modal-backdrop' });
    const panel = el('div', {
      className: `modal-panel modal-${size}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    }, [
      el('div', { className: 'modal-header', dataset: { drag: 'handle' } }, [
        el('h3', { id: titleId, text: opts.title || '提示' }),
        el('div', { className: 'modal-header-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-ghost btn-icon btn-sm modal-close',
            'aria-label': '关闭',
            text: '×',
            onClick: () => close(false),
          }),
        ]),
      ]),
      el('div', { className: 'modal-body' }, [].concat(opts.body || [])),
      el('div', { className: 'modal-footer btn-row' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          text: opts.cancelText || '取消',
          onClick: () => close(false),
        }),
        el('button', {
          type: 'button',
          className: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
          text: opts.confirmText || '确定',
          onClick: () => close(true),
        }),
      ]),
    ]);
    backdrop.append(panel);
    document.body.append(backdrop);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => backdrop.classList.add('show'));

    // ——— 拖拽（仅桌面端，触屏设备跳过） ———
    // 桌面端（宽视口）启用拖拽；移动端保持底部弹层
    if (draggable && window.innerWidth >= 768) {
      let drag = null;
      const header = panel.querySelector('[data-drag="handle"]');
      header.style.cursor = 'grab';
      header.title = '按住拖动窗口';
      header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
        header.setPointerCapture(e.pointerId);
        header.style.cursor = 'grabbing';
        panel.classList.add('modal-dragging');
        e.preventDefault();
      });
      header.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = panel.offsetWidth;
        const ph = panel.offsetHeight;
        const x = Math.min(Math.max(0, e.clientX - drag.dx), vw - pw);
        const y = Math.min(Math.max(0, e.clientY - drag.dy), vh - ph * 0.3);
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.margin = '0';
      });
      const endDrag = (e) => {
        if (!drag) return;
        drag = null;
        header.style.cursor = 'grab';
        panel.classList.remove('modal-dragging');
        if (rememberPos) {
          try {
            localStorage.setItem(posKey, JSON.stringify({ left: panel.style.left, top: panel.style.top }));
          } catch { /* ignore */ }
        }
      };
      header.addEventListener('pointerup', endDrag);
      header.addEventListener('pointercancel', endDrag);
    }

    // 恢复保存的位置
    if (window.innerWidth >= 768 && savedPos && savedPos.left && savedPos.top) {
      panel.style.left = savedPos.left;
      panel.style.top = savedPos.top;
      panel.style.margin = '0';
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
      if (e.key === 'Enter' && opts.confirmOnEnter && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        close(true);
      }
      if (e.key === 'Tab') {
        const focusable = [...panel.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )].filter((node) => node.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    function close(ok) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      document.body.classList.remove('modal-open');
      setTimeout(() => {
        backdrop.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
      }, 150);
      resolve(ok);
    }

    const focusable = panel.querySelector('input, textarea, select, button:not(.modal-close)');
    if (focusable) setTimeout(() => focusable.focus(), 50);
  });
}

/** @returns {Promise<string|null>} */
export async function promptModal({ title, label, value = '', placeholder = '', multiline = false }) {
  const input = multiline
    ? el('textarea', { value, placeholder, rows: '4' })
    : el('input', { type: 'text', value, placeholder, autocomplete: 'off' });
  // set value via property after create for textarea
  input.value = value;
  const body = el('div', { className: 'form-grid' }, [
    label ? fieldRow(label, input) : input,
  ]);
  const ok = await modal({ title, body, confirmText: '保存', confirmOnEnter: !multiline });
  if (!ok) return null;
  return input.value;
}

/** Shorthand for a confirm dialog with just a message. */
export function confirmModal({ title = '确认', message, confirmText = '确定', danger = false } = {}) {
  return modal({
    title,
    body: el('p', { text: message }),
    confirmText,
    danger,
  });
}

/** Standard form-row: label + control. */
export function fieldRow(label, control) {
  if (!control.id) control.id = `field-${++controlId}`;
  return el('div', { className: 'form-row' }, [
    el('label', { for: control.id, text: label }),
    control,
  ]);
}

export function progressBar(ratio, { label = '', className = '' } = {}) {
  const pct = Math.max(0, Math.min(1, ratio || 0));
  return el('div', { className: `progress-wrap ${className}`.trim() }, [
    label
      ? el('div', { className: 'progress-meta' }, [
          el('span', { text: label }),
          el('span', { text: `${Math.round(pct * 100)}%` }),
        ])
      : null,
    el('div', { className: 'progress-track' }, [
      el('div', {
        className: `progress-fill${pct >= 1 ? ' done' : ''}`,
        style: { width: `${pct * 100}%` },
      }),
    ]),
  ]);
}
