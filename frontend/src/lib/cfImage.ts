/**
 * Cloudflare Images helpers
 *
 * Supports constructing delivery URLs for the Cloudflare Images product.
 * - If given a full Cloudflare Images URL, returns it as-is or swaps the variant
 * - If given an image ID, builds a URL using NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH
 * - Defaults to the `public` variant unless NEXT_PUBLIC_CF_IMAGES_VARIANT is set
 */

const CF_HOST = 'imagedelivery.net';

export const isCloudflareImagesUrl = (src: string): boolean => {
  try {
    const u = new URL(src);
    return u.hostname.endsWith(CF_HOST);
  } catch {
    return false;
  }
};

// CF image IDs can be UUIDs or base-62 strings. Keep a loose check.
export const looksLikeCloudflareImageId = (src: string): boolean => {
  if (!src || src.startsWith('/') || src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) return false;
  // UUID v4
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(src)) return true;
  // Base62-ish id (Cloudflare sometimes issues shorter ids)
  if (/^[A-Za-z0-9-_]{20,}$/i.test(src)) return true;
  return false;
};

export const buildCloudflareImageUrl = (
  idOrUrl: string,
  variant?: string,
): string | null => {
  if (!idOrUrl) return null;
  const desiredVariant = (variant || process.env.NEXT_PUBLIC_CF_IMAGES_VARIANT || 'public').toString();

  // Existing Cloudflare URL: possibly swap the variant segment
  if (isCloudflareImagesUrl(idOrUrl)) {
    try {
      const u = new URL(idOrUrl);
      // Format: /<account_hash>/<image_id>/<variant>
      const parts = u.pathname.replace(/^\/+/, '').split('/');
      if (parts.length >= 3) {
        parts[2] = desiredVariant;
        u.pathname = '/' + parts.join('/');
        return u.toString();
      }
      return idOrUrl;
    } catch {
      return idOrUrl;
    }
  }

  // ID: construct URL from env account hash
  if (looksLikeCloudflareImageId(idOrUrl)) {
    const accountHash = process.env.NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH;
    if (!accountHash) return null;
    return `https://${CF_HOST}/${accountHash}/${idOrUrl}/${desiredVariant}`;
  }

  return null;
};

export const normalizeToCloudflareIfPossible = (src?: string | null): string | null => {
  if (!src) return null;
  const built = buildCloudflareImageUrl(src);
  return built || src;
};

