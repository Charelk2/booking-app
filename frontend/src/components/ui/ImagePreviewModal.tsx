'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
// Use native <img> for chat attachments to avoid Next/Image overhead

interface GalleryItem { src: string; type: 'image' | 'video' | 'audio' };

interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
  // Deprecated: images of strings (image-only). Prefer `items` with explicit type.
  images?: string[];
  items?: GalleryItem[];
  index?: number;
  onIndexChange?: (idx: number) => void;
  onReply?: () => void;
  initialIndex?: number;
  initialTime?: number; // seconds
  autoPlay?: boolean;
  onCloseWithState?: (resume?: { src: string; time: number; wasPlaying: boolean; index: number }) => void;
}

export default function ImagePreviewModal({ open, src, alt = 'Image preview', onClose, images, items, index = 0, onIndexChange, onReply, initialIndex = 0, initialTime, autoPlay = false, onCloseWithState }: ImagePreviewModalProps) {
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [embedType, setEmbedType] = useState<'audio' | null>(null);

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
  // Resolve the unified items list from either `items` or legacy `images`
  const unifiedItems: GalleryItem[] = useMemo(() => {
    if (Array.isArray(items) && items.length) return items;
    if (Array.isArray(images) && images.length) return images.map((s) => ({ src: s, type: 'image' as const }));
    return [{ src, type: 'image' as const }];
  }, [items, images, src]);

  // Keyboard navigation (wrap-around)
  useEffect(() => {
    if (!open || !Array.isArray(unifiedItems) || unifiedItems.length === 0 || typeof onIndexChange !== 'function') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const len = unifiedItems.length;
        const prev = (index - 1 + len) % len;
        onIndexChange(prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const len = unifiedItems.length;
        const next = (index + 1) % len;
        onIndexChange(next);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, unifiedItems, index, onIndexChange]);

  // Touch swipe navigation (mobile-friendly)
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 40; // px
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches?.[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!Array.isArray(unifiedItems) || unifiedItems.length === 0 || typeof onIndexChange !== 'function') return;
    const start = touchStartX.current;
    const end = e.changedTouches?.[0]?.clientX ?? null;
    touchStartX.current = null;
    if (start == null || end == null) return;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    const len = unifiedItems.length;
    if (dx > 0) {
      // swipe right -> previous
      onIndexChange((index - 1 + len) % len);
    } else {
      // swipe left -> next
      onIndexChange((index + 1) % len);
    }
  };

  // For audio, fetch as blob and use object URL if needed.
  // PDFs are not embedded inline (X-Frame-Options/CORS); they open in a new tab from the bubble.
  useEffect(() => {
    if (!open || !src) {
      setEmbedSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setEmbedType(null);
      return;
    }
    const looksLikeImage = /\.(jpe?g|png|gif|webp|avif|heic|heif)(?:\?.*)?$/i.test(src) || /^data:image\//i.test(src);
    const declaredAudio = /\.(mp3|m4a|ogg|wav)($|\?)/i.test(src) || /^data:audio\//i.test(src);
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
            const isAudio = declaredAudio || ct.startsWith('audio/');
            if (isAudio) {
              objectUrl = URL.createObjectURL(blob);
              setEmbedSrc(objectUrl);
              setEmbedType('audio');
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

  // Handle resuming playback position and autoplay for the initially opened video
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const appliedStartRef = useRef(false);
  useEffect(() => {
    appliedStartRef.current = false;
  }, [open, index, src]);

  const getResume = () => {
    try {
      const current = unifiedItems[index] || { src, type: 'image' as const };
      if (current.type !== 'video') return undefined;
      const t = Math.max(0, Math.floor((videoRef.current?.currentTime || 0))); // seconds
      const playing = videoRef.current ? !videoRef.current.paused : false;
      return { src: current.src, time: t, wasPlaying: playing, index };
    } catch { return undefined; }
  };

  const handleDialogClose = () => {
    try { videoRef.current?.pause?.(); } catch {}
    try {
      const res = getResume();
      if (res) onCloseWithState?.({ ...res, wasPlaying: false });
      else onCloseWithState?.(undefined);
    } catch {}
    try { onClose(); } catch {}
  };
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-[1000]" onClose={handleDialogClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-white" onClick={handleDialogClose} />
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
              className="relative block w-full max-w-[96vw] pt-6 mx-auto"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {/* Top-right close action */}
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDialogClose}
                  aria-label="Close preview"
                  className="rounded-full bg-white/90 border border-gray-200 w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Main media area */}
              <div className="relative w-full">
                {(() => {
                  const current = unifiedItems[index] || { src, type: 'image' as const };
                  const isVideo = current.type === 'video' || /\.(mp4|mov|webm|mkv|m4v)($|\?)/i.test(src);
                  const isAudio = current.type === 'audio' || embedType === 'audio';
                  if (isAudio) {
                    return (
                      <div className="w-full max-w-[96vw] max-h-[80vh] p-6 bg-white rounded-md flex items-center justify-center mx-auto">
                        <audio controls src={embedSrc || src} preload="metadata" className="w-[80vw] max-w-[640px]" />
                      </div>
                    );
                  }
                  if (isVideo) {
                    return (
                      <div className="relative w-full max-w-[96vw] max-h-[80vh] mx-auto">
                        <video
                          src={src}
                          controls
                          preload="metadata"
                          playsInline
                          className="block mx-auto max-h-[80vh] max-w-[96vw] rounded-md"
                          ref={videoRef}
                          onLoadedMetadata={() => {
                            try {
                              if (!appliedStartRef.current && typeof initialTime === 'number' && index === initialIndex) {
                                if (videoRef.current) {
                                  videoRef.current.currentTime = Math.max(0, initialTime);
                                }
                              }
                              if (!appliedStartRef.current && autoPlay && index === initialIndex) {
                                videoRef.current?.play?.();
                              }
                              appliedStartRef.current = true;
                            } catch {}
                          }}
                          onDoubleClick={(e) => {
                            try {
                              const el = e.currentTarget as HTMLVideoElement;
                              if (el.paused) el.play(); else el.pause();
                            } catch {}
                          }}
                        />
                        {/* Prev/Next overlay for videos too */}
                        {Array.isArray(unifiedItems) && unifiedItems.length > 1 && typeof onIndexChange === 'function' && (
                          <>
                            <button
                              type="button"
                              aria-label="Previous"
                              className="absolute top-1/2 left-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                              onClick={(e) => { e.stopPropagation(); onIndexChange(((index - 1 + (unifiedItems?.length || 1)) % (unifiedItems?.length || 1))); }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label="Next"
                              className="absolute top-1/2 right-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                              onClick={(e) => { e.stopPropagation(); onIndexChange(((index + 1) % (unifiedItems?.length || 1))); }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="relative w-full flex justify-center">
                      <ZoomableImage src={src} alt={alt} />
                      {/* Prev/Next overlayed on the image area */}
                      {Array.isArray(unifiedItems) && unifiedItems.length > 1 && typeof onIndexChange === 'function' && (
                        <>
                          <button
                            type="button"
                            aria-label="Previous image"
                            className="absolute top-1/2 left-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                            onClick={(e) => { e.stopPropagation(); onIndexChange(((index - 1 + (unifiedItems?.length || 1)) % (unifiedItems?.length || 1))); }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label="Next image"
                            className="absolute top-1/2 right-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 border border-gray-200 shadow flex items-center justify-center hover:bg-white"
                            onClick={(e) => { e.stopPropagation(); onIndexChange(((index + 1) % (unifiedItems?.length || 1))); }}
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
              {Array.isArray(unifiedItems) && unifiedItems.length > 0 && (
                <div className="w-full pt-4 pb-6">
                  <div className="w-full h-px bg-gray-200 mb-4" />
                  <div className="flex items-center gap-3">
                    {unifiedItems.length > 1 && (
                      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                        <ThumbnailTray items={unifiedItems} activeIndex={index} onIndexChange={onIndexChange} />
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
                        onClick={handleDialogClose}
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
function ThumbnailTray({ items, activeIndex, onIndexChange }: { items: GalleryItem[]; activeIndex: number; onIndexChange?: (idx: number) => void }) {
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
  }, [activeIndex, items.length]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="flex gap-2 justify-center overflow-x-auto no-scrollbar py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {items.map((it, i) => (
          <div
            key={it.src + i}
            ref={(el) => { itemRefs.current[i] = el; }}
            className={`relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border ${i === activeIndex ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'}`}
          >
            <button
              type="button"
              className="w-full h-full"
              onClick={() => onIndexChange && onIndexChange(i)}
              aria-label={`Preview image ${i + 1}`}
            >
              {it.type === 'image' ? (
                <img src={it.src} alt={`thumb-${i + 1}`} className="w-14 h-14 object-cover object-center" />
              ) : (
                <div className="w-14 h-14 bg-black/60 grid place-items-center text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 opacity-90">
                    <path d="M4.5 5.653c0-1.426 1.529-2.33 2.778-1.643l11.54 6.347c1.296.712 1.296 2.574 0 3.286L7.278 20.99C6.03 21.677 4.5 20.773 4.5 19.347V5.653z" />
                  </svg>
                </div>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Internal: zoomable image with pinch-to-zoom and pan.
function ZoomableImage({ src, alt }: { src: string; alt?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastSingle = useRef<{ x: number; y: number } | null>(null);
  const pinchStart = useRef<{ d: number; scale: number } | null>(null);

  useEffect(() => {
    // Reset zoom when image source changes
    setScale(1); setTx(0); setTy(0); setDragging(false);
    pointers.current.clear();
    lastSingle.current = null; pinchStart.current = null;
  }, [src]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const setScaleClamped = (s: number) => setScale(clamp(s, 1, 4));

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const delta = -e.deltaY; // natural: wheel up = zoom in
    const zoom = Math.exp(delta * 0.0015);
    const next = clamp(scale * zoom, 1, 4);
    // Optional: adjust translate to zoom towards pointer
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const k = next / scale - 1;
      setTx((prev) => prev - cx * k);
      setTy((prev) => prev - cy * k);
    }
    setScale(next);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      lastSingle.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x; const dy = pts[0].y - pts[1].y;
      pinchStart.current = { d: Math.hypot(dx, dy), scale };
      setDragging(false);
    }
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    const curr = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, curr);
    if (pointers.current.size === 1 && lastSingle.current) {
      const dx = curr.x - lastSingle.current.x;
      const dy = curr.y - lastSingle.current.y;
      lastSingle.current = curr;
      if (scale > 1) {
        setTx((t) => t + dx);
        setTy((t) => t + dy);
      }
    } else if (pointers.current.size === 2 && pinchStart.current) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x; const dy = pts[0].y - pts[1].y;
      const d = Math.hypot(dx, dy);
      const next = clamp((pinchStart.current.scale || 1) * (d / pinchStart.current.d), 1, 4);
      setScale(next);
    }
  };
  const onPointerUpOrCancel: React.PointerEventHandler<HTMLDivElement> = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size <= 1) {
      pinchStart.current = null;
      setDragging(pointers.current.size === 1);
      const remaining = Array.from(pointers.current.values())[0];
      lastSingle.current = remaining || null;
    }
    if (pointers.current.size === 0) {
      setDragging(false);
    }
  };

  const onDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    if (scale > 1) { setScale(1); setTx(0); setTy(0); return; }
    // Zoom-in towards click point
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const next = 2;
      const k = next / scale - 1;
      setTx((prev) => prev - cx * k);
      setTy((prev) => prev - cy * k);
      setScaleClamped(next);
    } else {
      setScaleClamped(2);
    }
  };

  return (
    <div
      ref={containerRef}
      className="inline-flex items-center justify-center max-h-[80vh] max-w-[96vw] rounded-md overflow-hidden bg-white cursor-grab mx-auto"
      style={{ touchAction: 'none' as any }}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpOrCancel}
      onPointerCancel={onPointerUpOrCancel}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        className={"select-none block"}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: 'center center',
          maxHeight: '80vh',
          maxWidth: '96vw',
          objectFit: 'contain',
        }}
        draggable={false}
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
    </div>
  );
}
