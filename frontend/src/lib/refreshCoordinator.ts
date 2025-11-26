import { API_ORIGIN } from '@/lib/api';

export interface RefreshResult {
  ok: boolean;
  status?: number;
  detail?: string;
  hard?: boolean;
}

class RefreshError extends Error {
  status?: number;
  detail?: string;
  hard?: boolean;

  constructor(result: RefreshResult) {
    super('refresh failed');
    this.name = 'RefreshError';
    this.status = result.status;
    this.detail = result.detail;
    this.hard = result.hard;
  }
}

let inflight = false;
let waiters: Array<(result: RefreshResult) => void> = [];
let bc: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    bc = new BroadcastChannel('auth-refresh');
  }
} catch {}

const LOCK_KEY = 'auth.refresh.lock';
const LOCK_TTL_MS = 5000;

function now() { return Date.now(); }

function acquireLock(): boolean {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const ts = raw ? parseInt(raw, 10) : 0;
    if (ts && now() - ts < LOCK_TTL_MS) return false;
    localStorage.setItem(LOCK_KEY, String(now()));
    return true;
  } catch {
    // If localStorage blocked, just act as leader in this tab
    return true;
  }
}

function releaseLock(): void {
  try { localStorage.removeItem(LOCK_KEY); } catch {}
}

function normalizeResult(input: unknown): RefreshResult {
  if (input && typeof input === 'object' && 'ok' in (input as any)) {
    const r = input as any;
    return {
      ok: Boolean(r.ok),
      status: typeof r.status === 'number' ? r.status : undefined,
      detail: typeof r.detail === 'string' ? r.detail : undefined,
      hard: r.hard === true,
    };
  }
  if (typeof input === 'boolean') {
    return { ok: input };
  }
  return { ok: false };
}

function notifyAll(result: RefreshResult) {
  try { bc?.postMessage({ type: 'done', result }); } catch {}
  const cbs = waiters.splice(0, waiters.length);
  cbs.forEach((cb) => {
    try { cb(result); } catch {}
  });
}

function onMessage(ev: MessageEvent) {
  try {
    const data = ev.data || {};
    if (!data || typeof data !== 'object') return;
    if (data.type === 'done') {
      const payload = 'result' in data ? (data as any).result : (data as any).ok;
      notifyAll(normalizeResult(payload));
    }
  } catch {}
}

if (bc) bc.onmessage = onMessage;

function classifyResult(result: RefreshResult): RefreshResult {
  if (!result.status) return result;
  if (result.status === 401) {
    const detail = (result.detail || '').toLowerCase();
    if (
      detail.includes('session expired') ||
      detail.includes('missing refresh token') ||
      detail.includes('invalid or expired token')
    ) {
      return { ...result, hard: true };
    }
  }
  return result;
}

async function leaderRefresh(): Promise<RefreshResult> {
  const attempt = async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${API_ORIGIN}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return { ok: true, status: res.status };
      }
      const status = res.status;
      let detail: string | undefined;
      try {
        const text = await res.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
              const d = (parsed as any).detail;
              detail = typeof d === 'string' ? d : String(d);
            } else {
              detail = typeof parsed === 'string' ? parsed : text;
            }
          } catch {
            detail = text;
          }
        }
      } catch {}
      return classifyResult({ ok: false, status, detail });
    } catch {
      return { ok: false };
    }
  };

  let result = await attempt();
  if (result.ok) return result;
  const j1 = 100 + Math.floor(Math.random() * 200);
  await new Promise((r) => setTimeout(r, j1));
  result = await attempt();
  if (result.ok) return result;
  const j2 = 150 + Math.floor(Math.random() * 250);
  await new Promise((r) => setTimeout(r, j2));
  result = await attempt();
  return result;
}

export async function ensureFreshAccess(): Promise<void> {
  if (inflight) {
    return new Promise<void>((resolve, reject) => {
      waiters.push((res) => (res.ok ? resolve() : reject(new RefreshError(res))));
    });
  }
  inflight = true;

  let result: RefreshResult = { ok: false };
  const leader = acquireLock();
  if (!leader) {
    try {
      const outcome = await new Promise<RefreshResult>((resolve) => {
        const to = setTimeout(() => resolve({ ok: false }), LOCK_TTL_MS + 1000);
        waiters.push((res) => { clearTimeout(to); resolve(res); });
      });
      result = outcome;
    } catch {
      result = { ok: false };
    }
  } else {
    result = await leaderRefresh();
    try { bc?.postMessage({ type: 'done', result }); } catch {}
    releaseLock();
  }

  notifyAll(result);
  inflight = false;
  if (!result.ok) throw new RefreshError(result);
}
