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

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = el('div', { className: `toast ${type}`, text: message });
  root.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 200);
  }, 2800);
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
 * Simple modal dialog.
 * @param {{ title: string, body: HTMLElement|HTMLElement[], confirmText?: string, cancelText?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>} true if confirmed
 */
export function modal(opts) {
  return new Promise((resolve) => {
    const backdrop = el('div', { className: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const panel = el('div', { className: 'modal-panel' }, [
      el('div', { className: 'modal-header' }, [
        el('h3', { text: opts.title || '提示' }),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost btn-icon btn-sm',
          'aria-label': '关闭',
          text: '×',
          onClick: () => close(false),
        }),
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
    requestAnimationFrame(() => backdrop.classList.add('show'));

    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        close(true);
      }
    }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    function close(ok) {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 150);
      resolve(ok);
    }

    // focus first input
    const focusable = panel.querySelector('input, textarea, select, button');
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
    label ? el('label', { text: label }) : null,
    input,
  ]);
  const ok = await modal({ title, body, confirmText: '保存' });
  if (!ok) return null;
  return input.value;
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
