/**
 * Theme & appearance: system | light | dark + font size + density + accent color
 */

export function applyTheme(theme) {
  const root = document.documentElement;
  let resolved = theme;
  if (!theme || theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolved = dark ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', resolved);
}

export function toggleTheme(current) {
  // cycle light <-> dark (explicit), ignore system for toggle button
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? 'light' : 'dark';
}

export function watchSystemTheme(getTheme) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if ((getTheme() || 'system') === 'system') applyTheme('system');
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else mq.addListener(handler);
}

/**
 * 应用外观设置：字号缩放 / 密度 / 强调色。
 * @param {{ fontScale?: string, density?: string, accent?: string }} s
 */
export function applyAppearance(s = {}) {
  const root = document.documentElement;
  const font = s.fontScale || 'normal';
  const density = s.density || 'normal';
  const accent = s.accent || 'teal';
  root.setAttribute('data-font-scale', font);
  root.setAttribute('data-density', density);
  root.setAttribute('data-accent', accent);
}
