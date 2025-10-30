// Ephemeral in-memory stubs for instant UX on realtime events.
// Not persisted to sessionStorage/IDB to avoid ghosts on reload.

type Stub = any;

const STUBS = new Map<number, Stub[]>();

export function addEphemeralStub(threadId: number, stub: Stub) {
  if (!Number.isFinite(threadId) || threadId <= 0) return;
  const list = STUBS.get(threadId) || [];
  // keep last 10 stubs max
  const next = [...list, stub].slice(-10);
  STUBS.set(threadId, next);
  try { window.dispatchEvent(new CustomEvent('ephemeral:stubs', { detail: { threadId } })); } catch {}
}

export function getEphemeralStubs(threadId: number): Stub[] {
  return STUBS.get(Number(threadId)) || [];
}

export function clearEphemeralStubs(threadId: number) {
  STUBS.delete(Number(threadId));
  try { window.dispatchEvent(new CustomEvent('ephemeral:stubs', { detail: { threadId } })); } catch {}
}

