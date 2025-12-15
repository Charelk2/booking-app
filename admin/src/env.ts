const LOCAL_ADMIN_API_PORT = 8000;

export function inferAdminApiUrl(): string {
  const env = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  const host = window.location.hostname;
  if (host.endsWith('booka.co.za')) return 'https://api.booka.co.za/admin';
  // Production admin console is hosted on Fly; fall back to the public API origin when env is missing.
  if (host.endsWith('.fly.dev') && /(^|\.)booka-admin/i.test(host)) return 'https://api.booka.co.za/admin';
  return `${window.location.protocol}//${window.location.hostname}:${LOCAL_ADMIN_API_PORT}/admin`;
}

export function inferRootApiUrl(adminApiUrl: string = inferAdminApiUrl()): string {
  return adminApiUrl.replace(/\/?admin\/?$/, '');
}

export function inferPublicWebOrigin(): string {
  const env = (import.meta as any).env?.VITE_PUBLIC_WEB_ORIGIN as string | undefined;
  if (env) return env.replace(/\/$/, '');
  const { protocol, hostname } = window.location;
  if (/^admin\./i.test(hostname)) return `${protocol}//${hostname.replace(/^admin\./i, '')}`;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:3000`;
  return `${protocol}//${hostname}`;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem('booka_admin_token');
  } catch {
    return null;
  }
}

export function resolveStaticUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  try {
    const origin = new URL(inferAdminApiUrl()).origin;
    const path = url.startsWith('/static/') ? url : `/static/${url.replace(/^\/+/, '')}`;
    return `${origin}${path}`;
  } catch {
    return url;
  }
}
