'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
// Use native <img> for chat attachments to avoid Next/Image overhead

interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
  images?: string[];
  index?: number;
  onIndexChange?: (idx: number) => void;
  onReply?: () => void;
}

export default function ImagePreviewModal({ open, src, alt = 'Image preview', onClose, images, index = 0, onIndexChange, onReply }: ImagePreviewModalProps) {
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [embedType, setEmbedType] = useState<'pdf' | 'audio' | null>(null);

  const attachmentFallbacks = useMemo(() => {
    if (!src) return [] as string[];
    if (/^(blob:|data:)/i.test(src)) return [src];
    const variants = new Set<string>();
    const add = (value?: string | null) => {
      if (!value) return;
      variants.add(value);
    };
    add(src);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      if (origin) {
        const viaFrontend = new URL(src, origin);
        add(viaFrontend.toString());
        add(`${viaFrontend.pathname}${viaFrontend.search}`);
        if (!viaFrontend.pathname.startsWith('/static/')) {
          const clone = new URL(viaFrontend.toString());
          clone.pathname = `/static${clone.pathname}`;
          add(clone.toString());
          add(`${clone.pathname}${clone.search}`);
        }
      }
    } catch {
      // ignore parse errors
    }
    try {
      const viaApi = new URL(src, process.env.NEXT_PUBLIC_API_URL || '');
      add(viaApi.toString());
      add(`${viaApi.pathname}${viaApi.search}`);
      if (!viaApi.pathname.startsWith('/static/')) {
        const clone = new URL(viaApi.toString());
        clone.pathname = `/static${clone.pathname}`;
        add(clone.toString());
        add(`${clone.pathname}${clone.search}`);
      }
    } catch {
      // ignore parse errors
    }
    return Array.from(variants);
  }, [src]);
  // Keyboard navigation (wrap-around)
  useEffect(() => {
    if (!open || !Array.isArray(images) || images.length === 0 || typeof onIndexChange !== 'function') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const len = images.length;
        const prev = (index - 1 + len) % len;
        onIndexChange(prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const len = images.length;
        const next = (index + 1) % len;
        onIndexChange(next);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, images, index, onIndexChange]);

  // Touch swipe navigation (mobile-friendly)
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 40; // px
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches?.[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!Array.isArray(images) || images.length === 0 || typeof onIndexChange !== 'function') return;
    const start = touchStartX.current;
    const end = e.changedTouches?.[0]?.clientX ?? null;
    touchStartX.current = null;
    if (start == null || end == null) return;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    const len = images.length;
    if (dx > 0) {
      // swipe right -> previous
      onIndexChange((index - 1 + len) % len);
    } else {
      // swipe left -> next
      onIndexChange((index + 1) % len);
    }
  };

  // For PDF and audio, fetch as blob and use object URL to avoid X-Frame-Options.
  // If type is unknown and not an image, probe the blob content-type to decide.
  useEffect(() => {
    if (!open || !src) {
      setEmbedSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setEmbedType(null);
      return;
    }
    const looksLikeImage = /\.(jpe?g|png|gif|webp|avif)(?:\?.*)?$/i.test(src) || /^data:image\//i.test(src);
    const declaredPdf = /\.pdf($|\?)/i.test(src);
    const declaredAudio = /\.(mp3|m4a|ogg|webm|wav)($|\?)/i.test(src) || /^data:audio\//i.test(src);
    // If it looks like an image, do not try to embed as PDF/audio
    if (looksLikeImage) {
      setEmbedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setEmbedType(null);
      return;
    }
    let aborted = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        for (const candidate of attachmentFallbacks) {
          if (aborted) return;
          try {
            const res = await fetch(candidate, { credentials: 'include' as RequestCredentials });
            if (!res.ok) continue;
            const blob = await res.blob();
            if (aborted) return;
            const ct = (blob.type || '').toLowerCase();
            const isPdf = declaredPdf || ct.includes('pdf');
            const isAudio = declaredAudio || ct.startsWith('audio/');
            if (isPdf || isAudio) {
              objectUrl = URL.createObjectURL(blob);
              setEmbedSrc(objectUrl);
              setEmbedType(isPdf ? 'pdf' : 'audio');
              return;
            }
          } catch {
            continue;
          }
        }
        setEmbedSrc(null);
        setEmbedType(null);
      } catch {
        setEmbedSrc(null);
        setEmbedType(null);
      }
    })();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, src, attachmentFallbacks]);
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-[1000]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-white" onClick={onClose} />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel
              className="relative inline-block max-w-[96vw] pt-6"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {/* Top-right close and download actions */}
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <a
                  href={embedSrc || src}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-white/90 border border-gray-200 px-2 py-1 text-[12px] text-gray-700 hover:bg-white"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close preview"
                  className="rounded-full bg-white/90 border border-gray-200 w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Main media area */}
              <div className="relative inline-block">
                {(() => {
                  const isPdf = embedType === 'pdf' || /\.pdf($|\?)/i.test(src);
                  const isAudio = embedType === 'audio' || /\.(mp3|m4a|ogg|webm|wav)($|\?)/i.test(src);
                  if (isPdf) {
                    return (
                      <iframe
                        src={embedSrc || src}
                        className="max-h-[80vh] max-w-[96vw] w-[96vw] h-[80vh] rounded-md bg-white"
                        title={alt}
                      />
                    );
                  }
                  if (isAudio) {
                    return (
                      <div className="max-w-[96vw] max-h-[80vh] p-6 bg-white rounded-md flex items-center justify-center">
                        <audio controls src={embedSrc || src} preload="metadata" className="w-[80vw] max-w-[640px]" />
                      </div>
                    );
                  }
                  return (
                    <div className="relative">
                      <img
                        src={src}
                        alt={alt}
                        className="max-h-[80vh] max-w-[96vw] object-contain rounded-md"
                        loading="eager"
                        decoding="async"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (!(img as any).dataset.triedAlt) {
                            try {
                              const u = new URL(img.src);
                              if (/^\/static\/attachments\//.test(u.pathname)) {
                                const p = u.pathname.replace(/^\/static\//, '/');
                                img.src = `${u.protocol}//${u.host}${p}${u.search}`;
                                (img as any).dataset.triedAlt = '1';
                              } else if (/^\/attachments\//.test(u.pathname)) {
                                const p = '/static' + u.pathname;
                                img.src = `${u.protocol}//${u.host}${p}${u.search}`;
                                (img as any).dataset.triedAlt = '1';
                              }
                            } catch {}
                          }
                        }}
                      />
                      {/* Prev/Next overlayed on the image area */}
                      {Array.isArray(images) && images.length > 1 && typeof onIndexChange === 'function' && (
                        <>
                          <button
                            type="button"
                            aria-label="Previous image"
                            className="absolute top-1/2 left-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                            onClick={(e) => { e.stopPropagation(); onIndexChange(((index - 1 + (images?.length || 1)) % (images?.length || 1))); }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label="Next image"
                            className="absolute top-1/2 right-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                            onClick={(e) => { e.stopPropagation(); onIndexChange(((index + 1) % (images?.length || 1))); }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Below image: divider, carousel, and actions */}
              {Array.isArray(images) && images.length > 0 && (
                <div className="w-full pt-4 pb-6">
                  <div className="w-full h-px bg-gray-200 mb-4" />
                  <div className="flex items-center gap-3">
                    {images.length > 1 && (
                      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                        <ThumbnailTray images={images} activeIndex={index} onIndexChange={onIndexChange} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {typeof onReply === 'function' && (
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 shadow hover:bg-gray-50 text-sm"
                          onClick={onReply}
                        >
                          Reply
                        </button>
                      )}
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 shadow hover:bg-gray-50 text-sm"
                        onClick={onClose}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// Internal: thumbnails strip component
function ThumbnailTray({ images, activeIndex, onIndexChange }: { images: string[]; activeIndex: number; onIndexChange?: (idx: number) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const active = itemRefs.current[activeIndex];
    if (!active) return;
    const rect = active.getBoundingClientRect();
    const parentRect = el.getBoundingClientRect();
    const delta = rect.left - (parentRect.left + parentRect.width / 2 - rect.width / 2);
    el.scrollLeft += delta; // center the active thumb
  }, [activeIndex, images.length]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="flex gap-2 justify-center overflow-x-auto no-scrollbar py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {images.map((src, i) => (
          <div
            key={src + i}
            ref={(el) => (itemRefs.current[i] = el)}
            className={`relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border ${i === activeIndex ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'}`}
          >
            <button
              type="button"
              className="w-full h-full"
              onClick={() => onIndexChange && onIndexChange(i)}
              aria-label={`Preview image ${i + 1}`}
            >
              <img src={src} alt={`thumb-${i + 1}`} className="w-14 h-14 object-cover object-center" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
