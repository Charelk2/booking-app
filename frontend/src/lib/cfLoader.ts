import { normalizeToCloudflareIfPossible, isCloudflareImagesUrl } from './cfImage';

export const isCfLoaderEnabled = String(process.env.NEXT_PUBLIC_CF_IMAGE_LOADER || '') === '1';

// Next/Image loader for Cloudflare Images (optional toggle)
// Note: This is a minimal placeholder. When you adopt Cloudflare Images fully,
// you can switch to named/flexible variants as desired.
export function cfLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  // Try to normalize to Cloudflare Images URL or ID
  const cf = normalizeToCloudflareIfPossible(src) || src;
  if (!isCloudflareImagesUrl(cf)) return cf;
  try {
    const u = new URL(cf);
    // Append width/quality hints for CF delivery; adjust to your variant policy later
    const q = u.searchParams;
    q.set('width', String(width));
    if (quality) q.set('quality', String(quality));
    u.search = q.toString();
    return u.toString();
  } catch {
    return cf;
  }
}

