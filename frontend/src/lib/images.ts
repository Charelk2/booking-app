// frontend/src/lib/images.ts
// Avoid importing the axios instance here to prevent circular imports during
// module evaluation in production bundles. Compute the API origin from env or
// window at runtime.

function apiBaseOrigin(): string {
  const env = process.env.NEXT_PUBLIC_API_URL || '';
  let base = env || '';
  try {
    if (!base && typeof window !== 'undefined') base = window.location.origin;
    const u = new URL(base);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '';
  }
}

const MOUNTS = ['profile_pics', 'cover_photos', 'portfolio_images', 'attachments', 'media'] as const;
const EXT_RE = /\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|#|$)/i;

// Note: we stopped falling back to a hardcoded origin to avoid mixed-origin
// surprises; when origin cannot be derived, return empty and let callers
// produce relative URLs.

function ensureStaticPath(pathname: string): string {
  // Normalize to /static/{mount}/rest for known mounts
  const strip = pathname.replace(/^\/+/, '');
  // Allow API-served image proxies to pass through untouched
  if (strip.startsWith('api/')) return `/${strip}`;
  const mStatic = strip.match(/^static\/(.+)$/i);
  if (mStatic) return `/static/${mStatic[1]}`;
  const mDirect = strip.match(/^(profile_pics|cover_photos|portfolio_images|attachments|media|avatars)\/(.+)$/i);
  if (mDirect) return `/static/${mDirect[1]}/${mDirect[2]}`;
  return pathname.startsWith('/static/') ? pathname : `/static/${strip}`;
}

// Preserve extension case; some files may be stored uppercase on disk.
function preserveExtension(pathname: string): string {
  return pathname;
}

export function toCanonicalImageUrl(input?: string | null): string | null {
  if (!input) return null;
  const v = String(input).trim();
  if (!v) return null;
  // Data/blob previews: return as-is
  if (/^(data:|blob:)/i.test(v)) return v;

  const origin = apiBaseOrigin();
  const r2Public = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  try {
    const u = new URL(v);
    // Same API host: allow API image proxy paths and normalize storage mounts
    const isApi = u.origin === origin || /(^|\.)booka\.co\.za$/i.test(u.hostname);
    if (isApi) {
      // If path begins with /api/, keep as-is so it hits the backend route
      if (u.pathname.startsWith('/api/')) {
        return `${u.pathname}${u.search}`;
      }
      // Special-case mounts under our first-party hosts: prefer direct R2 when configured
      if (/^\/avatars\//i.test(u.pathname) && r2Public) {
        return `${r2Public}${u.pathname}${u.search}`;
      }
      if (/^\/static\/avatars\//i.test(u.pathname) && r2Public) {
        return `${r2Public}${u.pathname.replace(/^\/static/, '')}${u.search}`;
      }
      if (/^\/(cover_photos|portfolio_images|media)\//i.test(u.pathname) && r2Public) {
        return `${r2Public}${u.pathname}${u.search}`;
      }
      if (/^\/static\/(cover_photos|portfolio_images|media)\//i.test(u.pathname) && r2Public) {
        return `${r2Public}${u.pathname.replace(/^\/static/, '')}${u.search}`;
      }
      const normalized = ensureStaticPath(u.pathname);
      const finalPath = preserveExtension(normalized);
      // Prefer same-origin relative path so Next.js image optimizer can fetch
      // via our rewrites (/static → backend). This avoids remote domain
      // misconfig and 404s from _next/image.
      return `${finalPath}${u.search}`;
    }
    // External absolute URL: if looks like an image, return as-is; else null
    if (EXT_RE.test(u.pathname)) return v;
    return null;
  } catch {
    // Relative path: allow /api/* passthrough, else coerce to /static
    const raw = v.startsWith('/') ? v : `/${v}`;
    // Prefer R2 public base for avatars keys
    if (/^\/avatars\//i.test(raw) && r2Public) {
      return `${r2Public}${raw}`;
    }
    if (/^\/static\/avatars\//i.test(raw) && r2Public) {
      return `${r2Public}${raw.replace(/^\/static/, '')}`;
    }
    if (/^\/(cover_photos|portfolio_images|media)\//i.test(raw) && r2Public) {
      return `${r2Public}${raw}`;
    }
    if (/^\/static\/(cover_photos|portfolio_images|media)\//i.test(raw) && r2Public) {
      return `${r2Public}${raw.replace(/^\/static/, '')}`;
    }
    if (/^\/api\//i.test(raw)) return raw;
    const normalized = ensureStaticPath(raw);
    const finalPath = preserveExtension(normalized);
    // Same-origin relative path; Next rewrites /static/* to the API
    return `${finalPath}`;
  }
}

export function isDataOrBlob(src: string | null | undefined): boolean {
  return !!src && /^(data:|blob:)/i.test(src);
}
