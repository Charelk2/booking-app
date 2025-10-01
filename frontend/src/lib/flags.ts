// frontend/src/lib/flags.ts
// Centralized feature flags for Inbox/MessageThread. Safe, runtime‑tunable.

function readLocalStorageBool(key: string): boolean | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(key);
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
    if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
    return null;
  } catch {
    return null;
  }
}

function readEnvBool(name: string): boolean | null {
  try {
    // NEXT_PUBLIC_* are inlined at build time
    const raw = (process as any)?.env?.[name];
    if (raw == null) return null;
    const s = String(raw).trim();
    return s === '1' || s.toLowerCase() === 'true';
  } catch {
    return null;
  }
}

export function inboxRevampEnabled(): boolean {
  // Priority: localStorage override → env → default false
  const ls = readLocalStorageBool('inbox.revamp.enabled');
  if (ls !== null) return ls;
  const env = readEnvBool('NEXT_PUBLIC_INBOX_REVAMP');
  return env === true;
}

export function inboxVirtualizationEnabled(): boolean {
  // Priority: localStorage override → env var (legacy) → inherit from revamp → default false
  const ls = readLocalStorageBool('inbox.virtualization.enabled');
  if (ls !== null) return ls;
  // Backward‑compat with existing env flag
  const legacy = readEnvBool('NEXT_PUBLIC_VIRTUALIZE_CHAT');
  if (legacy !== null) return legacy;
  // If revamp master is on, default virtualization to ON (kill‑switchable via LS)
  return inboxRevampEnabled();
}

export function inboxTelemetryEnabled(): boolean {
  // Allow disabling RUM independently
  const ls = readLocalStorageBool('inbox.telemetry.enabled');
  if (ls !== null) return ls;
  return inboxRevampEnabled();
}

