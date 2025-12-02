// components/chat/MessageThread/utils/media.ts
export function isImage(url?: string | null) {
  if (!url) return false;
  // Treat Cloudflare Images and R2 'images' keys as images even without an extension
  if (/imagedelivery\.net\//i.test(url)) return true;
  if (/r2\.cloudflarestorage\.com\//i.test(url) && /\/images\//i.test(url)) return true;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif)(?:\?.*)?$/i.test(url) || /^data:image\//i.test(url);
}
export function isVideo(url?: string | null) {
  if (!url) return false;
  // Cloudflare Stream domains (best-effort)
  if (/videodelivery\.net\//i.test(url)) return true;
  return /\.(mp4|mov|webm|mkv|m4v)(?:\?.*)?$/i.test(url) || /^data:video\//i.test(url);
}
export function isAudio(url?: string | null) {
  if (!url) return false;
  return /\.(webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i.test(url) || /^data:audio\//i.test(url);
}

// Unified attachment readiness helpers
export function isAttachmentCandidate(m: any): boolean {
  try {
    const ct = String(m?.attachment_meta?.content_type || '').toLowerCase().split(';')[0].trim();
    const name = String(m?.attachment_meta?.original_filename || '').toLowerCase();
    const url = String(m?.attachment_url || '');
    const contentText = String(m?.content || '').toLowerCase().trim();
    // Treat plain-text filenames like "Screenshot 2025-12-01 at 21.37.49.png"
    // as attachment candidates even when attachment_meta/url are not yet set.
    const looksFilenameText =
      !!contentText &&
      /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|webm|mkv|m4v|mp3|m4a|wav|ogg)$/i.test(contentText);

    if (!ct && !name && !url && !looksFilenameText) return false;
    if (ct.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name) || looksFilenameText) return true;
    if (ct.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(name) || looksFilenameText) return true;
    if (ct.startsWith('audio/') || /\.(webm|mp3|m4a|ogg|wav)$/i.test(name) || looksFilenameText) return true;
    return Boolean(url);
  } catch {
    return false;
  }
}

export function isAttachmentReady(m: any): boolean {
  try {
    if (!isAttachmentCandidate(m)) return false;
    const ct = String(m?.attachment_meta?.content_type || '').toLowerCase().split(';')[0].trim();
    const url = String(m?.attachment_url || '');
    // For video we could require stream_url/poster_url if your stack uses them
    if (ct.startsWith('video/')) {
      const streamUrl = String((m as any)?.stream_url || '');
      return Boolean(streamUrl || url);
    }
    return Boolean(url);
  } catch {
    return false;
  }
}
