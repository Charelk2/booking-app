// frontend/src/lib/refreshCoordinator.ts
// Coordinates refresh across the whole app and all tabs. Ensures only one
// network call to /auth/refresh is made at a time. Others wait for the result.

type RefreshOutcome = 'ok' | 'err';
import { API_ORIGIN } from '@/lib/api';

let inflight = false;
let waiters: Array<(ok: boolean) => void> = [];
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

function notifyAll(ok: boolean) {
  try { bc?.postMessage({ type: 'done', ok }); } catch {}
  const cbs = waiters.splice(0, waiters.length);
  cbs.forEach((cb) => {
    try { cb(ok); } catch {}
  });
}

function onMessage(ev: MessageEvent) {
  try {
    const data = ev.data || {};
    if (!data || typeof data !== 'object') return;
    if (data.type === 'done') {
      notifyAll(!!data.ok);
    }
  } catch {}
}

if (bc) bc.onmessage = onMessage;

async function leaderRefresh(): Promise<boolean> {
  // Use fetch to avoid axios interceptors recursion.
  const attempt = async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    }
  };
  // First try
  let ok = await attempt();
  if (ok) return true;
  // Jittered short backoff (100–300ms)
  const j1 = 100 + Math.floor(Math.random() * 200);
  await new Promise((r) => setTimeout(r, j1));
  ok = await attempt();
  if (ok) return true;
  // Optional second retry under 1s total
  const j2 = 150 + Math.floor(Math.random() * 250);
  await new Promise((r) => setTimeout(r, j2));
  return attempt();
}

export async function ensureFreshAccess(): Promise<void> {
  if (inflight) {
    return new Promise<void>((resolve, reject) => {
      waiters.push((ok) => (ok ? resolve() : reject(new Error('refresh failed'))));
    });
  }
  inflight = true;

  let ok = false;
  const leader = acquireLock();
  if (!leader) {
    // Follower: wait for leader to finish, with a timeout guard
    try {
      const outcome = await new Promise<boolean>((resolve) => {
        const to = setTimeout(() => resolve(false), LOCK_TTL_MS + 1000);
        waiters.push((resOk) => { clearTimeout(to); resolve(resOk); });
      });
      ok = outcome;
    } catch {
      ok = false;
    }
  } else {
    // Leader: perform refresh and broadcast outcome
    ok = await leaderRefresh();
    try { bc?.postMessage({ type: 'done', ok }); } catch {}
    releaseLock();
  }

  notifyAll(ok);
  inflight = false;
  if (!ok) throw new Error('refresh failed');
}
