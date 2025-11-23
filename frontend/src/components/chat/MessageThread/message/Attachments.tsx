// components/chat/MessageThread/message/Attachments.tsx
import * as React from 'react';

type Props = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  fileLabel?: string | null;
  fileUrl?: string | null;
  progressPct?: number | null;
  onOpenImage?: () => void;
  onOpenVideo?: (state?: { time?: number; playing?: boolean }) => void;
  onMediaLoad?: () => void;
};

export default function Attachments({ imageUrl, videoUrl, audioUrl, fileLabel, fileUrl, progressPct, onOpenImage, onOpenVideo, onMediaLoad }: Props) {

  // Helper to compute target pixel size honoring width/height caps and preserving aspect ratio
  const computeTargetSize = React.useCallback((mediaW: number, mediaH: number) => {
    if (!mediaW || !mediaH) return null;
    const vw = Math.max(320, typeof window !== 'undefined' ? window.innerWidth : 1024);
    const vh = Math.max(480, typeof window !== 'undefined' ? window.innerHeight : 768);
    const maxW = Math.min(420, Math.floor(vw * 0.62));
    const maxH = Math.floor(vh * 0.70);
    const r = mediaW / mediaH; // width / height
    let w = maxW;
    let h = Math.round(w / r);
    if (h > maxH) {
      h = maxH;
      w = Math.round(h * r);
    }
    return { w, h };
  }, []);

  if (imageUrl) {
    const open = () => { try { onOpenImage?.(); } catch {} };
    return (
      <button
        type="button"
        onClick={open}
        className="group relative inline-block max-w-[420px] w-[min(420px,62vw)] overflow-hidden rounded-xl border border-gray-200 bg-black/5 hover:bg-black/10 transition"
        aria-label="Open image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={fileLabel || 'Image'}
          className="block max-h-72 w-full object-cover"
          loading="lazy"
          onLoad={() => { try { onMediaLoad?.(); } catch {} }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-transparent" />
        {typeof progressPct === 'number' && (
          <div className="absolute inset-0 grid place-items-center">
            <ProgressRing pct={progressPct} />
          </div>
        )}
      </button>
    );
  }
  if (videoUrl) {
    const isLocalPreview = typeof videoUrl === 'string' && (videoUrl.startsWith('blob:') || videoUrl.startsWith('data:'));
    if (!isLocalPreview) {
      // For remote videos, avoid setting src inline to prevent duplicate fetches
      // (inline + lightbox). Show a sized placeholder with a Play button that
      // opens the lightbox/player.
      const open = () => { try { onOpenVideo?.(); } catch {} };
      return (
        <div className="relative inline-block">
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ width: 'min(420px, 62vw)', paddingTop: '56.25%' }}>
            <button
              type="button"
              aria-label="Play video"
              onClick={open}
              className="absolute inset-0 w-full h-full grid place-items-center text-white hover:bg-white/5"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/50 bg-black/40 shadow-sm text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M4.5 5.653c0-1.426 1.529-2.33 2.778-1.643l11.54 6.347c1.296.712 1.296 2.574 0 3.286L7.278 20.99C6.03 21.677 4.5 20.773 4.5 19.347V5.653z" />
                </svg>
                <span>Play video</span>
              </div>
            </button>
            {typeof progressPct === 'number' && (
              <div className="absolute inset-0 grid place-items-center">
                <ProgressRing pct={progressPct} />
              </div>
            )}
          </div>
        </div>
      );
    }
    const vidRef = React.useRef<HTMLVideoElement | null>(null);
    const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
    const onMeta = () => {
      try {
        const el = vidRef.current;
        const w = Number(el?.videoWidth || 0);
        const h = Number(el?.videoHeight || 0);
        if (w > 0 && h > 0) {
          const next = computeTargetSize(w, h);
          if (next) setSize(next);
        }
      } catch {}
      try { onMediaLoad?.(); } catch {}
    };
    React.useEffect(() => {
      if (!size) return;
      const onResize = () => {
        try {
          const el = vidRef.current;
          const w = Number(el?.videoWidth || 0);
          const h = Number(el?.videoHeight || 0);
          if (w > 0 && h > 0) {
            const next = computeTargetSize(w, h);
            if (next) setSize(next);
          }
        } catch {}
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }
      return () => {};
    }, [size, computeTargetSize]);

    if (!size) {
      // Placeholder 16:9
      return (
        <div className="relative inline-block">
          <div className="relative w-full overflow-hidden rounded-xl" style={{ width: 'min(420px, 62vw)', paddingTop: '56.25%' }}>
            <video
              className="absolute inset-0 w-full h-full"
              controls
              preload="metadata"
              playsInline
              src={videoUrl || undefined}
              ref={vidRef}
              onLoadedMetadata={onMeta}
              onDoubleClick={(e) => {
                try {
                  const el = (e.currentTarget as HTMLVideoElement);
                  if (el.paused) el.play(); else el.pause();
                } catch {}
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="relative inline-block overflow-hidden rounded-xl" style={{ width: `${size.w}px`, height: `${size.h}px` }}>
        <video
          className="absolute inset-0 w-full h-full"
          controls
          preload="metadata"
          playsInline
          src={videoUrl || undefined}
          ref={vidRef}
          onLoadedMetadata={onMeta}
          onDoubleClick={(e) => {
            try {
              const el = (e.currentTarget as HTMLVideoElement);
              if (el.paused) el.play(); else el.pause();
            } catch {}
          }}
        />
        {onOpenVideo && (
          <button
            type="button"
            aria-label="Open media viewer"
            className="absolute top-2 right-2 z-10 rounded-full bg-white/90 border border-gray-200 w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-white"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              try {
                const el = vidRef.current;
                const state = { time: el?.currentTime, playing: el ? !el.paused : undefined };
                if (el) { try { el.pause(); } catch {} }
                onOpenVideo?.(state);
              } catch {
                onOpenVideo?.();
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
            </svg>
          </button>
        )}
        {typeof progressPct === 'number' && (
          <div className="absolute inset-0 grid place-items-center">
            <ProgressRing pct={progressPct} />
          </div>
        )}
      </div>
    );
  }
  if (audioUrl) {
    return (
      <audio
        className="w-full"
        controls
        src={audioUrl || undefined}
        onLoadedMetadata={onMediaLoad}
      />
    );
  }
  if (fileLabel) {
    // Detect PDFs by filename when content-type isn't available in props
    const label = String(fileLabel || 'Attachment');
    const href = typeof fileUrl === 'string' && fileUrl ? fileUrl : undefined;
    const isPdf = /\.pdf$/i.test(label || '') || /[?&]filename=.*\.pdf($|&)/i.test(label || '');
    if (isPdf && href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-xs items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 no-underline hover:no-underline"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-red-100 text-red-600 text-xs font-semibold">PDF</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{label || 'Document.pdf'}</div>
            <div className="text-xs text-gray-500">Open PDF</div>
          </div>
        </a>
      );
    }
    return (
      <div className="text-[13px] text-gray-700 bg-gray-100 rounded px-2 py-1.5">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
            {label}
          </a>
        ) : (
          label
        )}
      </div>
    );
  }
  return null;
}

function ProgressRing({ pct }: { pct: number }) {
  const R = 18; const C = Math.PI * 2 * R;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={R} stroke="#e5e7eb" strokeWidth="4" fill="none" />
      <circle
        cx="24" cy="24" r={R}
        stroke="#6366f1" strokeWidth="4" fill="none"
        strokeDasharray={`${C} ${C}`}
        strokeDashoffset={`${C * (1 - clamped / 100)}`}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
