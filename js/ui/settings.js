import { el, toast, fieldRow, confirmModal } from './components.js';
import {
  getData,
  getMeta,
  updateSettings,
  exportJson,
  importJson,
  clearAllLocalData,
} from '../store.js';
import * as gist from '../gist.js';
import * as pomodoro from '../pomodoro.js';
import { applyTheme, applyAppearance } from '../theme.js';
import { bandOptions } from '../ielts.js';

/**
 * @param {HTMLElement} root
 * @param {{ refresh: () => void }} ctx
 */
export function renderSettings(root, ctx) {
  const data = getData();
  const meta = getMeta();
  const p = data.settings.pomodoro;

  const focusIn = numInput(p.focus);
  const shortIn = numInput(p.shortBreak);
  const longIn = numInput(p.longBreak);
  const everyIn = numInput(p.longEvery);

  const soundIn = el('input', {
    type: 'checkbox',
    checked: data.settings.sound !== false,
  });

  const autoStartIn = el('input', {
    type: 'checkbox',
    checked: Boolean(data.settings.autoStartNext),
  });

  const goals = data.settings.dailyGoals || { focusMinutes: 120, focusCount: 4 };
  const goalMinIn = numInput(goals.focusMinutes || 120);
  const goalCountIn = numInput(goals.focusCount || 4);

  const reviewCfg = data.settings.review || {};
  const modeSel = el('select', {}, [
    el('option', { value: 'recognition', text: '看词回忆（自评）' }),
    el('option', { value: 'choice', text: '选择题（四选一）' }),
    el('option', { value: 'spelling', text: '拼写自测' }),
  ]);
  modeSel.value = ['choice', 'spelling'].includes(reviewCfg.wordMode) ? reviewCfg.wordMode : 'recognition';
  const dailyNewIn = el('input', { type: 'number', min: '0', max: '200', value: String(reviewCfg.dailyNew != null ? reviewCfg.dailyNew : 10) });
  const pronounceIn = el('input', { type: 'checkbox', checked: reviewCfg.autoPronounce !== false });
  const accentSel = el('select', {}, [
    el('option', { value: 'en-GB', text: '英音' }),
    el('option', { value: 'en-US', text: '美音' }),
  ]);
  accentSel.value = reviewCfg.accent === 'en-US' ? 'en-US' : 'en-GB';

  const ieltsGoals = data.settings.ieltsGoals || {};
  const goalListening = bandSelect(ieltsGoals.listening);
  const goalReading = bandSelect(ieltsGoals.reading);
  const goalOverall = bandSelect(ieltsGoals.overall);
  const examDateIn = el('input', { type: 'date', value: ieltsGoals.examDate || '' });

  const themeSelect = el('select', {}, [
    el('option', { value: 'system', text: '跟随系统' }),
    el('option', { value: 'light', text: '浅色' }),
    el('option', { value: 'dark', text: '深色' }),
  ]);
  themeSelect.value = data.settings.theme || 'system';

  const fontScaleSelect = el('select', {}, [
    el('option', { value: 'small', text: '小' }),
    el('option', { value: 'normal', text: '标准' }),
    el('option', { value: 'large', text: '大' }),
  ]);
  fontScaleSelect.value = data.settings.fontScale || 'normal';

  const densitySelect = el('select', {}, [
    el('option', { value: 'compact', text: '紧凑' }),
    el('option', { value: 'normal', text: '标准' }),
    el('option', { value: 'roomy', text: '宽松' }),
  ]);
  densitySelect.value = data.settings.density || 'normal';

  const accentSelect = el('select', {}, [
    el('option', { value: 'teal', text: '青绿' }),
    el('option', { value: 'blue', text: '蓝' }),
    el('option', { value: 'violet', text: '紫' }),
    el('option', { value: 'rose', text: '玫红' }),
    el('option', { value: 'amber', text: '琥珀' }),
    el('option', { value: 'green', text: '绿' }),
  ]);
  accentSelect.value = data.settings.accent || 'teal';

  const tokenIn = el('input', {
    type: 'password',
    value: meta.token || '',
    placeholder: 'ghp_… 仅需 gist 权限',
    autocomplete: 'off',
  });
  const gistIdIn = el('input', {
    type: 'text',
    value: meta.gistId || '',
    placeholder: '可留空，连接时自动创建/查找',
    autocomplete: 'off',
  });

  const syncInfo = el('p', {
    className: 'help',
    text: syncText(gist.getSyncState()),
  });

  const unsubSync = gist.subscribeSync((s) => {
    syncInfo.textContent = syncText(s);
  });
  root._cleanup = () => unsubSync();

  root.append(
    el('div', { className: 'view' }, [
      el('div', { className: 'view-header' }, [
        el('div', {}, [
          el('h2', { text: '设置' }),
          el('p', { text: '番茄参数、主题与 Gist 云同步。' }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '番茄钟' }),
        el('div', { className: 'form-row inline' }, [
          fieldRow('专注（分钟）', focusIn),
          fieldRow('短休（分钟）', shortIn),
          fieldRow('长休（分钟）', longIn),
          fieldRow('每 N 个专注后长休', everyIn),
        ]),
        el('div', { className: 'checkbox-row' }, [
          soundIn,
          el('label', { text: '结束时播放提示音' }),
        ]),
        el('div', { className: 'checkbox-row' }, [
          autoStartIn,
          el('label', { text: '结束后自动开始下一阶段' }),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '保存番茄设置',
            onClick: () => {
              updateSettings({
                pomodoro: {
                  focus: clampInt(focusIn.value, 1, 180, 25),
                  shortBreak: clampInt(shortIn.value, 1, 60, 5),
                  longBreak: clampInt(longIn.value, 1, 60, 15),
                  longEvery: clampInt(everyIn.value, 1, 12, 4),
                },
                sound: soundIn.checked,
                autoStartNext: autoStartIn.checked,
              });
              pomodoro.reloadDurationsIfIdle();
              toast('番茄设置已保存', 'success');
            },
          }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '每日目标' }),
        el('p', { className: 'help', text: '显示在「今日」看板的进度条上。' }),
        el('div', { className: 'form-row inline' }, [
          fieldRow('每日专注分钟', goalMinIn),
          fieldRow('每日番茄个数', goalCountIn),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '保存目标',
            onClick: () => {
              updateSettings({
                dailyGoals: {
                  focusMinutes: clampInt(goalMinIn.value, 15, 600, 120),
                  focusCount: clampInt(goalCountIn.value, 1, 20, 4),
                },
              });
              toast('每日目标已保存', 'success');
            },
          }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '主题与外观' }),
        fieldRow('主题', themeSelect),
        el('div', { className: 'form-row inline' }, [
          fieldRow('字号', fontScaleSelect),
          fieldRow('密度', densitySelect),
          fieldRow('强调色', accentSelect),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '保存',
            onClick: () => {
              updateSettings({
                theme: themeSelect.value,
                fontScale: fontScaleSelect.value,
                density: densitySelect.value,
                accent: accentSelect.value,
              });
              applyTheme(themeSelect.value);
              applyAppearance({
                fontScale: fontScaleSelect.value,
                density: densitySelect.value,
                accent: accentSelect.value,
              });
              toast('已保存', 'success');
            },
          }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '雅思目标分' }),
        el('p', {
          className: 'help',
          text: '在「雅思 → 学习分析」中用来对照当周各 Part 的正确率是否达标。',
        }),
        el('div', { className: 'form-row inline' }, [
          fieldRow('听力目标分', goalListening),
          fieldRow('阅读目标分', goalReading),
          fieldRow('总分目标', goalOverall),
          fieldRow('考试日期', examDateIn),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '保存目标分',
            onClick: () => {
              updateSettings({
                ieltsGoals: {
                  listening: goalListening.value === '' ? null : Number(goalListening.value),
                  reading: goalReading.value === '' ? null : Number(goalReading.value),
                  overall: goalOverall.value === '' ? null : Number(goalOverall.value),
                  examDate: examDateIn.value === '' ? null : examDateIn.value,
                },
              });
              toast('雅思目标分已保存', 'success');
            },
          }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '词汇复习' }),
        el('p', {
          className: 'help',
          text: '新词先出学习卡再测试；选择题优先用同章节词做干扰项。每日新词 0 表示暂停学新词。',
        }),
        el('div', { className: 'form-row inline' }, [
          fieldRow('复习模式', modeSel),
          fieldRow('每日新词', dailyNewIn),
          fieldRow('朗读口音', accentSel),
        ]),
        el('div', { className: 'checkbox-row' }, [
          pronounceIn,
          el('label', { text: '展示单词时自动朗读' }),
        ]),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '保存复习设置',
            onClick: () => {
              const dailyNew = clampInt(dailyNewIn.value, 0, 200, 10);
              dailyNewIn.value = String(dailyNew);
              updateSettings({
                review: {
                  wordMode: ['recognition', 'choice', 'spelling'].includes(modeSel.value)
                    ? modeSel.value
                    : 'recognition',
                  dailyNew,
                  autoPronounce: pronounceIn.checked,
                  accent: accentSel.value === 'en-US' ? 'en-US' : 'en-GB',
                },
              });
              toast('词汇复习设置已保存', 'success');
            },
          }),
        ]),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: 'GitHub Gist 同步' }),
        el('div', { className: 'callout' }, [
          document.createTextNode('在 GitHub 创建 Classic PAT，勾选 '),
          el('span', { className: 'kbd', text: 'gist' }),
          document.createTextNode(' 权限即可。Token 只保存在本机浏览器，不会上传到仓库。'),
          el('br'),
          el('a', {
            href: 'https://github.com/settings/tokens/new?scopes=gist&description=study-tracker',
            target: '_blank',
            rel: 'noopener',
            text: '打开创建 Token 页面',
          }),
        ]),
        fieldRow('Personal Access Token', tokenIn),
        fieldRow('Gist ID（可选）', gistIdIn),
        syncInfo,
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: '连接 / 创建 Gist',
            onClick: async () => {
              try {
                const r = await gist.connect({
                  token: tokenIn.value.trim(),
                  gistId: gistIdIn.value.trim(),
                });
                gistIdIn.value = r.gistId;
                toast('Gist 已连接', 'success');
                ctx.refresh();
              } catch (e) {
                toast(e.message || '连接失败', 'error');
              }
            },
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '立即同步',
            onClick: async () => {
              try {
                await gist.push({ immediate: true });
                toast('已推送', 'success');
              } catch (e) {
                toast(e.message || '同步失败', 'error');
              }
            },
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '强制拉取',
            onClick: async () => {
              const ok = await confirmModal({
                title: '强制拉取',
                message: '将用云端数据覆盖本地，确定？',
                confirmText: '覆盖',
                danger: true,
              });
              if (!ok) return;
              try {
                await gist.pull({ force: true });
                toast('已从云端覆盖本地', 'success');
                ctx.refresh();
              } catch (e) {
                toast(e.message || '拉取失败', 'error');
              }
            },
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-danger',
            text: '断开',
            onClick: () => {
              gist.disconnect();
              tokenIn.value = '';
              gistIdIn.value = '';
              toast('已断开（本地数据仍保留）', 'info');
            },
          }),
        ]),
        el('p', {
          className: 'help',
          text: '建议以一台设备为主编辑，避免多端同时狂改导致后写覆盖。',
        }),
      ]),

      el('section', { className: 'card form-grid' }, [
        el('h3', { text: '备份' }),
        el('div', { className: 'btn-row' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-ghost',
            text: '导出 JSON',
            onClick: () => {
              const blob = new Blob([exportJson()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `study-tracker-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast('已导出', 'success');
            },
          }),
          el('label', { className: 'btn btn-ghost', style: { cursor: 'pointer' } }, [
            document.createTextNode('导入 JSON'),
            el('input', {
              type: 'file',
              accept: 'application/json,.json',
              style: { display: 'none' },
              onChange: async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  importJson(text);
                  pomodoro.setTaskId(null);
                  pomodoro.reloadDurationsIfIdle();
                  toast('导入成功', 'success');
                  ctx.refresh();
                } catch (err) {
                  toast(err.message || '导入失败', 'error');
                }
                e.target.value = '';
              },
            }),
          ]),
          el('button', {
            type: 'button',
            className: 'btn btn-danger',
            text: '清空本地数据',
            onClick: async () => {
              const ok = await confirmModal({
                title: '清空本地数据',
                message: '确定清空本机全部学习数据？此操作不可撤销（Gist 云端不受影响）。',
                confirmText: '清空',
                danger: true,
              });
              if (!ok) return;
              clearAllLocalData();
              pomodoro.clearState();
              toast('本地数据已清空', 'info');
              ctx.refresh();
            },
          }),
        ]),
      ]),

    ]),
  );
}

function numInput(value) {
  return el('input', { type: 'number', min: '1', value: String(value) });
}

function bandSelect(value) {
  const sel = el('select', {}, [
    el('option', { value: '', text: '未设置' }),
    ...bandOptions().map((b) => el('option', { value: b, text: b })),
  ]);
  sel.value = value != null ? Number(value).toFixed(1) : '';
  return sel;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function syncText(s) {
  const last = s.lastSync ? ` · 上次 ${new Date(s.lastSync).toLocaleString()}` : '';
  return `状态：${s.message}${last}`;
}
