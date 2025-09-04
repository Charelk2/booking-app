// frontend/src/lib/images.ts
import api from '@/lib/api';

const MOUNTS = ['profile_pics', 'cover_photos', 'portfolio_images', 'attachments', 'media'] as const;
const EXT_RE = /\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|#|$)/i;

function apiBaseOrigin(): string {
  // Derive origin from NEXT_PUBLIC_API_URL or axios baseURL
  const env = process.env.NEXT_PUBLIC_API_URL || '';
  const base = env || api.defaults.baseURL || '';
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return 'https://api.booka.co.za';
  }
}

function ensureStaticPath(pathname: string): string {
  // Normalize to /static/{mount}/rest for known mounts
  const strip = pathname.replace(/^\/+/, '');
  const mStatic = strip.match(/^static\/(.+)$/i);
  if (mStatic) return `/static/${mStatic[1]}`;
  const mDirect = strip.match(/^(profile_pics|cover_photos|portfolio_images|attachments|media)\/(.+)$/i);
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

  try {
    const u = new URL(v);
    // Same API host: normalize to /static path
    const isApi = u.origin === origin || /(^|\.)booka\.co\.za$/i.test(u.hostname);
    if (isApi) {
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
    // Relative path: coerce to /static and absolute origin
    const normalized = ensureStaticPath(v.startsWith('/') ? v : `/${v}`);
    const finalPath = preserveExtension(normalized);
    // Same-origin relative path; Next rewrites /static/* to the API
    return `${finalPath}`;
  }
}

export function isDataOrBlob(src: string | null | undefined): boolean {
  return !!src && /^(data:|blob:)/i.test(src);
}
