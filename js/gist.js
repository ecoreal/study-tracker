/**
 * GitHub Gist sync for study-data.json
 * PAT is stored only in localStorage (via store meta).
 */

import { getData, getMeta, setMeta, mergeRemote, replaceData } from './store.js';

const GIST_FILENAME = 'study-data.json';
const GIST_DESC = 'study-tracker-data';

/** @type {{ status: string, message: string, lastSync: string|null }} */
let syncState = {
  status: 'idle', // idle | busy | ok | warn | err
  message: '未连接',
  lastSync: null,
};

/** @type {Set<(s: typeof syncState) => void>} */
const listeners = new Set();
let debounceTimer = null;
const DEBOUNCE_MS = 1500;

export function getSyncState() {
  return { ...syncState };
}

export function subscribeSync(fn) {
  listeners.add(fn);
  fn(getSyncState());
  return () => listeners.delete(fn);
}

function setState(patch) {
  syncState = { ...syncState, ...patch };
  for (const fn of listeners) fn(getSyncState());
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.message || detail;
    } catch { /* ignore */ }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function isConfigured() {
  const m = getMeta();
  return Boolean(m.token && m.gistId);
}

export async function connect({ token, gistId } = {}) {
  const t = (token || getMeta().token || '').trim();
  if (!t) throw new Error('请先填写 GitHub PAT（gist 权限）');

  setState({ status: 'busy', message: '连接中…' });
  try {
    // Validate token
    await api('/user', { token: t });

    let id = (gistId || getMeta().gistId || '').trim();
    if (!id) {
      // Try find existing by description
      const gists = await api('/gists?per_page=100', { token: t });
      const found = (gists || []).find(
        (g) => g.description === GIST_DESC && g.files && g.files[GIST_FILENAME],
      );
      if (found) {
        id = found.id;
      } else {
        const created = await api('/gists', {
          method: 'POST',
          token: t,
          body: {
            description: GIST_DESC,
            public: false,
            files: {
              [GIST_FILENAME]: {
                content: JSON.stringify(getData(), null, 2),
              },
            },
          },
        });
        id = created.id;
      }
    }

    setMeta({ token: t, gistId: id });
    await pull({ force: false });
    setState({
      status: 'ok',
      message: '已连接',
      lastSync: new Date().toISOString(),
    });
    return { gistId: id };
  } catch (e) {
    setState({ status: 'err', message: e.message || '连接失败' });
    throw e;
  }
}

export function disconnect() {
  setMeta({ token: '', gistId: '' });
  setState({ status: 'idle', message: '未连接', lastSync: null });
}

export async function pull({ force = false } = {}) {
  const { token, gistId } = getMeta();
  if (!token || !gistId) {
    setState({ status: 'idle', message: '未连接' });
    return { applied: false };
  }
  setState({ status: 'busy', message: '拉取中…' });
  try {
    const gist = await api(`/gists/${gistId}`, { token });
    const file = gist.files?.[GIST_FILENAME];
    if (!file) throw new Error(`Gist 中找不到 ${GIST_FILENAME}`);
    let content = file.content;
    if (file.truncated && !content) {
      const res = await fetch(file.raw_url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
      });
      if (!res.ok) throw new Error('无法读取 Gist 内容');
      content = await res.text();
    }
    const remote = JSON.parse(content);
    let result;
    if (force) {
      replaceData(remote, { emitSync: false });
      result = { applied: true, reason: 'force' };
    } else {
      result = mergeRemote(remote);
    }
    setState({
      status: 'ok',
      message: result.applied ? '已从云端更新' : '本地已是最新',
      lastSync: new Date().toISOString(),
    });
    // If local is newer, push
    if (!result.applied && result.reason === 'local-newer-or-equal') {
      const localTs = Date.parse(getData().updatedAt || 0) || 0;
      const remoteTs = Date.parse(remote.updatedAt || 0) || 0;
      if (localTs > remoteTs) {
        await push({ immediate: true });
      }
    }
    return result;
  } catch (e) {
    setState({ status: 'err', message: e.message || '拉取失败' });
    throw e;
  }
}

export async function push({ immediate = false } = {}) {
  const { token, gistId } = getMeta();
  if (!token || !gistId) return;

  const doPush = async () => {
    setState({ status: 'busy', message: '同步中…' });
    try {
      await api(`/gists/${gistId}`, {
        method: 'PATCH',
        token,
        body: {
          files: {
            [GIST_FILENAME]: {
              content: JSON.stringify(getData(), null, 2),
            },
          },
        },
      });
      setState({
        status: 'ok',
        message: '已同步',
        lastSync: new Date().toISOString(),
      });
    } catch (e) {
      setState({ status: 'err', message: e.message || '同步失败' });
    }
  };

  if (immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await doPush();
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    doPush();
  }, DEBOUNCE_MS);
}

export function schedulePush() {
  if (!isConfigured()) return;
  push({ immediate: false });
}

export async function initSync() {
  const meta = getMeta();
  if (!meta.token || !meta.gistId) {
    setState({ status: 'idle', message: '未连接' });
    return;
  }
  setState({ status: 'warn', message: '已配置，同步中…' });
  try {
    await pull({ force: false });
  } catch {
    // state already set
  }
}
