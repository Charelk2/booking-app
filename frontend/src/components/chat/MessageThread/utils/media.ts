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
