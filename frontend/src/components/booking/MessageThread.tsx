// frontend/src/components/booking/MessageThread.tsx
'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { isAxiosError } from 'axios';
import { useTransportState } from '@/hooks/useTransportState';
import { isOfflineError, isTransientTransportError, runWithTransport } from '@/lib/transportState';
// Use SafeImage everywhere for consistent Next/Image optimization
import SafeImage from '@/components/ui/SafeImage';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { VirtuosoProps } from 'react-virtuoso';
import { createPortal } from 'react-dom';
import { format, isValid, differenceInCalendarDays, startOfDay, formatDistanceToNow } from 'date-fns';
import data from '@emoji-mart/data';
import { DocumentIcon, DocumentTextIcon, FaceSmileIcon, ChevronDownIcon, MusicalNoteIcon, PaperClipIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { WordIcon, ExcelIcon, PowerPointIcon, PdfIcon } from '@/components/icons/OfficeIcons';
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import ReadReceipt, { type DeliveryState } from '@/components/booking/ReadReceipt';

import {
  getFullImageUrl,
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';
import { isSystemMessage as isSystemMsgHelper, systemLabel } from '@/lib/systemMessages';
// Telemetry & flags removed in Batch 1 clean revamp

import {
  Booking,
  BookingSimple,
  Review,
  // DO NOT import Message — we use a thread-safe internal type here
  MessageCreate,
  QuoteV2,
  QuoteV2Create,
  BookingRequest,
  AttachmentMeta,
} from '@/types';

import {
  getMessagesForBookingRequest,
  type MessageListParams,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  createQuoteV2,
  getQuoteV2,
  acceptQuoteV2,
  declineQuoteV2,
  getBookingDetails,
  getMyClientBookings,
  getBookingRequestById,
  markMessagesRead,
  markThreadRead,
  updateBookingRequestArtist,
  deleteMessageForBookingRequest,
  getService,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { emitThreadsUpdated, type ThreadsUpdatedDetail } from '@/lib/threadsEvents';
import { emissionPayload, getThreadSwitchSnapshot, trackHydrationEvent } from '@/lib/inboxTelemetry';

import useOfflineQueue from '@/hooks/useOfflineQueue';
import usePaymentModal from '@/hooks/usePaymentModal';
import useRealtime from '@/hooks/useRealtime';
import useBookingView from '@/hooks/useBookingView';
import { useQuotes } from '@/hooks/useQuotes';
// Non-virtual scroll helpers no longer needed

import Button from '../ui/Button';
import { addMessageReaction, removeMessageReaction } from '@/lib/api';
import QuoteBubble from './QuoteBubble';
import QuoteBubbleSkeleton from './QuoteBubbleSkeleton';
import InlineQuoteForm from './InlineQuoteForm';
import BookingSummaryCard from './BookingSummaryCard';
import BookingSummarySkeleton from './BookingSummarySkeleton';
import { t } from '@/lib/i18n';
import EventPrepCard from './EventPrepCard';
import ImagePreviewModal from '@/components/ui/ImagePreviewModal';
import ThreadDayDivider from './ThreadDayDivider';
import ThreadMessageGroup from './ThreadMessageGroup';

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });
// Type the dynamic Virtuoso component so TS recognizes its props (totalCount, itemContent, etc.)
const Virtuoso = dynamic(() => import('react-virtuoso').then((m: any) => m.Virtuoso), { ssr: false }) as unknown as React.ForwardRefExoticComponent<
  VirtuosoProps<any, any> & React.RefAttributes<any>
>;
const MemoQuoteBubble = React.memo(QuoteBubble);

type SupplierInviteActionState = {
  msgId: number;
  choice: 'accept' | 'decline';
} | null;
const MemoInlineQuoteForm = React.memo(InlineQuoteForm);

type FetchMessagesOptions = {
  mode?: 'initial' | 'incremental';
  force?: boolean;
  reason?: string;
  /** override page size (defaults: 100 initial, 50 incremental) */
  limit?: number;
  /** merge_update: do not replace the list; only merge new + update flags */
  behavior?: 'replace' | 'merge_update';
};

// ===== Constants ==============================================================
const API_BASE = (() => {
  try {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      if (/\.booka\.co\.za$/.test(h) || h === 'booka.co.za') return 'https://api.booka.co.za';
      return window.location.origin;
    }
  } catch {}
  return 'http://localhost:8000';
})();
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 24;
const BOTTOM_GAP_PX = 8;
// Virtualized list renders full dataset efficiently
const MAX_TEXTAREA_LINES = 10;
// Robust type guards that also recognize our same‑origin proxy
const _underlyingUrlForProxy = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    const u = new URL(value, API_BASE);
    // Match both absolute and path-only forms of our proxy endpoint
    if (/\/api\/v1\/attachments\/proxy$/i.test(u.pathname) || /\/attachments\/proxy$/i.test(u.pathname)) {
      const raw = u.searchParams.get('u');
      if (raw) return raw;
    }
  } catch {}
  return null;
};

const isImageAttachment = (url?: string | null) => {
  if (!url) return false;
  // Only treat data URLs with explicit image MIME as images; for blob: URLs,
  // we rely on attachment_meta.content_type when available.
  if (/^data:image\//i.test(url)) return true;
  if (/\.(jpe?g|png|gif|webp|avif|heic|heif)(?:\?.*)?$/i.test(url)) return true;
  const proxied = _underlyingUrlForProxy(url);
  return proxied ? /\.(jpe?g|png|gif|webp|avif|heic|heif)(?:\?.*)?$/i.test(proxied) : false;
};

const isAudioAttachmentUrl = (url?: string | null) => {
  if (!url) return false;
  // Only data:audio is a reliable signal from URL; generic blob: must be
  // classified by content-type metadata, not URL scheme.
  if (/^data:audio\//i.test(url)) return true;
  if (/\.(webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i.test(url)) return true;
  const proxied = _underlyingUrlForProxy(url);
  return proxied ? /\.(webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i.test(proxied) : false;
};

const isVideoAttachmentUrl = (url?: string | null) => {
  if (!url) return false;
  if (/^data:video\//i.test(url)) return true;
  if (/\.(mp4|mov|webm|mkv|m4v)(?:\?.*)?$/i.test(url)) return true;
  const proxied = _underlyingUrlForProxy(url);
  return proxied ? /\.(mp4|mov|webm|mkv|m4v)(?:\?.*)?$/i.test(proxied) : false;
};

// Use UTC ISO timestamps for API payloads and optimistic messages
const gmt2ISOString = () => new Date().toISOString();

const normalizeType = (v?: string | null) => (v ?? '').toUpperCase();
const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${i === 0 ? Math.round(val) : val.toFixed(1)} ${sizes[i]}`;
};

const formatDuration = (secs?: number | null) => {
  if (!Number.isFinite(secs || 0) || (secs || 0) <= 0) return '0:00';
  const total = Math.floor(secs as number);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Lightweight custom audio UI driven by a hidden <audio>
function ChatAudioPlayer({
  initialSrc,
  fallbacks,
  original,
  compactWidth = 'w-full',
}: {
  initialSrc: string;
  fallbacks: string[];
  original: string;
  compactWidth?: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const progressRef = React.useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = React.useState<number>(0);
  const [current, setCurrent] = React.useState<number>(0);
  const [playing, setPlaying] = React.useState<boolean>(false);
  const [errorCount, setErrorCount] = React.useState<number>(0);
  const [dragging, setDragging] = React.useState<boolean>(false);

  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.src = initialSrc || '';
      el.preload = 'metadata';
      el.dataset.fallbackAttempt = '0';
      el.dataset.fallbackBlobRequested = '0';
      delete el.dataset.fallbackDone;
      el.load();
    } catch {}
  }, [initialSrc]);

  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoaded = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onTime = () => setCurrent(el.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onEmptied = () => {
      if (el.dataset.fallbackBlobUrl) {
        try { URL.revokeObjectURL(el.dataset.fallbackBlobUrl); } catch {}
        delete el.dataset.fallbackBlobUrl;
      }
      el.dataset.fallbackBlobRequested = '0';
      el.dataset.fallbackAttempt = '0';
      delete el.dataset.fallbackDone;
    };
    const onError = () => {
      setErrorCount((c) => c + 1);
      try { advanceAudioFallback(el, fallbacks, original); } catch {}
    };
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('emptied', onEmptied);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('emptied', onEmptied);
      el.removeEventListener('error', onError);
    };
  }, [fallbacks, original]);

  const pct = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;

  const toggle = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    try { if (el.paused) void el.play(); else el.pause(); } catch {}
  }, []);

  const applySeekFromClientX = React.useCallback((clientX: number) => {
    const el = audioRef.current; const bar = progressRef.current;
    if (!el || !bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = rect.width > 0 ? x / rect.width : 0;
    el.currentTime = ratio * duration;
  }, [duration]);

  const onProgressMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true);
    applySeekFromClientX(e.clientX);
  }, [applySeekFromClientX]);

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => applySeekFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, applySeekFromClientX]);

  const onTouchStart = React.useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    setDragging(true);
    const t = e.touches[0];
    if (t) applySeekFromClientX(t.clientX);
  }, [applySeekFromClientX]);
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) applySeekFromClientX(t.clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [dragging, applySeekFromClientX]);

  const exhausted = errorCount > (fallbacks?.length ?? 0) + 1;

  // tiny waveform stub heights seeded from src
  const makeHeights = React.useCallback((seed: string, n: number) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
    const arr: number[] = [];
    for (let i = 0; i < n; i++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      const v = (h >>> 0) / 0xffffffff;
      arr.push(0.35 + 0.6 * v);
    }
    return arr;
  }, []);
  const waveHeights = React.useMemo(() => makeHeights(initialSrc || original || 'seed', 16), [makeHeights, initialSrc, original]);

  return (
    <div className={`mt-1 block ${compactWidth}`}>
      <audio ref={audioRef} className="hidden" />
      {exhausted ? (
        <div className="text-[12px] text-gray-600">
          <span>Format not supported on this device.</span>{' '}
          {original ? (
            <a className="underline" href={original} target="_blank" rel="noreferrer">Open</a>
          ) : null}
        </div>
      ) : (
        <div className="select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={playing ? 'Pause voice note' : 'Play voice note'}
              onClick={toggle}
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform"
              style={{ backgroundColor: 'currentColor' }}
            >
              {playing ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <div className="flex-1">
              <div className="mb-1 h-5 flex items-end gap-[3px] opacity-80" aria-hidden="true">
                {waveHeights.map((v, i) => (
                  <div key={i} style={{ height: `${Math.round(8 + 8 * v)}px`, width: '2px', backgroundColor: 'currentColor', opacity: playing ? 0.6 : 0.35 }} className="rounded" />
                ))}
              </div>
              <div
                ref={progressRef}
                onMouseDown={onProgressMouseDown}
                onTouchStart={onTouchStart}
                className="h-1.5 rounded-full bg-black/10 overflow-hidden cursor-pointer touch-none"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={Math.max(1, Math.floor(duration))}
                aria-valuenow={Math.floor(current)}
              >
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'currentColor' }} />
              </div>
              <div className="mt-1 text-[10px] text-gray-600 tabular-nums">
                {formatDuration(current)} / {formatDuration(duration)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Map backend status/flags → delivery UI state
function toDeliveryState(m: ThreadMessage): DeliveryState {
  try {
    if (m.status === 'failed') return 'error';
    if ((m as any).is_read || (m as any).read_at) return 'read';
    if ((m as any).is_delivered || (m as any).delivered_at) return 'delivered';
    // Treat queued/sending/sent all as single-check 'sent'
    if (m.status === 'sent' || m.status === 'sending' || m.status === 'queued') return 'sent';
    return 'sent';
  } catch {
    return 'sent';
  }
}

type NormalizeViewUrlOptions = {
  serviceProviderByServiceId?: Record<number, number>;
  ensureServiceProvider?: (serviceId: number) => void;
  defaultProviderId?: number | null;
};

const normalizeServiceProviderViewUrl = (input?: string | null, options: NormalizeViewUrlOptions = {}) => {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const { serviceProviderByServiceId = {}, ensureServiceProvider, defaultProviderId } = options;
  const ensureNumber = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const normalizePathname = (pathname: string) => {
    if (!pathname) return pathname;
    const providerPattern = /(^|\/)service-providers\/(\d+)(?=\/?|$)/i;
    if (providerPattern.test(pathname)) return pathname;

    const match = pathname.match(/(^|\/)services\/(\d+)(?=\/?|$)/i);
    if (match) {
      const serviceId = Number(match[2]);
      if (!Number.isNaN(serviceId)) {
        const mappedId = ensureNumber(serviceProviderByServiceId[serviceId]);
        const fallbackId = ensureNumber(defaultProviderId);
        if (!mappedId && typeof ensureServiceProvider === 'function') ensureServiceProvider(serviceId);
        const replacementId = mappedId ?? fallbackId;
        if (replacementId) {
          return pathname.replace(match[0], `${match[1]}service-providers/${replacementId}`);
        }
      }
    }
    return pathname;
  };

  if (/^https?:/i.test(raw)) {
    try {
      const parsed = new URL(raw);
      parsed.pathname = normalizePathname(parsed.pathname);
      return parsed.toString();
    } catch {
      // fall through to relative handling
    }
  }

  const idx = raw.search(/[?#]/);
  const pathPart = idx === -1 ? raw : raw.slice(0, idx);
  const suffix = idx === -1 ? '' : raw.slice(idx);
  const normalizedPath = normalizePathname(pathPart);
  let combined = `${normalizedPath}${suffix}`;
  if (!/^https?:/i.test(raw) && !combined.startsWith('/')) {
    combined = `/${combined.replace(/^\/+/, '')}`;
  }
  return combined;
};

// Proxy backend static/media URLs through Next so iframes/audio are same-origin
const toProxyPath = (url: string): string => {
  try {
    const api = new URL(API_BASE);
    const u = new URL(url, API_BASE);
    const sameOrigin = u.protocol === api.protocol && u.hostname === api.hostname && (u.port || '') === (api.port || '');
    if (sameOrigin) {
      // For attachments/static/media, return a path-only URL so Next.js rewrites
      // proxy via the frontend origin (avoids CORS for audio/video elements).
      if (u.pathname.startsWith('/static/attachments/')) {
        return `${u.pathname}${u.search}`;
      }
      if (u.pathname.startsWith('/attachments/')) {
        return `${u.pathname}${u.search}`;
      }
      if (u.pathname.startsWith('/static/')) return `${u.pathname}${u.search}`;
      if (u.pathname.startsWith('/media/')) return `${u.pathname}${u.search}`;
    }
  } catch {}
  return url;
};

const altAttachmentPath = (raw: string): string => {
  try {
    const u = new URL(raw, API_BASE);
    const api = new URL(API_BASE);

    // Do not rewrite audio to /static — audio files are not mirrored there
    if (/\.(webm|mp3|m4a|ogg|wav)$/i.test(u.pathname)) {
      return u.toString();
    }

    // For images served by the API, prefer the /static mirror
    if (
      u.host === api.host &&
      u.pathname.startsWith('/attachments/') &&
      /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i.test(u.pathname)
    ) {
      u.pathname = `/static${u.pathname}`;
      return u.toString();
    }

    // If a third-party absolute URL still contains /attachments/, rewrite to API static for images only
    if (
      u.pathname.includes('/attachments/') &&
      /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i.test(u.pathname)
    ) {
      return `${api.origin}/static${u.pathname.split('/attachments').pop()}`;
    }

    return raw;
  } catch {
    return raw;
  }
};

// Trusted media host allowlist is built once (cheap & predictable)
const MEDIA_HOSTS = new Set(
  String(process.env.NEXT_PUBLIC_MEDIA_HOSTS || 'media.booka.co.za')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const normHost = (h: string) => h.replace(/\.$/, '').toLowerCase();
const isTrustedMediaHost = (h: string) => MEDIA_HOSTS.has(normHost(h));

// Normalize URLs that are already on the API origin; optionally allow direct
// use of known media hosts (R2/public CDN) to skip proxy entirely when CORS is configured.
const toApiAttachmentsUrl = (raw: string): string => {
  try {
    if (/^(blob:|data:)/i.test(raw)) return raw;
    const api = new URL(API_BASE);
    const u = new URL(raw, API_BASE);

    // If this isn't the API origin, prefer canonical media hosts or proxy to add stable caching.
    if (u.host !== api.host) {
      const hostLower = normHost(u.host);
      const isR2 = hostLower === 'r2.cloudflarestorage.com' || hostLower.endsWith('.r2.cloudflarestorage.com');

      // 1) If this is our canonical media host, allow direct
      if (isTrustedMediaHost(hostLower)) {
        return u.toString();
      }

      // 2) Repair legacy booka.co.za/booka-storage URLs → preferred media host
      if ((hostLower === 'booka.co.za') && (/^\/booka-storage\//i.test(u.pathname) || /^\/static\/booka-storage\//i.test(u.pathname))) {
        const preferred = Array.from(MEDIA_HOSTS)[0];
        if (preferred) {
          const fixed = new URL(u.toString());
          fixed.protocol = 'https:';
          fixed.host = preferred;
          fixed.pathname = fixed.pathname.replace(/^\/static\//i, '/').replace(/^\/booka-storage\//i, '/');
          return fixed.toString();
        }
      }

      // 3) Rewrite raw R2 endpoints to our preferred media host when configured
      if (isR2) {
        const preferred = Array.from(MEDIA_HOSTS)[0];
        if (preferred) {
          const fixed = new URL(u.toString());
          fixed.protocol = 'https:';
          fixed.host = preferred;
          fixed.pathname = fixed.pathname.replace(/^\/static\//i, '/').replace(/^\/booka-storage\//i, '/');
          return fixed.toString();
        }
      }

      // 4) Fallback to same-origin proxy for anything else
      const proxied = `${api.protocol}//${api.host}${API_V1}/attachments/proxy?u=${encodeURIComponent(u.toString())}`;
      return proxied;
    }

    // From here on we're same-origin: normalize known attachment/static paths
    let path = u.pathname;

    // Normalize /static/attachments/* to /attachments/*
    if (/^\/static\/attachments\//i.test(path)) {
      path = path.replace(/^\/static\//i, '/');
    }

    // Only return API-origin URLs for known paths; otherwise keep as-is
    if (!/^\/(attachments|media|static)\//i.test(path)) {
      return u.toString();
    }

    return `${api.protocol}//${api.host}${path}${u.search}`;
  } catch {
    return raw;
  }
};

const dedupeStrings = (values: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const expandAttachmentVariant = (value?: string | null): string[] => {
  if (!value) return [];
  const variants = [value];
  try {
    const absolute = new URL(value, API_BASE);
    variants.push(absolute.toString());
    // Only add a path-only variant for known local mounts. Avoid creating
    // arbitrary same-origin paths (e.g., /booka-storage/...) that will 404.
    const p = `${absolute.pathname}${absolute.search}`;
    if (/^\/(attachments|media)\//i.test(absolute.pathname) || /^\/static\/(attachments|media)\//i.test(absolute.pathname)) {
      variants.push(p);
    }
  } catch {
    // Ignore non-URL values (blob:, data:, etc.)
  }
  return variants;
};

const buildAttachmentFallbackChain = (raw: string): string[] => {
  if (!raw || /^(blob:|data:)/i.test(raw)) {
    return [raw];
  }

  let normalized = toApiAttachmentsUrl(raw);
  // Ensure normalized is absolute so URL parsing below succeeds
  try {
    normalized = new URL(normalized, API_BASE).toString();
  } catch {
    // keep original string; downstream guards handle parsing errors
  }

  let staticVariant: string | null = null;
  try {
    const u = new URL(normalized);
    // Do not generate /static variants for audio; we don't mirror audio under /static
    const isAudioPath = /\.(webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i.test(u.pathname);
    if (!isAudioPath && !u.pathname.startsWith('/static/')) {
      const clone = new URL(normalized);
      // Only create a /static variant for mounts we actually serve via /static
      if (/^\/(attachments|media)\//i.test(clone.pathname)) {
        clone.pathname = `/static${clone.pathname}`;
        staticVariant = clone.toString();
      }
    }
  } catch {
    staticVariant = null;
  }

  const candidates = dedupeStrings(
    [
      (() => {
        try {
          return toProxyPath(normalized);
        } catch {
          return normalized;
        }
      })(),
      normalized,
      raw,
      staticVariant,
      altAttachmentPath(normalized),
      altAttachmentPath(raw),
    ].flatMap(expandAttachmentVariant)
  );

  return candidates;
};

const urlsSharePath = (a: string, b: string): boolean => {
  if (!a || !b) return a === b;
  try {
    const ua = new URL(a, API_BASE);
    const ub = new URL(b, API_BASE);
    if (ua.origin !== ub.origin) return false;
    return ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return a === b;
  }
};

const fetchAttachmentBlobUrl = async (raw: string): Promise<string | null> => {
  if (!raw || /^(blob:|data:)/i.test(raw)) return null;
  try {
    const primary = toApiAttachmentsUrl(raw);
    const candidates = dedupeStrings([primary, altAttachmentPath(primary), raw, altAttachmentPath(raw)]);
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const response = await fetch(candidate, { credentials: 'include' });
        if (!response.ok) continue;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch {
        continue;
      }
    }
  } catch {}
  return null;
};

const advanceAudioFallback = (el: HTMLAudioElement, candidates: string[], original?: string): void => {
  if (el.dataset.fallbackDone === '1') return;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    if (original && el.dataset.fallbackBlobRequested !== '1') {
      el.dataset.fallbackBlobRequested = '1';
      void fetchAttachmentBlobUrl(original).then((blobUrl) => {
        if (!blobUrl) return;
        if (el.dataset.fallbackBlobUrl) {
          try { URL.revokeObjectURL(el.dataset.fallbackBlobUrl); } catch {}
        }
        el.dataset.fallbackBlobUrl = blobUrl;
        el.src = blobUrl;
        try { el.load(); } catch {}
      });
    }
    el.dataset.fallbackDone = '1';
    return;
  }
  const attempt = Number(el.dataset.fallbackAttempt || '0');
  for (let idx = attempt; idx < candidates.length; idx += 1) {
    const candidate = candidates[idx];
    if (!candidate) continue;
    if (urlsSharePath(candidate, el.currentSrc)) continue;
    el.dataset.fallbackAttempt = String(idx + 1);
    el.src = candidate;
    try {
      el.load();
    } catch {}
    return;
  }
  el.dataset.fallbackAttempt = String(candidates.length);
  if (original && el.dataset.fallbackBlobRequested !== '1') {
    el.dataset.fallbackBlobRequested = '1';
    void fetchAttachmentBlobUrl(original).then((blobUrl) => {
      if (!blobUrl) return;
      if (el.dataset.fallbackBlobUrl) {
        try { URL.revokeObjectURL(el.dataset.fallbackBlobUrl); } catch {}
      }
      el.dataset.fallbackBlobUrl = blobUrl;
      el.src = blobUrl;
      try { el.load(); } catch {}
    });
  }
  el.dataset.fallbackDone = '1';
};
const daySeparatorLabel = (date: Date) => {
  const now = new Date();
  const days = differenceInCalendarDays(startOfDay(now), startOfDay(date));
  if (days === 0) return format(date, 'EEEE');
  if (days === 1) return 'yesterday';
  if (days < 7) return format(date, 'EEEE');
  return format(date, 'EEE, d LLL');
};

// --- Per-thread session cache for instant switches --------------------------
import {
  readThreadCache as _readThreadCache,
  writeThreadCache as _writeThreadCache,
  cacheKeyForThread,
  readThreadFromIndexedDb,
  isThreadStoreEnabled,
} from '@/lib/threadCache';
function readCachedMessages(threadId: number): ThreadMessage[] | null {
  try {
    const arr = _readThreadCache(threadId);
    if (!Array.isArray(arr)) return null;
    const msgs = arr.map((m: any) => normalizeMessage(m)).filter((m: any) => Number.isFinite(m.id));
    return msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return null;
  }
}
function writeCachedMessages(threadId: number, messages: ThreadMessage[]) {
  try {
    _writeThreadCache(threadId, messages);
  } catch {}
}

// ===== Internal thread message shape =========================================
// Keeps the UI happy even if backend or global types lag during the migration.
type SenderTypeAny = 'client' | 'artist' | 'service_provider';
type VisibleToAny = 'artist' | 'service_provider' | 'client' | 'both';
type MessageStatus = 'queued' | 'sending' | 'sent' | 'failed';
type MessageKind = 'text' | 'quote' | 'system' | 'USER' | 'QUOTE' | 'SYSTEM';

type ThreadMessage = {
  is_read: boolean;
  id: number;
  booking_request_id: number;
  sender_id: number;
  sender_type: 'client' | 'service_provider'; // normalized
  content: string;
  message_type: MessageKind;
  system_key?: string | null;
  quote_id?: number | null;
  attachment_url?: string | null;
  attachment_meta?: AttachmentMeta | null;
  visible_to?: 'client' | 'service_provider' | 'both'; // normalized
  action?: string | null;
  avatar_url?: string | null;
  expires_at?: string | null;
  unread?: boolean;
  timestamp: string;
  status?: MessageStatus;
  // Optional reaction fields coming from the API; we also keep a separate
  // reactions state map for live updates & aggregates
  reactions?: Record<string, number> | null;
  my_reactions?: string[] | null;
  // Reply metadata (if this message is a reply to another)
  reply_to_message_id?: number | null;
  reply_to_preview?: string | null;
  // Local-only: optimistic blob/data URL to keep preview instant and robust
  local_preview_url?: string | null;
};

// Normalize mixed legacy/new fields into ThreadMessage
function normalizeSenderType(raw: SenderTypeAny | string | null | undefined): 'client' | 'service_provider' {
  if (raw === 'client') return 'client';
  // Treat legacy 'artist' as 'service_provider'
  return 'service_provider';
}
function normalizeVisibleTo(raw: VisibleToAny | string | null | undefined): 'client' | 'service_provider' | 'both' {
  if (!raw) return 'both';
  if (raw === 'both' || raw === 'client' || raw === 'service_provider') return raw;
  // Legacy 'artist' -> 'service_provider'
  return 'service_provider';
}
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
function normalizeMessage(raw: any): ThreadMessage {
  const brId =
    toNum(raw.booking_request_id) ??
    toNum(raw.booking_request?.id) ??
    toNum(raw.thread_id) ??
    toNum(raw.thread?.id) ??
    toNum(raw.request_id) ??
    toNum(raw.conversation_id) ??
    0;

  const ts =
    raw.timestamp ||
    raw.created_at ||
    raw.sent_at ||
    raw.inserted_at ||
    raw.created ||
    new Date().toISOString();

  return {
    id: Number(raw.id),
    booking_request_id: brId,
    sender_id: Number(raw.sender_id),
    sender_type: normalizeSenderType(raw.sender_type),
    content: String(raw.content ?? ''),
    message_type: (raw.message_type ?? 'text') as MessageKind,
    system_key: raw.system_key ?? null,
    quote_id: raw.quote_id == null ? null : Number(raw.quote_id),
    attachment_url: raw.attachment_url ?? null,
    attachment_meta: (raw as any).attachment_meta ?? null,
    visible_to: normalizeVisibleTo(raw.visible_to),
    action: raw.action ?? null,
    avatar_url: raw.avatar_url ?? null,
    expires_at: raw.expires_at ?? null,
    unread: Boolean(raw.unread),
    // Consider read_at in addition to is_read for robustness across shapes
    is_read: Boolean((raw as any).is_read || (raw as any).read_at),
    timestamp: ts,
    status: raw.status as MessageStatus | undefined,
    reactions: (raw as any).reactions || null,
    my_reactions: (raw as any).my_reactions || null,
    reply_to_message_id: (raw as any).reply_to_message_id ?? null,
    reply_to_preview: (raw as any).reply_to_preview ?? null,
  };
}

// Merge-by-id helper; stable chronological sort; prefers newer timestamp
function mergeMessages(existing: ThreadMessage[], incoming: ThreadMessage | ThreadMessage[]): ThreadMessage[] {
  const list = Array.isArray(incoming) ? incoming : [incoming];

  const map = new Map<number, ThreadMessage>();
  for (const m of existing) map.set(m.id, m);

  for (const m of list) {
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
      continue;
    }
    const prevTs = new Date(prev.timestamp).getTime();
    const curTs = new Date(m.timestamp).getTime();
    map.set(m.id, curTs >= prevTs ? { ...prev, ...m } : { ...m, ...prev });
  }

  const arr: ThreadMessage[] = [];
  map.forEach((v) => arr.push(v));
  return arr.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ---- Realtime envelope helpers ---------------------------------------------
function extractMessagesFromEnvelope(payload: any): any[] {
  if (!payload) return [];

  // Raw arrays / shapes
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.messages)) return payload.messages;
  if ((payload as any).message) return [payload.message];
  if ((payload as any).last_message) return [payload.last_message];
  if ('id' in (payload || {})) return [payload];

  // v1 envelopes (and a few aliases)
  const typ = String((payload as any).type || '').toLowerCase();
  const inner = (payload as any).payload ?? (payload as any).data ?? null;

  const isMsgType =
    /^message(?:[_-](?:created|new))?$/.test(typ) ||
    /^new[_-]?message$/.test(typ) ||
    typ === 'msg' ||
    typ === 'chat_message';
  const isMsgsType = /^(messages?|message_list)$/.test(typ);

  if (isMsgType) {
    const m = (payload as any).message ?? inner ?? null;
    return m ? [m] : [];
  }
  if (isMsgsType) {
    const arr = (payload as any).messages ?? inner ?? null;
    return Array.isArray(arr) ? arr : [];
  }

  // Some servers put type inside payload
  const innerType = String(inner?.type || '').toLowerCase();
  if ((/^message(?:[_-](?:created|new))?$/.test(innerType) || /^new[_-]?message$/.test(innerType)) && inner?.payload) {
    const m = inner.payload.message ?? inner.payload ?? null;
    return m ? [m] : [];
  }

  // Fallbacks inside payload (don’t require numeric id here)
  if (inner) {
    if (Array.isArray(inner.messages)) return inner.messages;
    if (inner.message) return [inner.message];
    if (inner.last_message) return [inner.last_message];
    if ('id' in inner) return [inner];
  }

  return [];
}

// ===== Public API =============================================================
export interface MessageThreadHandle {
  refreshMessages: () => void;
}

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

interface MessageThreadProps {
  bookingRequestId: number;
  initialBookingRequest?: BookingRequest | null;
  onMessageSent?: () => void;
  onQuoteSent?: () => void;
  serviceId?: number;
  artistName?: string;
  clientName?: string;
  clientId?: number;
  artistId?: number;
  artistAvatarUrl?: string | null;
  clientAvatarUrl?: string | null;
  isSystemTyping?: boolean;
  serviceName?: string;
  initialNotes?: string | null;
  onBookingDetailsParsed?: (details: ParsedBookingDetails) => void;
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
  onBookingConfirmedChange?: (isConfirmed: boolean, booking: Booking | null) => void;
  onPaymentStatusChange?: (
    status: string | null,
    amount: number | null,
    receiptUrl: string | null
  ) => void;
  onShowReviewModal?: (show: boolean) => void;
  onOpenDetailsPanel?: () => void;
  artistCancellationPolicy?: string | null;
  allowInstantBooking?: boolean;
  instantBookingPrice?: number;
  isDetailsPanelOpen?: boolean;
  /** Disable the chat composer for system-only threads (e.g., Booka updates). */
  disableComposer?: boolean;
  isActive?: boolean;
  /** Header presence/status updater for parent wrapper */
  onPresenceUpdate?: (status: { online: boolean; lastSeenMs: number | null; label: string }) => void;
}

// SVG
const DoubleCheckmarkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12.75 12.75L15 15 18.75 9.75" />
  </svg>
);

// ===== Component ==============================================================
const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(function MessageThread(
  {
    bookingRequestId,
    onMessageSent,
    onQuoteSent,
    serviceId,
    artistName = 'Service Provider',
    clientName = 'Client',
    clientAvatarUrl = null,
    clientId: propClientId,
    artistId: propArtistId,
    artistAvatarUrl = null,
    isSystemTyping = false,
    serviceName,
    initialNotes = null,
    onBookingDetailsParsed,
    initialBaseFee,
    initialTravelCost,
    initialSoundNeeded,
    onBookingConfirmedChange,
    onPaymentStatusChange,
    onShowReviewModal,
    onOpenDetailsPanel,
    artistCancellationPolicy,
    allowInstantBooking,
    instantBookingPrice,
    isDetailsPanelOpen = false,
    disableComposer = false,
    isActive = true,
    initialBookingRequest = null,
    onPresenceUpdate,
  }: MessageThreadProps,
  ref,
) {
  const { user } = useAuth();
  const myUserId = useMemo(() => Number(user?.id ?? 0), [user?.id]);
  const router = useRouter();
  const isActiveThread = isActive !== false;
  const hasInitialBookingRequest = useMemo(
    () => Boolean(initialBookingRequest && initialBookingRequest.id === bookingRequestId),
    [initialBookingRequest, bookingRequestId],
  );
  const [bookingRequestHydration, setBookingRequestHydration] = useState<'idle' | 'loading' | 'success' | 'error'>(
    hasInitialBookingRequest ? 'success' : 'idle',
  );
  const threadStoreEnabled = useMemo(() => isThreadStoreEnabled(), []);
  const transport = useTransportState();

  // ---- State
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const { quotesById: quotes, setQuote, ensureQuotesLoaded } = useQuotes(bookingRequestId);
  const [loading, setLoading] = useState(true);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
  const [bookingRequest, setBookingRequest] = useState<BookingRequest | null>(initialBookingRequest ?? null);
  const [bookingRequestVersion, setBookingRequestVersion] = useState(0);
  const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | undefined>();
  const [threadError, setThreadError] = useState<string | null>(null);
  const [wsFailed, setWsFailed] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [uploadingProgress, setUploadingProgress] = useState(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadProgressById, setUploadProgressById] = useState<Record<number, number>>({});
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [textareaLineHeight, setTextareaLineHeight] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetailsCard, setShowDetailsCard] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{ status: string | null; amount: number | null; receiptUrl: string | null }>({ status: null, amount: null, receiptUrl: null });
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [imageModalIndex, setImageModalIndex] = useState<number | null>(null);
  const [filePreviewSrc, setFilePreviewSrc] = useState<string | null>(null);
  const [previewAudioDuration, setPreviewAudioDuration] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [supplierInviteAction, setSupplierInviteAction] = useState<SupplierInviteActionState>(null);
  const [serviceProviderByServiceId, setServiceProviderByServiceId] = useState<Record<number, number>>({});
  const isSendingRef = useRef(false);
  // Stable per-message image src to prevent reloading/flicker on re-render
  const [imageSrcById, setImageSrcById] = useState<Record<number, string>>({});

  // Revoke object URLs on a short delay to avoid races where the DOM
  // still tries to paint a <img>/<audio> using a blob: URL we just revoked.
  const revokeObjectUrlSoon = useCallback((u: string | null | undefined) => {
    if (!u || typeof u !== 'string' || !u.startsWith('blob:')) return;
    try {
      const schedule = (cb: () => void) => {
        // Prefer requestIdleCallback if available; fallback to a short timeout
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: any) => number);
        if (typeof ric === 'function') ric(() => cb());
        else setTimeout(() => cb(), 200);
      };
      schedule(() => {
        try { URL.revokeObjectURL(u); } catch {}
      });
    } catch {}
  }, []);

  useEffect(() => {
    setBookingRequestHydration(hasInitialBookingRequest ? 'success' : 'idle');
  }, [hasInitialBookingRequest]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Virtualization always enabled

  // ---- Offline queue
  const { enqueue: enqueueMessage } = useOfflineQueue<{
    tempId: number;
    payload: MessageCreate;
  }>('offlineSendQueue', async ({ tempId, payload }) => {
    const res = await postMessageToBookingRequest(bookingRequestId, payload);
    const delivered = { ...normalizeMessage(res.data), status: 'sent' as const } as ThreadMessage;
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === tempId ? delivered : m));
      writeCachedMessages(bookingRequestId, next);
      return next;
    });
  });

  useEffect(() => {
    serviceProviderByServiceIdRef.current = serviceProviderByServiceId;
  }, [serviceProviderByServiceId]);

  useEffect(() => {
    clearedUnreadMessageIdsRef.current = new Set();
  }, [bookingRequestId]);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length) {
      let latestServerId: number | null = null;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const idCandidate = Number(messages[i]?.id);
        if (Number.isFinite(idCandidate) && idCandidate > 0) {
          latestServerId = idCandidate;
          break;
        }
      }
      if (latestServerId !== null) {
        lastMessageIdRef.current[bookingRequestId] = latestServerId;
      } else {
        delete lastMessageIdRef.current[bookingRequestId];
      }
    } else {
      delete lastMessageIdRef.current[bookingRequestId];
    }
  }, [messages, bookingRequestId]);


  const ensureServiceProviderForService = useCallback((serviceId: number) => {
    if (!serviceId || Number.isNaN(serviceId)) return;
    if (serviceProviderByServiceIdRef.current[serviceId]) return;
    if (pendingServiceFetchesRef.current.has(serviceId)) return;

    const promise = getService(serviceId)
      .then((res) => {
        const data = res?.data as any;
        const candidates = [
          data?.service_provider_id,
          data?.service_provider?.id,
          data?.artist_id,
          data?.artist?.id,
        ];
        const providerId = candidates.map((v) => Number(v)).find((v) => Number.isFinite(v) && v > 0);
        if (providerId) {
          setServiceProviderByServiceId((prev) => {
            if (prev[serviceId] === providerId) return prev;
            return { ...prev, [serviceId]: providerId };
          });
        }
      })
      .catch((err) => {
        if (typeof window !== 'undefined' && localStorage.getItem('CHAT_DEBUG') === '1') {
          try { console.warn('Failed to resolve service provider for service', serviceId, err); } catch {}
        }
      })
      .finally(() => {
        pendingServiceFetchesRef.current.delete(serviceId);
      });

    pendingServiceFetchesRef.current.set(serviceId, promise);
  }, [setServiceProviderByServiceId]);

  // ---- Refs
  // Removed non-virtual container refs
  const virtualizationHostRef = useRef<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<any>(null);
  const [virtuosoViewportHeight, setVirtuosoViewportHeight] = useState(0);
  const distanceFromBottomRef = useRef<number>(0);
  const prevScrollHeightRef = useRef<number>(0);
  const prevComposerHeightRef = useRef<number>(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const initialScrolledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const readReceiptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadedRef = useRef(false); // gate WS until first REST load
  const touchStartYRef = useRef(0);
  const stabilizingRef = useRef(true);
  const stabilizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInFlightRef = useRef(false);
  const refetchRequestedRef = useRef<null | FetchMessagesOptions>(null);
  const missingThreadRef = useRef(false);
  const activeThreadRef = useRef<number | null>(null);
  // Buffer for WS messages that arrive before initial REST load completes
  const wsBufferRef = useRef<ThreadMessage[]>([]);
  const lastFetchAtRef = useRef<number>(0);
  const serviceProviderByServiceIdRef = useRef<Record<number, number>>({});
  const pendingServiceFetchesRef = useRef<Map<number, Promise<void>>>(new Map());
  const clearedUnreadMessageIdsRef = useRef<Set<number>>(new Set());
  const messagesRef = useRef<ThreadMessage[]>([]);
  const loadedThreadsRef = useRef<Set<number>>(new Set());
  const lastMessageIdRef = useRef<Record<number, number>>({});
  const hydrationStartRef = useRef<number>(0);
  const hydrationThreadRef = useRef<number | null>(null);
  const hydrationSourceRef = useRef<'session' | 'indexeddb' | 'network' | null>(null);
  const cacheEventSentRef = useRef(false);
  const firstPaintSentRef = useRef(false);
  const readySentRef = useRef(false);
  const scrollSentRef = useRef(false);

  const perfNow = () => {
    try {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
    } catch {}
    return Date.now();
  };

  const emitStage = useCallback(
    (
      stage: 'first_paint' | 'ready' | 'scroll_restored' | 'cache_hit' | 'cache_miss',
      cacheType: string | null = hydrationSourceRef.current,
    ) => {
      if (!bookingRequestId) return;
      if (hydrationThreadRef.current !== null && hydrationThreadRef.current !== bookingRequestId) return;
      const start = hydrationStartRef.current || perfNow();
      const duration = Math.max(0, perfNow() - start);
      trackHydrationEvent(
        emissionPayload({
          threadId: bookingRequestId,
          durationMs: duration,
          cacheType: cacheType ?? hydrationSourceRef.current ?? null,
          stage,
        }),
      );
    },
    [bookingRequestId],
  );

  // Local ephemeral features
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const [reactions, setReactions] = useState<Record<number, Record<string, number>>>({});
  const [myReactions, setMyReactions] = useState<Record<number, Set<string>>>({});
  const myReactionsRef = useRef<Record<number, Set<string>>>({});
  useEffect(() => { myReactionsRef.current = myReactions; }, [myReactions]);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<number | null>(null);
  const reactionPickerRefDesktop = useRef<HTMLDivElement | null>(null);
  const reactionPickerRefMobile = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [imageMenuFor, setImageMenuFor] = useState<number | null>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);
  // Simple responsive helper (reactive)
  const [isMobile, setIsMobile] = useState(false);
  // No global click-away closers: keep interactions simple and explicit.
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const mobileOverlayOpenedAtRef = useRef<number>(0);
  // Track bottom anchoring from Virtuoso callbacks
  const atBottomRef = useRef<boolean>(true);
  const latestIndexRef = useRef<number>(0);

  // Unified guard for read receipts: active thread, visible tab, anchored to bottom
  const canMarkReadNow = useCallback((): boolean => {
    try {
      if (!isActiveThread) return false;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      if (atBottomRef.current !== true) return false;
      return true;
    } catch {
      return false;
    }
  }, [isActiveThread]);

  // When mobile long-press overlay is open, ensure composer does not focus/type
  const isMobileOverlayOpen = isMobile && actionMenuFor !== null;
  useEffect(() => {
    if (isMobileOverlayOpen) {
      try { textareaRef.current?.blur(); } catch {}
    }
  }, [isMobileOverlayOpen]);
  // Long-press (mobile) to open actions menu
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const longPressMsgIdRef = useRef<number | null>(null);
  const longPressStartTimeRef = useRef<number>(0);
  const [copiedFor, setCopiedFor] = useState<number | null>(null);
  const [highlightFor, setHighlightFor] = useState<number | null>(null);

  // Smooth-scroll to a message by id and briefly highlight it
  const scrollToMessage = useCallback((mid: number) => {
    const el = typeof document !== 'undefined' ? document.getElementById(`msg-${mid}`) : null;
    if (!el) return;
    try {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth' });
    }
    setHighlightFor(mid);
    setTimeout(() => {
      setHighlightFor((v) => (v === mid ? null : v));
    }, 1500);
  }, []);

  // Close pickers/menus when clicking outside (use click, not mousedown)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReactionPickerFor(null);
        setActionMenuFor(null);
        setImageMenuFor(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const startLongPress = useCallback((msgId: number, e: React.TouchEvent) => {
    try {
      const t = e.touches?.[0];
      if (!t) return;
      longPressPosRef.current = { x: t.clientX, y: t.clientY };
      longPressFiredRef.current = false;
      longPressMsgIdRef.current = msgId;
      longPressStartTimeRef.current = Date.now();
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        setReactionPickerFor(null);
        setImageMenuFor(null);
        setActionMenuFor(msgId);
        // Also prime reactions for this message so the picker can render in modal (mobile)
        setReactionPickerFor(msgId);
        mobileOverlayOpenedAtRef.current = Date.now();
        try { (navigator as any)?.vibrate?.(10); } catch {}
      }, 250);
    } catch {}
  }, []);

  const moveLongPress = useCallback((e: React.TouchEvent) => {
    const start = longPressPosRef.current;
    const t = e.touches?.[0];
    if (!start || !t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endLongPress = useCallback((e?: React.TouchEvent) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    // If long-press did not fire, treat as single tap on mobile for reply jump
    if (!longPressFiredRef.current) {
      try {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        const msgId = longPressMsgIdRef.current;
        if (!isMobile || !msgId) return;
        // Ignore taps on interactive child elements
        const target = e?.target as HTMLElement | undefined;
        let el: HTMLElement | null | undefined = target;
        let interactive = false;
        while (el && el !== document.body) {
          const tag = (el.tagName || '').toUpperCase();
          if (tag === 'BUTTON' || tag === 'A' || tag === 'IMG' || tag === 'AUDIO' || el.getAttribute('role') === 'button') {
            interactive = true; break;
          }
          el = el.parentElement as HTMLElement | null;
        }
        if (interactive) return;
        const m = messages.find((mm) => mm.id === msgId);
        if (m?.reply_to_message_id) {
          e?.preventDefault();
          e?.stopPropagation();
          scrollToMessage(m.reply_to_message_id);
        }
      } catch {}
    }
  }, [messages, scrollToMessage]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // ---- Presence
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  // Presence (realtime + fallback)
  const [presenceByUser, setPresenceByUser] = useState<Record<number, 'online' | 'away' | 'offline'>>({});
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<number, number>>({});
  // User activity gate: only enable realtime/polling and show presence once there is activity
  const [hasUserActivity, setHasUserActivity] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(0);
  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
      if (!hasUserActivity) setHasUserActivity(true);
    };
    const opts: AddEventListenerOptions | boolean = { passive: true } as any;
    try { window.addEventListener('scroll', markActive, opts); } catch {}
    document.addEventListener('mousedown', markActive, true);
    document.addEventListener('keydown', markActive, true);
    try { document.addEventListener('touchstart', markActive, { passive: true } as any); } catch {}
    return () => {
      try { window.removeEventListener('scroll', markActive, opts as any); } catch {}
      document.removeEventListener('mousedown', markActive, true);
      document.removeEventListener('keydown', markActive, true);
      try { document.removeEventListener('touchstart', markActive as any, { passive: true } as any); } catch {}
    };
  }, [hasUserActivity]);

  // Activity-driven presence refresh will be wired after fetchMessages is defined

  // ---- Derived
  const computedServiceName = serviceName ?? bookingDetails?.service?.title;
  const serviceTypeFromThread = bookingRequest?.service?.service_type || bookingDetails?.service?.service_type || '';
  const isPersonalizedVideo = String(serviceTypeFromThread).toLowerCase() === 'personalized video'.toLowerCase();
  const currentClientId =
    propClientId ||
    bookingDetails?.client_id ||
    messages.find((m) => m.sender_type === 'client')?.sender_id ||
    0;
  const currentArtistId = propArtistId || bookingDetails?.artist_id || myUserId;

  const [baseFee, setBaseFee] = useState(initialBaseFee ?? 0);
  const [travelFee, setTravelFee] = useState(initialTravelCost ?? 0);
  const [initialSound, setInitialSound] = useState<boolean | undefined>(initialSoundNeeded);
  const [initialSoundCost, setInitialSoundCost] = useState<number | undefined>(undefined);
  const [calculationParams, setCalculationParams] = useState<
    | {
        base_fee: number;
        distance_km: number;
        service_id: number;
        event_city: string;
        accommodation_cost?: number;
      }
    | undefined
  >(undefined);

  const defaultProviderId = useMemo(() => {
    const candidates = [
      (bookingRequest?.service as any)?.service_provider_id,
      (bookingRequest?.service as any)?.service_provider?.id,
      bookingRequest?.service_provider_id,
      bookingRequest?.artist_id,
    ];
    for (const candidate of candidates) {
      const num = Number(candidate);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return null;
  }, [bookingRequest]);

  const resolveListingViewUrl = useCallback(
    (raw?: string | null) =>
      normalizeServiceProviderViewUrl(raw, {
        serviceProviderByServiceId,
        ensureServiceProvider: ensureServiceProviderForService,
        defaultProviderId,
      }),
    [serviceProviderByServiceId, ensureServiceProviderForService, defaultProviderId],
  );

  const eventDetails = useMemo(() => {
    // Prefer parsed date; otherwise fall back to proposed date from the booking request/booking
    const rawDate = parsedBookingDetails?.date
      ?? (bookingRequest as any)?.proposed_datetime_1
      ?? (bookingRequest as any)?.proposed_datetime_2
      ?? (bookingDetails as any)?.start_time
      ?? undefined;
    let dateLabel: string | undefined = undefined;
    if (rawDate) {
      const d = new Date(rawDate);
      dateLabel = isValid(d) ? format(d, 'PPP') : String(rawDate);
    }

    // Location name/address fallbacks
    const tb: any = (bookingRequest as any)?.travel_breakdown || {};
    const locName = (parsedBookingDetails as any)?.location_name
      || tb.venue_name
      || tb.place_name
      || tb.location_name
      || undefined;
    const locAddr = (parsedBookingDetails as any)?.location
      || tb.address
      || tb.event_city
      || tb.event_town
      || (bookingRequest as any)?.service?.service_provider?.location
      || undefined;

    return {
      from: clientName || 'Client',
      receivedAt: format(new Date(), 'PPP'),
      event: (parsedBookingDetails as any)?.eventType || (parsedBookingDetails as any)?.event_type,
      date: dateLabel,
      guests: (parsedBookingDetails as any)?.guests,
      venue: (parsedBookingDetails as any)?.venueType,
      notes: (parsedBookingDetails as any)?.notes,
      locationName: locName,
      locationAddress: locAddr,
    } as any;
  }, [clientName, parsedBookingDetails, bookingRequest, bookingDetails]);

  const bookingSummaryReady = useMemo(
    () =>
      Boolean(
        (bookingRequest && bookingRequest.id === bookingRequestId) ||
        (initialBookingRequest && initialBookingRequest.id === bookingRequestId) ||
        bookingDetails,
      ),
    [bookingDetails, bookingRequest, bookingRequestId, initialBookingRequest],
  );
  const showBookingSummarySkeleton = !bookingSummaryReady;

  // List of image URLs in this thread (for modal navigation)
  const imageMessages = useMemo(() => messages.filter((m) => isImageAttachment(m.attachment_url || undefined)), [messages]);
  const imageUrls = useMemo(() => imageMessages.map((m) => toApiAttachmentsUrl(m.attachment_url!)), [imageMessages]);
  const openImageModalForUrl = useCallback((url: string) => {
    const idx = imageUrls.indexOf(url);
    setImageModalIndex(idx >= 0 ? idx : null);
  }, [imageUrls]);

  const { isClientView: isClientViewFlag, isPaid: isPaidFlag } = useBookingView(user, bookingDetails, paymentInfo, bookingConfirmed);

  // No manual retry UI; quotes load with messages fetch.

  // When the thread is for admin moderation (e.g., listing approved/rejected),
  // do not show booking-request specific UI like the inline quote editor.
  const isModerationThread = useMemo(() => {
    const firstSystem = messages.find((m) => String(m.message_type).toUpperCase() === 'SYSTEM');
    const key = (firstSystem as any)?.system_key ? String((firstSystem as any).system_key).toLowerCase() : '';
    const content = String((firstSystem as any)?.content || '').toLowerCase();
    if (key.startsWith('listing_approved_v1') || key.startsWith('listing_rejected_v1')) return true;
    if (content.startsWith('listing approved:') || content.startsWith('listing rejected:')) return true;
    return false;
  }, [messages]);

  // ---- Focus textarea on mount & thread switch
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { textareaRef.current?.focus(); }, [bookingRequestId]);

  // ---- Portal ready
  useEffect(() => { setIsPortalReady(true); }, []);
  // Cleanup on unmount: abort uploads, clear timers, revoke URLs
  useEffect(() => {
    return () => {
      try { uploadAbortRef.current?.abort(); } catch {}
      try { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); } catch {}
      try { if (readReceiptTimeoutRef.current) clearTimeout(readReceiptTimeoutRef.current); } catch {}
      try { if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current); } catch {}
      try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
      try { if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl); } catch {}
      try { mediaRecorderRef.current?.stop(); } catch {}
    };
  }, []);

  // (Quote drawer removed)

  // ---- Prefill quote form (SP side)
  const hasSentQuote = useMemo(() => messages.some((m) => Number(m.quote_id) > 0), [messages]);
  useEffect(() => {
    if (!hasInitialBookingRequest) return;
    setBookingRequest(initialBookingRequest);
    setBookingRequestHydration('success');
  }, [hasInitialBookingRequest, initialBookingRequest]);
  useEffect(() => {
    const br = bookingRequest;
    if (!br) return;
    const tb = (br.travel_breakdown || {}) as any;
    const svcPriceRaw = br.service?.price;
    const svcPrice = Number(svcPriceRaw);
    if (Number.isFinite(svcPrice)) {
      setBaseFee(svcPrice);
    } else if (typeof initialBaseFee === 'number') {
      setBaseFee(initialBaseFee);
    }
    const travelCostRaw = br.travel_cost;
    const travelCost = Number(travelCostRaw);
    if (Number.isFinite(travelCost)) {
      setTravelFee(travelCost);
    } else if (typeof initialTravelCost === 'number') {
      setTravelFee(initialTravelCost);
    }
    if (typeof initialSound === 'undefined') {
      setInitialSound(Boolean(tb.sound_required));
    }
    const soundProv = (br.service as any)?.details?.sound_provisioning;
    if (tb.sound_required && soundProv?.mode === 'artist_provides_variable') {
      const drive = Number(soundProv.price_driving_sound_zar || soundProv.price_driving_sound || 0);
      const fly = Number(soundProv.price_flying_sound_zar || soundProv.price_flying_sound || 0);
      const mode = tb.travel_mode || tb.mode;
      setInitialSoundCost(mode === 'fly' ? fly : drive);
    } else if (tb.sound_required && tb.sound_cost) {
      const cost = Number(tb.sound_cost);
      setInitialSoundCost(Number.isFinite(cost) ? cost : undefined);
    } else {
      setInitialSoundCost(undefined);
    }
    const distance = Number(tb.distance_km ?? tb.distanceKm);
    const eventCity = tb.event_city || parsedBookingDetails?.location || '';
    const svcId = br.service_id || serviceId || 0;
    if (Number.isFinite(distance) && distance > 0 && eventCity && svcId && tb.sound_required) {
      const params: {
        base_fee: number;
        distance_km: number;
        service_id: number;
        event_city: string;
        accommodation_cost?: number;
      } = {
        base_fee: Number.isFinite(svcPrice) ? svcPrice : Number(initialBaseFee ?? 0),
        distance_km: distance,
        service_id: svcId,
        event_city: eventCity,
      };
      if (tb.accommodation_cost) params.accommodation_cost = Number(tb.accommodation_cost);
      setCalculationParams(params);
    } else {
      setCalculationParams(undefined);
    }
  }, [
    bookingRequest,
    initialBaseFee,
    initialTravelCost,
    initialSound,
    parsedBookingDetails,
    serviceId,
  ]);

  const refreshBookingRequest = useCallback(() => {
    setBookingRequestHydration('idle');
    setBookingRequestVersion((v) => v + 1);
  }, []);


  // ---- Typing indicator label
  const typingIndicator = useMemo(() => {
    const names = typingUsers.map((id) =>
      id === currentArtistId ? artistName : id === currentClientId ? clientName : 'Participant',
    );
    if (isSystemTyping) names.push('System');
    if (names.length === 0) return null;
    const verb = names.length > 1 ? 'are' : 'is';
    return `${names.join(' and ')} ${verb} typing...`;
  }, [typingUsers, isSystemTyping, currentArtistId, currentClientId, artistName, clientName]);

  // ---- Textarea metrics
  useEffect(() => {
    if (textareaRef.current && textareaLineHeight === 0) {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.height = 'auto';
      tempDiv.style.width = '200px';
      const computedStyle = getComputedStyle(textareaRef.current);
      tempDiv.style.fontFamily = computedStyle.fontFamily;
      tempDiv.style.fontSize = computedStyle.fontSize;
      tempDiv.style.lineHeight = computedStyle.lineHeight;
      tempDiv.innerText = 'M';
      document.body.appendChild(tempDiv);
      setTextareaLineHeight(tempDiv.clientHeight);
      document.body.removeChild(tempDiv);
    }
  }, [textareaRef, textareaLineHeight]);

  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || textareaLineHeight === 0) return;
    ta.style.height = 'auto';

    const style = getComputedStyle(ta);
    const padT = parseFloat(style.paddingTop);
    const bdrT = parseFloat(style.borderTopWidth);
    const bdrB = parseFloat(style.borderBottomWidth);
    const maxH = textareaLineHeight * MAX_TEXTAREA_LINES + padT + bdrT + bdrB;
    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${newH}px`;
    // Keep the bottom anchored as the textarea grows (up to MAX_TEXTAREA_LINES)
    try {
      if (atBottomRef.current === true && virtuosoRef.current) {
        const idx = latestIndexRef.current;
        const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
        if (raf) raf(() => { try { virtuosoRef.current?.scrollToIndex?.({ index: idx, align: 'end', behavior: 'auto' }); } catch {} });
        else virtuosoRef.current?.scrollToIndex?.({ index: idx, align: 'end', behavior: 'auto' });
      }
    } catch {}
  }, [textareaLineHeight]);
  useEffect(() => { autoResizeTextarea(); }, [newMessageContent, autoResizeTextarea]);

  // ---- Dismiss emoji picker if clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const firstUnreadIndex = useMemo(
    () => messages.findIndex((msg) => msg.sender_id !== myUserId && !msg.is_read),
    [messages, myUserId],
  );

  // ---- Quote hydration (used by REST & WS)
  // Dedupe in-flight quote loads and add light rate-limiting for missing quotes
  // Quote loading is handled by useQuotes; acceptance side-effects occur on explicit accept

  const markIncomingAsRead = useCallback(
    (subset: ThreadMessage[], source: 'fetch' | 'realtime' | 'cache' | 'hydrate') => {
      if (!subset.length || myUserId <= 0) return;
      if (!canMarkReadNow()) return;
      const inbound = subset.filter((m) => m.sender_id !== myUserId && !m.is_read);
      if (inbound.length === 0) return;
      const fresh = inbound.filter((m) => !clearedUnreadMessageIdsRef.current.has(m.id));
      if (fresh.length === 0) return;
      fresh.forEach((msg) => clearedUnreadMessageIdsRef.current.add(msg.id));
      const freshIds = new Set(fresh.map((msg) => msg.id));
      setMessages((prev) => {
        let mutated = false;
        const next = prev.map((msg) => {
          if (freshIds.has(msg.id) && !msg.is_read) {
            mutated = true;
            return { ...msg, is_read: true };
          }
          return msg;
        });
        if (mutated) {
          try { writeCachedMessages(bookingRequestId, next); } catch {}
          return next;
        }
        return prev;
      });
      // Defer unread decrement until server ack (online case). If offline/queued, skip.
      const p = runWithTransport(
        `messages-read:${bookingRequestId}`,
        async () => { await markMessagesRead(bookingRequestId); },
        { metadata: { type: 'markMessagesRead', threadId: bookingRequestId } },
      ) as Promise<void> | void;
      if (p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>)
          .then(() => {
            try {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('inbox:unread', {
                    detail: { delta: -freshIds.size, threadId: bookingRequestId },
                  }),
                );
                // Cross-tab: persist last seen id for this thread and let other tabs reconcile
                const maxId = Math.max(...Array.from(freshIds));
                try { localStorage.setItem(`thread:last_seen:${bookingRequestId}`, String(maxId)); } catch {}
              }
            } catch {}
            // Optionally also mark thread read after messages read succeeds
            runWithTransport(
              `thread-read:${bookingRequestId}`,
              async () => { await markThreadRead(bookingRequestId); },
              { metadata: { type: 'markThreadRead', threadId: bookingRequestId } },
            );
            const reasonLabel = source ? `read:${source}` : 'read';
            emitThreadsUpdated({ source: 'thread', threadId: bookingRequestId, reason: reasonLabel });
          })
          .catch(() => {
            // no-op: we didn't decrement yet, so nothing to rollback
          });
      }
    },
    [myUserId, bookingRequestId, setMessages, markMessagesRead, markThreadRead, writeCachedMessages, emitThreadsUpdated, runWithTransport, canMarkReadNow],
  );

  // Debounced read scheduling used by REST/cache/hydrate paths to mirror realtime
  const scheduleMarkRead = useCallback((subset: ThreadMessage[], source: 'fetch' | 'cache' | 'hydrate') => {
    if (!subset.length) return;
    if (readReceiptTimeoutRef.current) clearTimeout(readReceiptTimeoutRef.current);
    readReceiptTimeoutRef.current = setTimeout(() => {
      if (!canMarkReadNow()) return;
      markIncomingAsRead(subset, source);
    }, 700);
  }, [markIncomingAsRead, canMarkReadNow]);

  // Quote hydration is handled synchronously during fetchMessages.

  // Always ensure quotes are hydrated whenever the message list changes.
  // This covers edge-cases where messages come from cache/WS buffers or
  // other paths that didn't explicitly call hydrateQuotesForMessages.
  // Keep quote hydration simple: handled synchronously in fetchMessages.

  useEffect(() => {
    if (!isActiveThread || myUserId <= 0 || messages.length === 0) return;
    scheduleMarkRead(messages, 'hydrate');
  }, [isActiveThread, myUserId, messages, scheduleMarkRead]);

  // ---- Composer height for padding
  const [composerHeight, setComposerHeight] = useState(0);
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const update = () => setComposerHeight(el.offsetHeight || 0);
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } catch {
      window.addEventListener('resize', update);
    }
    return () => {
      if (ro && el) ro.unobserve(el);
      window.removeEventListener('resize', update);
    };
  }, [composerRef]);

  // (moved anchor-on-composer-change effect to after groupedMessages definition)

  useLayoutEffect(() => {
    const host = virtualizationHostRef.current;
    if (!host) return;

    const update = () => {
      const next = host.clientHeight || 0;
      setVirtuosoViewportHeight((prev) => {
        if (Math.abs(prev - next) < 1) return prev;
        return next;
      });
    };
    update();

    let frame: number | null = null;
    let ro: ResizeObserver | null = null;
    const hasWindow = typeof window !== 'undefined';
    try {
      ro = new ResizeObserver(() => {
        if (frame !== null && hasWindow) {
          window.cancelAnimationFrame(frame);
        }
        frame = hasWindow ? window.requestAnimationFrame(update) : null;
      });
      ro.observe(host);
    } catch {
      if (hasWindow) window.addEventListener('resize', update);
    }

    return () => {
      if (frame !== null && hasWindow) {
        window.cancelAnimationFrame(frame);
      }
      if (ro && host) ro.unobserve(host);
      if (hasWindow) window.removeEventListener('resize', update);
    };
  }, [bookingRequestId, composerHeight]);

  // ---- Fetch messages (initial + refresh)
  const fetchMessages = useCallback(
    async (options: FetchMessagesOptions = {}) => {
      if (missingThreadRef.current) return;
      if (fetchInFlightRef.current) {
        // Queue a refetch to run immediately after the current one completes
        // so notification/immediate events don't get dropped while a poll is running.
        refetchRequestedRef.current = { ...options };
        return;
      }
      if (!options.force && !isActiveThread) return;
      fetchInFlightRef.current = true;

      const rawLastId = lastMessageIdRef.current[bookingRequestId];
      let lastId = Number(rawLastId);
      if (!Number.isFinite(lastId) || lastId <= 0) {
        lastId = NaN;
        delete lastMessageIdRef.current[bookingRequestId];
      }
      const hasValidCursor = Number.isFinite(lastId) && lastId > 0;
      let mode: 'initial' | 'incremental' =
        options.mode ?? (messagesRef.current.length > 0 ? 'incremental' : 'initial');
      if (mode === 'incremental' && !hasValidCursor) mode = 'initial';
      if (mode === 'initial' && !initialLoadedRef.current) setLoading(true);

      const params: MessageListParams = {
        limit: (options.limit != null
          ? options.limit
          : (mode === 'initial' ? 100 : 50)),
      };
      let requestedDelta = false;
      if (mode === 'incremental' && hasValidCursor) {
        const safeLastId = Number(lastId);
        if (Number.isFinite(safeLastId) && safeLastId > 0) {
          params.after_id = safeLastId;
          params.mode = 'delta';
          requestedDelta = true;
        } else {
          params.mode = 'full';
        }
      } else {
        params.mode = 'full';
      }

      const metadata = {
        type: 'thread-fetch',
        threadId: bookingRequestId,
        requestedMode: mode,
        mode: params.mode,
        reason: options.reason,
      };

      const queueRetry = (reason: 'offline' | 'transient') => {
        runWithTransport(
          `thread-fetch:${bookingRequestId}`,
          () =>
            fetchMessages({
              ...options,
              force: true,
            }),
          { metadata: { ...metadata, retryReason: reason } },
        );
      };

      if (!transport.online && !options.force) {
        setLoading(false);
        setThreadError(null);
        fetchInFlightRef.current = false;
        queueRetry('offline');
        return;
      }

      try {
        const res = await getMessagesForBookingRequest(bookingRequestId, params);
        if (!options.force && activeThreadRef.current !== bookingRequestId) {
          return;
        }

        const envelope = res.data || { items: [] };
        const rows = Array.isArray((envelope as any).items) ? (envelope as any).items : [];
        if (mode === 'incremental' && rows.length === 0) {
          // Some backends may ignore after_id or fail to compute deltas; fall back to a small
          // full fetch so we don't miss recent messages. This ensures the thread stays in sync
          // with the conversation list even when realtime is unavailable.
          setThreadError(null);
          setLoading(false);
          initialLoadedRef.current = true;
          loadedThreadsRef.current.add(bookingRequestId);
          try {
            await getMessagesForBookingRequest(bookingRequestId, { limit: options.limit ?? 100, mode: 'full' as any });
          } catch {}
          // Trigger a forced full load via our own function so normalization/merge paths run
          try { void fetchMessages({ mode: 'initial', force: true, reason: 'delta-empty-fallback', limit: options.limit ?? 100, behavior: 'merge_update' }); } catch {}
          return;
        }

        const { delta_cursor: rawCursor, mode: responseMode } = (envelope as any) ?? {};
        let cursorValue: number | null = null;
        if (typeof rawCursor !== 'undefined' && rawCursor !== null) {
          const parsedCursor = Number(rawCursor);
          if (Number.isFinite(parsedCursor) && parsedCursor > 0) {
            cursorValue = parsedCursor;
          }
        }

        let parsedDetails: ParsedBookingDetails | undefined;
        const normalized: ThreadMessage[] = [];
        for (const raw of rows as any[]) {
          const msg = normalizeMessage(raw);
          if (
            normalizeType(msg.message_type) === 'SYSTEM' &&
            typeof msg.content === 'string' &&
            msg.content.startsWith(BOOKING_DETAILS_PREFIX)
          ) {
            parsedDetails = parseBookingDetailsFromMessage(msg.content);
            continue;
          }
          if (
            initialNotes &&
            normalizeType(msg.message_type) === 'USER' &&
            msg.content.trim() === initialNotes.trim()
          ) {
            continue;
          }
          normalized.push(msg);
        }

        try {
          const hasInquiry = normalized.some((m) => {
            try {
              const key = ((m as any).system_key || '').toString().toLowerCase();
              if (key === 'inquiry_sent_v1') return true;
              const raw = String((m as any).content || '');
              return raw.startsWith('{') && raw.includes('inquiry_sent_v1');
            } catch {
              return false;
            }
          });
          if (hasInquiry && typeof window !== 'undefined') {
            try { localStorage.setItem(`inquiry-thread-${bookingRequestId}`, '1'); } catch {}
            emitThreadsUpdated({ source: 'thread', threadId: bookingRequestId, immediate: true });
          }
        } catch {}

        if (!cursorValue && normalized.length > 0) {
          const lastNormalizedId = Number(normalized[normalized.length - 1]?.id);
          if (Number.isFinite(lastNormalizedId) && lastNormalizedId > 0) {
            cursorValue = lastNormalizedId;
          }
        }
        if (typeof cursorValue === 'number' && Number.isFinite(cursorValue) && cursorValue > 0) {
          lastMessageIdRef.current[bookingRequestId] = cursorValue;
        }

        if (
          requestedDelta &&
          responseMode &&
          responseMode !== 'delta' &&
          process.env.NODE_ENV === 'development'
        ) {
          try {
            console.debug('[thread] delta fallback', {
              requestId: bookingRequestId,
              requestedMode: 'delta',
              responseMode,
              cursorValue,
            });
          } catch {}
        }

        if (parsedDetails !== undefined) {
          setParsedBookingDetails(parsedDetails);
          if (parsedDetails && onBookingDetailsParsed) onBookingDetailsParsed(parsedDetails);
        }

        // Basic, synchronous quote hydration: fetch any referenced quotes
        // before updating messages so the quote card renders immediately.
        try {
          const quoteIds = Array.from(new Set(normalized
            .map((m) => Number(m.quote_id))
            .filter((qid) => Number.isFinite(qid) && qid > 0)));
          if (quoteIds.length) {
            await ensureQuotesLoaded(quoteIds);
          }
        } catch {}

        setMessages((prev) => {
          // Default behavior: replace on initial, merge on incremental
          const defaultReplace = mode === 'initial';
          // Never replace if we already hold messages (e.g., from WS) — prevents
          // brief disappearance when a slower REST fetch lags behind realtime.
          const shouldReplace = defaultReplace && prev.length === 0;
          const behavior = options.behavior || (shouldReplace ? 'replace' : 'merge_update');

          if (behavior === 'replace') {
            const base: ThreadMessage[] = defaultReplace ? [] : prev;
            const next = mergeMessages(base, normalized);
            try { writeCachedMessages(bookingRequestId, next); } catch {}
            return next;
          }

          // merge_update: only add new messages and update flags on existing ones
          // Build quick lookup for normalized subset
          const byId = new Map<number, ThreadMessage>();
          for (const m of normalized) byId.set(m.id, m);

          // 1) Add any new messages (not present in prev)
          let out = prev;
          const missing = normalized.filter((m) => !prev.some((p) => p.id === m.id));
          if (missing.length) {
            // Smooth swap: if a new message is mine and matches a pending optimistic one,
            // carry its client_key and remove the optimistic temp to avoid a flicker.
            const pendingMine = new Map<number, ThreadMessage>();
            for (const p of out) {
              if (p.sender_id === myUserId && (p.status === 'sending' || p.status === 'queued')) {
                pendingMine.set(p.id, p);
              }
            }
            const toAdd: ThreadMessage[] = [];
            const usedTemps = new Set<number>();
            for (const nm of missing) {
              if (nm.sender_id === myUserId && pendingMine.size) {
                // Match by content + reply target to identify the optimistic twin
                let matchId: number | null = null;
                pendingMine.forEach((opt, tid) => {
                  if (matchId != null) return;
                  const sameContent = String(opt.content || '') === String(nm.content || '');
                  const sameReply = (opt.reply_to_message_id || null) === (nm.reply_to_message_id || null);
                  if (sameContent && sameReply) { matchId = tid; }
                });
                if (matchId != null) {
                  const opt = pendingMine.get(matchId)!;
                  const withKey = { ...nm } as any;
                  if ((opt as any).client_key) withKey.client_key = (opt as any).client_key;
                  // Remove the optimistic temp from out and mark as used
                  out = out.filter((m) => m.id !== matchId);
                  usedTemps.add(matchId);
                  toAdd.push(withKey as ThreadMessage);
                  continue;
                }
              }
              toAdd.push(nm);
            }
            out = mergeMessages(out, toAdd);
          }

          // 2) Update read/reactions status for overlapping ids without remounting all
          let mutated = false;
          const next = out.map((msg) => {
            const nm = byId.get(msg.id);
            if (!nm) return msg;
            let changed = false;
            // Only update fields that affect receipts/reactions
            const updates: Partial<ThreadMessage> = {};
            if (msg.is_read !== nm.is_read) { updates.is_read = nm.is_read; changed = true; }
            // Delivery state approximation (from timestamps/flags)
            const msgState = toDeliveryState(msg);
            const nmState = toDeliveryState(nm);
            if (msgState !== nmState) { updates.status = nm.status ?? msg.status; changed = true; }
            // Reactions map
            const a = (msg.reactions || {});
            const b = (nm.reactions || {});
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b);
            const sameKeys = aKeys.length === bKeys.length && aKeys.every((k) => a[k] === (b as any)[k]);
            if (!sameKeys) { updates.reactions = nm.reactions || null; changed = true; }
            if (!changed) return msg;
            mutated = true;
            return { ...msg, ...updates };
          });
          if (mutated) {
            try { writeCachedMessages(bookingRequestId, next); } catch {}
            return next;
          }
          return out;
        });
        setThreadError(null);
        setLoading(false);
        hydrationSourceRef.current = hydrationSourceRef.current ?? 'network';
        if (!cacheEventSentRef.current) {
          emitStage('cache_miss', 'none');
          cacheEventSentRef.current = true;
        }
        if (!firstPaintSentRef.current) {
          emitStage('first_paint', hydrationSourceRef.current ?? 'network');
          firstPaintSentRef.current = true;
        }
        const wasGateClosed = !initialLoadedRef.current;
        initialLoadedRef.current = true;
        loadedThreadsRef.current.add(bookingRequestId);
        if (wasGateClosed) {
          try {
            if (wsBufferRef.current.length) {
              setMessages((prev) => {
                const next = mergeMessages(prev, wsBufferRef.current);
                writeCachedMessages(bookingRequestId, next);
                return next;
              });
              wsBufferRef.current = [];
            }
          } catch {}
        }

        scheduleMarkRead(normalized, 'fetch');

        try {
          const newReactions: Record<number, Record<string, number>> = {};
          const newMine: Record<number, Set<string>> = {};
          (normalized as any[]).forEach((m: any) => {
            if (m.reactions) newReactions[m.id] = m.reactions;
            if (m.my_reactions) newMine[m.id] = new Set<string>(m.my_reactions);
          });
          if (Object.keys(newReactions).length) setReactions((prev) => ({ ...prev, ...newReactions }));
          if (Object.keys(newMine).length) setMyReactions((prev) => ({ ...prev, ...newMine }));
        } catch {}
      } catch (err) {
        if (isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 404 || status === 403) {
            const isForbidden = status === 403;
            const hadMessages = (messagesRef.current?.length || 0) > 0;
            setThreadError(
              isForbidden
                ? 'You no longer have access to this conversation.'
                : 'This conversation is no longer available.',
            );
            setLoading(false);
            if (!hadMessages) {
              missingThreadRef.current = true;
              setMessages([]);
              loadedThreadsRef.current.delete(bookingRequestId);
              emitThreadsUpdated({
                source: 'thread',
                threadId: bookingRequestId,
                immediate: true,
                reason: isForbidden ? 'forbidden' : 'missing',
              });
              try {
                window.dispatchEvent(
                  new CustomEvent('thread:missing', { detail: { id: bookingRequestId } }),
                );
              } catch {}
            }
            return;
          }
          if (isTransientTransportError(err) || isOfflineError(err)) {
            setThreadError(null);
            setLoading(false);
            queueRetry(isOfflineError(err) ? 'offline' : 'transient');
            return;
          }
        } else if (isTransientTransportError(err) || isOfflineError(err)) {
          setThreadError(null);
          setLoading(false);
          queueRetry(isOfflineError(err) ? 'offline' : 'transient');
          return;
        }
        console.error('Failed to fetch messages:', err);
        setThreadError(`Failed to load messages. ${(err as Error).message || 'Please try again.'}`);
      } finally {
        stabilizingRef.current = true;
        if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
        stabilizeTimerRef.current = setTimeout(() => {
          stabilizingRef.current = false;
        }, 250);
        fetchInFlightRef.current = false;
        // Run any queued refetch immediately (debounced by single-flight above)
        const queued = refetchRequestedRef.current;
        refetchRequestedRef.current = null;
        if (queued) {
          try {
            const next = { mode: queued.mode ?? 'incremental', force: true, reason: queued.reason ?? 'queued-refetch' } as FetchMessagesOptions;
            void fetchMessages(next);
          } catch {}
        }
      }
    },
    [
      bookingRequestId,
      transport.online,
      myUserId,
      initialNotes,
      onBookingDetailsParsed,
      ensureQuotesLoaded,
      isActiveThread,
    ],
  );

  // Treat component mount and thread switch as activity; also kick a presence refresh fetch
  useEffect(() => {
    lastActivityRef.current = Date.now();
    if (!hasUserActivity) setHasUserActivity(true);
    // Small merge-update fetch to refresh last-seen immediately on mount
    void fetchMessages({ mode: 'initial', force: true, reason: 'activity-mount', limit: 100, behavior: 'merge_update' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // On thread switch, consider as activity and refresh presence/last-seen snapshot
    lastActivityRef.current = Date.now();
    if (!hasUserActivity) setHasUserActivity(true);
    void fetchMessages({ mode: 'initial', force: true, reason: 'activity-thread-switch', limit: 100, behavior: 'merge_update' });
  }, [bookingRequestId, hasUserActivity, fetchMessages]);

  // Consider tab becoming visible as user activity (e.g., navigating back to inbox)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        if (!hasUserActivity) setHasUserActivity(true);
        void fetchMessages({ mode: 'initial', force: true, reason: 'activity-visible', limit: 100, behavior: 'merge_update' });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [hasUserActivity, fetchMessages]);

  const respondToSupplierInvite = useCallback(
    async (msgId: number, decision: 'accept' | 'decline', program: string) => {
      if (supplierInviteAction) return;
      const programLabel = program || t('system.soundSupplierDefault', 'this Live Experience');
      const content =
        decision === 'accept'
          ? t('system.soundSupplierAcceptChat', 'Accepted preferred supplier invite for {program}.', { program: programLabel })
          : t('system.soundSupplierDeclineChat', 'Declined preferred supplier invite for {program}.', { program: programLabel });
      try {
        setSupplierInviteAction({ msgId, choice: decision });
        await postMessageToBookingRequest(bookingRequestId, { content } as MessageCreate);
        await fetchMessages({ mode: 'incremental', force: true, reason: 'supplier-invite' });
      } catch (err) {
        console.error('Failed to respond to supplier invite:', err);
        setThreadError(
          t('system.soundSupplierError', 'Could not send your response. Please try again or contact support.')
        );
      } finally {
        setSupplierInviteAction(null);
      }
    },
    [bookingRequestId, fetchMessages, supplierInviteAction, t],
  );
  useImperativeHandle(ref, () => ({ refreshMessages: fetchMessages }), [fetchMessages]);
  // When the global inbox emits a threads:updated (via notifications), refresh this thread too.
  useEffect(() => {
    const onThreadsUpdated = (event: Event) => {
      const now = Date.now();
      const detail = (event as CustomEvent<ThreadsUpdatedDetail>).detail || {};
      if (detail.threadId && detail.threadId !== bookingRequestId) return;
      if (detail.source === 'thread' && detail.reason === 'read' && detail.threadId === bookingRequestId) return;
      if (!isActiveThread) return;
      if (activeThreadRef.current !== bookingRequestId) return;
      // Honor immediate flag from notifications to bypass debounce and render quickly
      if (detail.immediate) {
        lastFetchAtRef.current = now;
        try { console.info('[thread] threads:updated immediate → full merge-update'); } catch {}
        void fetchMessages({ mode: 'initial', force: true, reason: detail.reason || 'threads:updated:immediate', limit: 100, behavior: 'merge_update' });
        return;
      }
      if (now - lastFetchAtRef.current < 800) return; // debounce
      lastFetchAtRef.current = now;
      try { console.info('[thread] threads:updated → full merge-update'); } catch {}
      void fetchMessages({ mode: 'initial', force: true, reason: detail.reason || 'threads:updated', limit: 100, behavior: 'merge_update' });
    };
    try { window.addEventListener('threads:updated', onThreadsUpdated as any); } catch {}
    return () => { try { window.removeEventListener('threads:updated', onThreadsUpdated as any); } catch {} };
  }, [bookingRequestId, fetchMessages, isActiveThread]);

  // Reset initial scrolled flag when switching threads
  useEffect(() => {
    initialScrolledRef.current = false;
    prevMessageCountRef.current = 0;
  }, [bookingRequestId]);

  // On thread switch, only clear ephemeral UI and abort in-flight ops; keep data for SWR.
  useEffect(() => {
    try { uploadAbortRef.current?.abort(); } catch {}
    try { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); } catch {}
    try { if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current); } catch {}
    setActionMenuFor(null);
    setReactionPickerFor(null);
    setReplyTarget(null);
    setShowDetailsCard(false);
    setThreadError(null);
    // Do NOT clear messages/quotes/details/payment; stale-while-revalidate keeps UI stable.
  }, [bookingRequestId]);

  useEffect(() => {
    const snapshot = getThreadSwitchSnapshot(bookingRequestId);
    hydrationStartRef.current = snapshot?.startedAtMs ?? perfNow();
    hydrationThreadRef.current = bookingRequestId;
    hydrationSourceRef.current = 'network';
    cacheEventSentRef.current = false;
    firstPaintSentRef.current = false;
    readySentRef.current = false;
    scrollSentRef.current = false;
  }, [bookingRequestId]);

  // Hydrate from cache immediately on thread switch for instant paint
  useEffect(() => {
    const cached = readCachedMessages(bookingRequestId);
    if (cached && cached.length) {
      hydrationSourceRef.current = 'session';
      if (!cacheEventSentRef.current) {
        emitStage('cache_hit', 'session');
        cacheEventSentRef.current = true;
      }
      if (!firstPaintSentRef.current) {
        emitStage('first_paint', 'session');
        firstPaintSentRef.current = true;
      }
      setMessages(cached);
      // Ensure any quoted cards referenced by cached messages are hydrated so
      // the quote bubble renders immediately instead of a skeleton.
      try {
        const quoteIds = Array.from(new Set(cached
          .map((m) => Number(m.quote_id))
          .filter((qid) => Number.isFinite(qid) && qid > 0)));
        if (quoteIds.length) { void ensureQuotesLoaded(quoteIds); }
      } catch {}
      scheduleMarkRead(cached, 'cache');
      setLoading(false);
      initialLoadedRef.current = true;
      loadedThreadsRef.current.add(bookingRequestId);
      // Keep gate closed; realtime merges will flush after fresh fetch
    } else {
      setMessages([]);
      setLoading(true);
      initialLoadedRef.current = false;
      loadedThreadsRef.current.delete(bookingRequestId);
    }
  }, [bookingRequestId]);

  useEffect(() => {
    if (!threadStoreEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const record = await readThreadFromIndexedDb(bookingRequestId);
        if (cancelled || !record) return;
        const stored = Array.isArray(record.messages) ? record.messages : [];
        if (!stored.length) return;
        const normalized = stored
          .map((m: any) => normalizeMessage(m))
          .filter((m: any) => Number.isFinite(m.id))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (!normalized.length) return;
        if (hydrationSourceRef.current !== 'session') hydrationSourceRef.current = 'indexeddb';
        if (!cacheEventSentRef.current) {
          emitStage('cache_hit', 'indexeddb');
          cacheEventSentRef.current = true;
        }
        if (!firstPaintSentRef.current) {
          emitStage('first_paint', 'indexeddb');
          firstPaintSentRef.current = true;
        }
        const cachedLast = Number(normalized[normalized.length - 1]?.id);
        const currentLast = Number(lastMessageIdRef.current[bookingRequestId] || 0);
        if (Number.isFinite(cachedLast) && cachedLast > 0 && (!Number.isFinite(currentLast) || cachedLast > currentLast)) {
          lastMessageIdRef.current[bookingRequestId] = cachedLast;
        }
        try { _writeThreadCache(bookingRequestId, normalized); } catch {}
        if (messagesRef.current.length === 0) {
          setMessages(normalized);
          // Hydrate quotes for normalized cached messages (IndexedDB path)
          try {
            const quoteIds = Array.from(new Set(normalized
              .map((m) => Number(m.quote_id))
              .filter((qid) => Number.isFinite(qid) && qid > 0)));
            if (quoteIds.length) { void ensureQuotesLoaded(quoteIds); }
          } catch {}
          scheduleMarkRead(normalized, 'cache');
          setLoading(false);
        }
        initialLoadedRef.current = initialLoadedRef.current || normalized.length > 0;
        if (normalized.length) loadedThreadsRef.current.add(bookingRequestId);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingRequestId, threadStoreEnabled]);

  useEffect(() => {
    if (hydrationThreadRef.current !== bookingRequestId) return;
    if (readySentRef.current) return;
    if (loading) return;
    readySentRef.current = true;
    emitStage('ready', hydrationSourceRef.current ?? 'network');
  }, [bookingRequestId, loading, emitStage]);

  useEffect(() => {
    if (hydrationThreadRef.current !== bookingRequestId) return;
    if (scrollSentRef.current) return;
    if (loading) return;
    if (!initialLoadedRef.current) return;
    if (virtuosoViewportHeight <= 0) return;
    scrollSentRef.current = true;
    emitStage('scroll_restored', hydrationSourceRef.current ?? 'network');
  }, [bookingRequestId, loading, virtuosoViewportHeight, emitStage]);

  // Proactively mark thread notifications as read on activation, regardless of
  // whether inbound messages were detected. This keeps aggregate counts in sync
  // when only system messages exist (which may be attributed to the same-side sender).
  useEffect(() => {
    if (!isActiveThread) return;
    if (!bookingRequestId) return;
    try {
      const op = runWithTransport(
        `thread-read:init:${bookingRequestId}`,
        async () => { await markThreadRead(bookingRequestId); },
        { metadata: { type: 'markThreadRead', threadId: bookingRequestId } },
      ) as Promise<void> | void;
      if (op && typeof (op as Promise<void>).then === 'function') {
        (op as Promise<void>)
          .then(() => {
            emitThreadsUpdated({ source: 'thread', threadId: bookingRequestId, reason: 'read' });
            try { window.dispatchEvent(new CustomEvent('inbox:unread', { detail: { delta: 0 } })); } catch {}
          })
          .catch(() => {});
      }
    } catch {
      // best-effort; do not block thread rendering
    }
  }, [isActiveThread, bookingRequestId]);

  useEffect(() => {
    if (isActiveThread) {
      activeThreadRef.current = bookingRequestId;
      const hasCache = loadedThreadsRef.current.has(bookingRequestId);
      const desiredMode: 'initial' | 'incremental' = hasCache ? 'incremental' : 'initial';
      void fetchMessages({ mode: desiredMode, reason: 'activate', force: hasCache });
      if (!hasCache) loadedThreadsRef.current.add(bookingRequestId);
    } else if (activeThreadRef.current === bookingRequestId) {
      activeThreadRef.current = null;
    }
  }, [bookingRequestId, fetchMessages, isActiveThread]);

  // Initial anchor handled by Virtuoso (no manual DOM scroll)

  // Resolve booking from request for paid/confirmed state (client path)
  const resolveBookingFromRequest = useCallback(async () => {
    // Ignore if user switched threads
    if (activeThreadRef.current !== bookingRequestId) return null;
    try {
      const list = await getMyClientBookings();
      if (activeThreadRef.current !== bookingRequestId) return null;
      const arr = list.data || [];
      const match = arr.find((b: any) => b.booking_request_id === bookingRequestId);
      if (match && (!bookingDetails || bookingDetails.id !== match.id)) {
        const full = await getBookingDetails(match.id);
        if (activeThreadRef.current !== bookingRequestId) return null;
        setBookingDetails(full.data);
        return full.data;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }, [bookingRequestId, bookingDetails]);

  useEffect(() => {
    if (bookingRequestHydration !== 'idle') return;
    let cancelled = false;
    const cancelFns: Array<() => void> = [];

    const schedule = (cb: () => Promise<void> | void, delay = 0) => {
      if (typeof window === 'undefined') {
        Promise.resolve().then(() => {
          if (!cancelled) void cb();
        });
        return;
      }
      const handle = window.setTimeout(() => {
        if (cancelled) return;
        void cb();
      }, delay);
      cancelFns.push(() => window.clearTimeout(handle));
    };

    schedule(async () => {
      if (hasInitialBookingRequest && bookingRequestVersion === 0) return;
      try {
        setBookingRequestHydration('loading');
        const res = await getBookingRequestById(bookingRequestId);
        if (!cancelled) {
          setBookingRequest(res.data);
          setBookingRequestHydration('success');
        }
      } catch (err) {
        if (!cancelled) {
          setBookingRequestHydration('error');
        }
      }
    }, 40);

    schedule(async () => {
      if (user?.user_type !== 'client') return;
      try {
        await resolveBookingFromRequest();
      } catch {
        // resolve handles its own failures; ignore here
      }
    }, 200);

    return () => {
      cancelled = true;
      cancelFns.forEach((fn) => fn());
    };
  }, [
    bookingRequestHydration,
    bookingRequestId,
    bookingRequestVersion,
    hasInitialBookingRequest,
    resolveBookingFromRequest,
    user?.user_type,
  ]);

  useEffect(() => {
    const paymentMessage = messages.find((msg) => {
      const key = String((msg as any)?.system_key || '').toLowerCase();
      if (key.startsWith('payment_received')) return true;
      const content = String(msg.content || '').toLowerCase();
      return content.includes('payment received');
    });
    if (!paymentMessage) return;

    setBookingConfirmed((prev) => (prev ? prev : true));
    setPaymentInfo((prev) => {
      const alreadyPaid = prev.status === 'paid';
      let receiptUrl = prev.receiptUrl ?? null;
      if (typeof paymentMessage.content === 'string') {
        const match = paymentMessage.content.match(/(https?:\/\/[^\s]+\/api\/v1\/payments\/[^\s/]+\/receipt|\/?api\/v1\/payments\/[^\s/]+\/receipt)/i);
        if (match) {
          const raw = match[1];
          receiptUrl = /^https?:/i.test(raw) ? raw : `${raw.startsWith('/') ? '' : '/'}${raw}`;
        }
      }
      if (alreadyPaid && receiptUrl === prev.receiptUrl) return prev;
      return {
        status: 'paid',
        amount: prev.amount,
        receiptUrl,
      };
    });
    if (!bookingConfirmed) {
      refreshBookingRequest();
      if (user?.user_type === 'client') {
        void resolveBookingFromRequest();
      }
    }
  }, [
    messages,
    bookingConfirmed,
    refreshBookingRequest,
    resolveBookingFromRequest,
    user?.user_type,
  ]);

  // ---- Payment modal (moved after fetchMessages is defined)
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(async ({ status, amount, receiptUrl: url, paymentId, mocked }) => {
      setPaymentInfo({ status: status ?? null, amount: amount ?? null, receiptUrl: url ?? null });
      if (status === 'paid') {
        setBookingConfirmed(true);
        onBookingConfirmedChange?.(true, bookingDetails);
        try { localStorage.setItem(`booking-confirmed-${bookingRequestId}`, '1'); } catch {}
        emitThreadsUpdated({ source: 'payment', threadId: bookingRequestId, immediate: true });
        if (paymentId) {
          setBookingDetails((prev) => (prev ? { ...prev, payment_id: paymentId as any } : prev));
        }
        if (mocked) {
          try {
            // Persist a canonical system message so it survives refresh even in mock mode
            const receiptLink = url || (paymentId ? `/api/v1/payments/${paymentId}/receipt` : undefined);
            await postMessageToBookingRequest(bookingRequestId, {
              content: `Payment received. Your booking is confirmed and the date is secured.${receiptLink ? ` Receipt: ${receiptLink}` : ''}`,
              message_type: 'SYSTEM',
              action: 'payment_received',
              // system_key is accepted on backend; pass it for idempotency if supported
              // @ts-ignore – extra field tolerated by backend
              system_key: 'payment_received',
              visible_to: 'both',
            } as any);
          } catch (e) {
            // non-fatal; UI still shows local message until next load
          }
        }
        // Fetch fresh messages so the server-authored (or persisted) system line shows up and persists
        void fetchMessages({ mode: 'incremental', force: true, reason: 'payment-confirmation' });
        // Also resolve booking from this thread so Event Prep can render immediately
        void resolveBookingFromRequest();
      }
      setIsPaymentOpen(false);
      onPaymentStatusChange?.(status, amount, url ?? null);
    }, [onPaymentStatusChange, bookingDetails, onBookingConfirmedChange, fetchMessages]),
    useCallback(() => { setIsPaymentOpen(false); }, []),
  );

  // ---- Realtime (multiplex) connection
  // Use cookie-based WS auth for reliability; do not pass stale storage tokens.
  const { subscribe, publish, status: socketStatus, lastReconnectDelay, forceReconnect } = useRealtime(undefined);
  const topics = useMemo(() => [
    `booking-requests:${bookingRequestId}`,
    `threads:${bookingRequestId}`,
    // common alternates used by some stacks:
    `thread:${bookingRequestId}`,
    `message-threads:${bookingRequestId}`,
    `booking_requests:${bookingRequestId}`,
    // `messages:${bookingRequestId}`, // uncomment if backend uses this
  ], [bookingRequestId]);
  const primaryTopic = topics[0];
  // Expose minimal debug helper in the browser console
  useEffect(() => {
    try { (window as any).__threadInfo = () => ({ bookingRequestId, topics }); } catch {}
  }, [bookingRequestId, topics]);

  // Close reaction picker and action menu when clicking anywhere outside them (desktop)
  useEffect(() => {
    const onGlobalMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Reaction picker: close if click isn't inside desktop/mobile picker
      if (reactionPickerFor !== null) {
        const inDesktop = reactionPickerRefDesktop.current?.contains(t) ?? false;
        const inMobile = reactionPickerRefMobile.current?.contains(t) ?? false;
        if (!inDesktop && !inMobile) setReactionPickerFor(null);
      }
      // Action menu: close if click isn't inside the menu container
      if (actionMenuFor !== null) {
        const inside = actionMenuRef.current?.contains(t) ?? false;
        if (!inside) setActionMenuFor(null);
      }
    };
    document.addEventListener('mousedown', onGlobalMouseDown, true);
    return () => document.removeEventListener('mousedown', onGlobalMouseDown, true);
  }, [reactionPickerFor, actionMenuFor]);

  // ---- Header presence exporter (2-minute grace window)
  const OTHER_ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const otherUserIdForHeader = useMemo(() => (
    (user?.user_type === 'service_provider' ? currentClientId : currentArtistId) || 0
  ), [user?.user_type, currentClientId, currentArtistId]);
  useEffect(() => {
    if (!onPresenceUpdate) return;
    // Suppress presence for Booka system-only moderation/update threads
    if (isModerationThread) { onPresenceUpdate({ online: false, lastSeenMs: null, label: '' }); return; }
    const presence = presenceByUser[otherUserIdForHeader];
    const lastSeenMs = lastSeenByUser[otherUserIdForHeader];
    const now = Date.now();
    const recent = Number.isFinite(lastSeenMs) && (now - (lastSeenMs || 0)) <= OTHER_ONLINE_WINDOW_MS;
    const isOnline = presence === 'online' || presence === 'away' || recent;
    const label = isOnline
      ? 'Online'
      : (Number.isFinite(lastSeenMs) ? `Last seen ${formatDistanceToNow(new Date(lastSeenMs), { addSuffix: true })}` : '');
    onPresenceUpdate({ online: isOnline, lastSeenMs: Number.isFinite(lastSeenMs) ? lastSeenMs : null, label });
  }, [onPresenceUpdate, presenceByUser, lastSeenByUser, otherUserIdForHeader, isModerationThread]);

  // Fallback: When realtime isn't open, poll and gently merge updates
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      // Light cadence: incremental fetch every 8s while offline/reconnecting
      const tick = () => {
        if (!isActiveThread) return;
        // Use a merge_update on a small full fetch to refresh read flags,
        // while minimizing remounts and network.
        try { console.warn('[thread] Realtime not open; polling for updates'); } catch {}
        void fetchMessages({ mode: 'initial', force: true, reason: 'poll-read', limit: 100, behavior: 'merge_update' });
      };
      tick();
      timer = setInterval(tick, 8000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (socketStatus !== 'open') start(); else stop();
    return () => stop();
  }, [socketStatus, isActiveThread, fetchMessages]);

  // ---- Presence updates via multiplex (v1 envelope)
  useEffect(() => {
    if (!myUserId) return;
    try { publish(primaryTopic, { v: 1, type: 'presence', updates: { [myUserId]: 'online' } }); } catch {}
    const handleVisibility = () =>
      publish(primaryTopic, { v: 1, type: 'presence', updates: { [myUserId]: document.hidden ? 'away' : 'online' } });
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      try { publish(primaryTopic, { v: 1, type: 'presence', updates: { [myUserId]: 'offline' } }); } catch {}
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [publish, primaryTopic, myUserId]);

  // ---- Typing emission (throttled)
  const lastTypingSentRef = useRef(0);
  const emitTyping = useCallback(() => {
    if (!myUserId) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1000) return; // 1/sec
    lastTypingSentRef.current = now;
    try {
      publish(primaryTopic, {
        v: 1,
        type: 'typing',
        user_id: myUserId,
        users: [myUserId],
        payload: { user_id: myUserId },
        data: { user_id: myUserId },
      });
    } catch {}
  }, [publish, primaryTopic, myUserId]);

  // ---- Realtime: subscribe per topic (unwrap v1 envelopes; accept both typing shapes)
  const lastRealtimeAtRef = useRef<number>(0);
  useEffect(() => {
    const handler = (payload: any) => {
      if (activeThreadRef.current !== bookingRequestId) return;
      const vNum = Number(payload?.v ?? 1);
      if (Number.isFinite(vNum) && vNum !== 1) return;

      const typeStr = String(payload?.type || '').toLowerCase();
      if (typeof window !== 'undefined' && localStorage.getItem('CHAT_DEBUG') === '1') {
        try { console.debug('[thread] recv', { topic: payload?.topic, type: typeStr }); } catch {}
      }

      // Non-message events
      if (typeStr === 'typing') {
        const src: any = payload?.payload || payload?.data || payload || {};
        const arr =
          (Array.isArray(src.users) ? src.users : null) ||
          (Array.isArray(payload?.users) ? payload.users : null) ||
          null;
        const idCandidate =
          src.user_id ?? src.userId ?? src.sender_id ?? src.from_user_id ?? payload?.user_id ?? payload?.userId;
        const incoming = arr ? arr : (typeof idCandidate === 'number' ? [idCandidate] : []);
        if (incoming.length) {
          setTypingUsers(incoming.filter((id: number) => id !== myUserId));
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUsers([]), 2000);
          // Mark presence online for incoming typers
          try {
            const now = Date.now();
            setPresenceByUser((prev) => {
              const next = { ...prev };
              incoming.forEach((uid: number) => { if (uid && uid !== myUserId) next[uid] = 'online'; });
              return next;
            });
            setLastSeenByUser((prev) => {
              const next = { ...prev };
              incoming.forEach((uid: number) => { if (uid && uid !== myUserId) next[uid] = now; });
              return next;
            });
          } catch {}
        }
        lastRealtimeAtRef.current = Date.now();
        return;
      }
      if (typeStr === 'presence') {
        try {
          const updates = (payload?.updates && typeof payload.updates === 'object') ? payload.updates : null;
          const now = Date.now();
          if (updates) {
            setPresenceByUser((prev) => {
              const next = { ...prev };
              Object.entries(updates).forEach(([idStr, st]) => {
                const uid = Number(idStr);
                const v = typeof st === 'string' ? st.toLowerCase() : '';
                if (Number.isFinite(uid) && uid > 0 && (v === 'online' || v === 'away' || v === 'offline')) next[uid] = v as any;
              });
              return next;
            });
            setLastSeenByUser((prev) => {
              const next = { ...prev };
              Object.keys(updates).forEach((idStr) => {
                const uid = Number(idStr);
                if (Number.isFinite(uid) && uid > 0) next[uid] = now;
              });
              return next;
            });
          } else {
            const uid = Number(payload?.user_id);
            const v = String(payload?.status || '').toLowerCase();
            if (Number.isFinite(uid) && uid > 0 && v) {
              setPresenceByUser((prev) => ({ ...prev, [uid]: (v === 'online' || v === 'away' || v === 'offline') ? (v as any) : prev[uid] }));
              setLastSeenByUser((prev) => ({ ...prev, [uid]: now }));
            }
          }
        } catch {}
        return;
      }
      if (typeStr === 'reconnect' || typeStr === 'reconnect_hint' || typeStr === 'ping' || typeStr === 'pong' || typeStr === 'heartbeat') {
        return;
      }
      if (typeStr === 'read') {
        const upTo: number | undefined = typeof payload.up_to_id === 'number' ? payload.up_to_id : undefined;
        const readerId: number | undefined = typeof payload.user_id === 'number' ? payload.user_id : undefined;
        if (upTo && readerId) {
          // Mark messages as read for all messages not authored by the reader, up to id
          setMessages((prev) => {
            const next = prev.map((m) => (m.sender_id !== readerId && m.id <= upTo ? { ...m, is_read: true } : m));
            writeCachedMessages(bookingRequestId, next);
            return next;
          });
        }
        return;
      }
      if (typeStr === 'message_deleted' && typeof payload.id === 'number') {
        const mid = Number(payload.id);
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== mid);
          writeCachedMessages(bookingRequestId, next);
          return next;
        });
        return;
      }
      if (typeStr === 'event_prep_updated') return;
      if (typeStr === 'reaction_added' && payload?.payload) {
        const { message_id, emoji, user_id } = payload.payload as { message_id: number; emoji: string; user_id: number };
        if (user_id === myUserId) {
          const mine = myReactionsRef.current[message_id];
          if (mine && mine.has(emoji)) return;
        }
        setReactions((prev) => {
          const cur = { ...(prev[message_id] || {}) } as Record<string, number>;
          cur[emoji] = (cur[emoji] || 0) + 1;
          return { ...prev, [message_id]: cur };
        });
        if (user_id === myUserId) {
          setMyReactions((m) => {
            const set = new Set(m[message_id] || []);
            set.add(emoji);
            return { ...m, [message_id]: set };
          });
        }
        return;
      }
      if (typeStr === 'reaction_removed' && payload?.payload) {
        const { message_id, emoji, user_id } = payload.payload as { message_id: number; emoji: string; user_id: number };
        if (user_id === myUserId) {
          const mine = myReactionsRef.current[message_id];
          if (!mine || !mine.has(emoji)) return;
        }
        setReactions((prev) => {
          const cur = { ...(prev[message_id] || {}) } as Record<string, number>;
          const nextCount = Math.max(0, (cur[emoji] || 0) - 1);
          if (nextCount <= 0) {
            delete cur[emoji];
          } else {
            cur[emoji] = nextCount;
          }
          // If no reactions left for this message, drop the key entirely
          if (Object.keys(cur).length === 0) {
            const copy = { ...prev } as Record<number, Record<string, number>>;
            delete copy[message_id];
            return copy;
          }
          return { ...prev, [message_id]: cur };
        });
        if (user_id === myUserId) {
          setMyReactions((m) => {
            const set = new Set(m[message_id] || []);
            set.delete(emoji);
            return { ...m, [message_id]: set };
          });
        }
        return;
      }

      // Message events: unwrap any envelope shape into raw messages
      const candidateItems = extractMessagesFromEnvelope(payload);
      if (!candidateItems.length) {
        // Fallback: if this looks like a message-related event but we couldn't extract
        // a concrete message payload, trigger a light REST refresh so the thread stays live.
        const looksLikeMessage = /message/.test(typeStr) || payload?.last_message || payload?.preview;
        if (looksLikeMessage) {
          try { void fetchMessages({ mode: 'incremental', reason: 'realtime-fallback' }); } catch {}
        }
        return;
      }

      if (!initialLoadedRef.current) {
        try {
          const topicId =
            Number(String((payload?.topic || '')).split(':').pop()) ||
            Number(String((topics?.[0] || '')).split(':').pop());
          const buffered = candidateItems
            .map(normalizeMessage)
            .filter((m: any) => Number.isFinite(m.id))
            .filter((m: any) => {
              const br = Number(m.booking_request_id);
              return Number.isFinite(br) && br > 0 ? br === topicId : true;
            });
          if (buffered.length) wsBufferRef.current = mergeMessages(wsBufferRef.current, buffered);
          if (typeof window !== 'undefined' && localStorage.getItem('CHAT_DEBUG') === '1') {
            try { console.debug('[thread] buffer (pre-load)', { topicId, cand: candidateItems.length, buffered: buffered.length }); } catch {}
          }
        } catch {}
        return;
      }

      const topicId =
        Number(String((payload?.topic || '')).split(':').pop()) ||
        Number(String((topics?.[0] || '')).split(':').pop());
      const normalized = candidateItems
        .map(normalizeMessage)
        .filter((m: any) => Number.isFinite(m.id))
        .filter((m: any) => {
          const br = Number(m.booking_request_id);
          return Number.isFinite(br) && br > 0 ? br === topicId : true;
        });
      if (normalized.length === 0) {
        if (typeof window !== 'undefined' && localStorage.getItem('CHAT_DEBUG') === '1') {
          try {
            const brs = candidateItems.map((c: any) => ({ id: c?.id, br: c?.booking_request_id, thread_id: c?.thread_id, nested_br: c?.booking_request?.id }));
            console.warn('[thread] dropped all candidates after filter', { topicId, cand: candidateItems.length, brs });
          } catch {}
        }
        return;
      }

      // Ensure any referenced quotes are hydrated before merging, so the card renders immediately
      (async () => {
        try {
          const quoteIds = Array.from(new Set(normalized
            .map((m) => Number(m.quote_id))
            .filter((qid) => Number.isFinite(qid) && qid > 0)));
          if (quoteIds.length) {
            await ensureQuotesLoaded(quoteIds);
          }
        } catch {}
        setMessages((prev) => {
          // Smooth swap on realtime: replace optimistic self messages with the
          // server copy while preserving client_key to avoid flicker.
          let out = prev;
          const missing = normalized.filter((m) => !prev.some((p) => p.id === m.id));
          if (missing.length) {
          const pendingMine = new Map<number, ThreadMessage>();
          for (const p of out) {
            if (p.sender_id === myUserId && (p.status === 'sending' || p.status === 'queued')) {
              pendingMine.set(p.id, p);
            }
          }
          const toAdd: ThreadMessage[] = [];
          for (const nm of missing) {
            if (nm.sender_id === myUserId && pendingMine.size) {
              let matchId: number | null = null;
              pendingMine.forEach((opt, tid) => {
                if (matchId != null) return;
                const sameContent = String(opt.content || '') === String(nm.content || '');
                const sameReply = (opt.reply_to_message_id || null) === (nm.reply_to_message_id || null);
                if (sameContent && sameReply) { matchId = tid; }
              });
              if (matchId != null) {
                const opt = pendingMine.get(matchId)!;
                const withKey = { ...nm } as any;
                if ((opt as any).client_key) withKey.client_key = (opt as any).client_key;
                out = out.filter((m) => m.id !== matchId);
                toAdd.push(withKey as ThreadMessage);
                continue;
              }
            }
            toAdd.push(nm);
          }
          out = mergeMessages(out, toAdd);
        } else {
          out = mergeMessages(out, normalized);
        }
        const next = out;
        writeCachedMessages(bookingRequestId, next);
        return next;
      });
      })();
      lastRealtimeAtRef.current = Date.now();
      if (typeof window !== 'undefined' && localStorage.getItem('CHAT_DEBUG') === '1') {
        try { console.debug('[thread] merged', { topicId, added: normalized.length }); } catch {}
      }
      // Debounced read receipt when anchored and new incoming
      const anchored = atBottomRef.current === true;
      const gotIncoming = normalized.some((m) => m.sender_id !== myUserId);
      if (anchored && gotIncoming) {
        if (readReceiptTimeoutRef.current) clearTimeout(readReceiptTimeoutRef.current);
        readReceiptTimeoutRef.current = setTimeout(() => {
          if (!canMarkReadNow()) return;
          markIncomingAsRead(normalized, 'realtime');
          try {
            const last = normalized[normalized.length - 1];
            if (last && typeof last.id === 'number') {
              // Always publish to the canonical room topic so the server routes it
              publish(primaryTopic, { v: 1, type: 'read', up_to_id: last.id, user_id: myUserId });
            }
          } catch {}
        }, 700);
      }

      // Update inbox thread previews on inbound
      try {
        const anyInbound = normalized.some((m) => m.sender_id !== myUserId);
        if (anyInbound) emitThreadsUpdated({ source: 'realtime', threadId: bookingRequestId });
      } catch {}

      // No extra quote hydration here; fetchMessages handles it synchronously.
    };
    if (!myUserId) return () => {};
    const unsubs = topics.map((t) => subscribe(t, handler));
    return () => { unsubs.forEach((u) => u()); };
  }, [subscribe, topics, myUserId, bookingRequestId, fetchMessages]);

  // Removed aggressive polling; the 8s delta poll (when WS is closed) is enough.

  // Also listen to global notifications as a safety net; if a new_message
  // notification arrives, refresh this thread if ids match or if no id is present.
  // Do not gate on user activity — ensure thread stays in sync with the preview.
  useEffect(() => {
    const unsub = subscribe('notifications', (payload: any) => {
      try {
        const typ = String(payload?.type || '').toLowerCase();
        if (!/message/.test(typ)) return;
        const id = Number(
          payload?.booking_request_id ??
          payload?.thread_id ??
          payload?.booking_request?.id ??
          payload?.thread?.id ??
          payload?.request_id ??
          payload?.conversation_id ??
          NaN
        );
        // If realtime just delivered something, skip duplicate fetch to prevent flicker
        const rtRecent = Date.now() - (lastRealtimeAtRef.current || 0) < 1200;
        if ((!Number.isFinite(id) || id === bookingRequestId) && !rtRecent) {
          try { console.info('[thread] notification → full merge-update', { threadId: bookingRequestId }); } catch {}
          void fetchMessages({ mode: 'initial', force: true, reason: 'notification', limit: 100, behavior: 'merge_update' });
        }
      } catch {}
    });
    return () => { try { unsub(); } catch {} };
  }, [subscribe, bookingRequestId, fetchMessages]);

  // ---- Attachment preview URL
  useEffect(() => {
    if (attachmentFile) {
      const url = URL.createObjectURL(attachmentFile);
      setAttachmentPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAttachmentPreviewUrl(null);
    return () => {};
  }, [attachmentFile]);

  // Image previews for multiple image attachments
  useEffect(() => {
    // Revoke stale URLs
    return () => {
      try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
    };
  }, []);
  const addImageFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;

    const shouldTranscode = (file: File) => {
      const ct = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      return ct === 'image/heic' || ct === 'image/heif' || /\.(heic|heif)$/i.test(name);
    };

    const transcodeToJpeg = async (file: File): Promise<File> => {
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        const loaded: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = (e) => reject(e);
        });
        img.crossOrigin = 'anonymous';
        img.src = url;
        const el = await loaded;
        const canvas = document.createElement('canvas');
        const MAX_W = 4096;
        const scale = Math.min(1, MAX_W / Math.max(1, el.naturalWidth));
        canvas.width = Math.max(1, Math.round(el.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(el.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
        URL.revokeObjectURL(url);
        if (!blob) throw new Error('JPEG encode failed');
        const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
        return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
      } catch {
        return file; // fallback to original if conversion fails
      }
    };

    (async () => {
      const processed: File[] = [];
      const urls: string[] = [];
      for (const f of imgs) {
        const out = shouldTranscode(f) ? await transcodeToJpeg(f) : f;
        processed.push(out);
        try { urls.push(URL.createObjectURL(out)); } catch { urls.push(''); }
      }
      setImageFiles((prev) => [...prev, ...processed]);
      setImagePreviewUrls((prev) => [...prev, ...urls]);
    })();
  }, []);
  const removeImageAt = useCallback((idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviewUrls((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      try { if (removed) URL.revokeObjectURL(removed); } catch {}
      return copy;
    });
  }, []);

  // Virtualized path: Virtuoso handles scrolling.

  // Hook typing emission to composer input
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onInput = () => emitTyping();
    ta.addEventListener('input', onInput);
    return () => { ta.removeEventListener('input', onInput); };
  }, [emitTyping]);

  // Virtualized path updates atBottom via Virtuoso callbacks below.

  // ---- Visible messages (keep it simple; only hide booking-details meta)
  // Visible slice logic removed; all messages flow through Virtuoso efficiently.

  // ---- iOS scroll unlocks
  // Non-virtual scroll touch handlers removed.

  // ---- Grouping helpers
  const shouldShowTimestampGroup = useCallback(
    (msg: ThreadMessage, index: number, list: ThreadMessage[]) => {
      if (index === 0) return true;
      const prevMsg = list[index - 1];
      const prevTime = new Date(prevMsg.timestamp).getTime();
      const currTime = new Date(msg.timestamp).getTime();

      const isDifferentDay = format(currTime, 'yyyy-MM-dd') !== format(prevTime, 'yyyy-MM-dd');
      const isTimeGapSignificant = currTime - prevTime >= TEN_MINUTES_MS;
      const isDifferentSender = prevMsg.sender_id !== msg.sender_id || prevMsg.sender_type !== msg.sender_type;

      return isDifferentDay || isTimeGapSignificant || isDifferentSender;
    },
    [],
  );

  const visibleMessages = useMemo(() => {
    const filtered = messages.filter((msg) => {
      const visibleToCurrentUser =
        !msg.visible_to ||
        msg.visible_to === 'both' ||
        (user?.user_type === 'service_provider' && msg.visible_to === 'service_provider') ||
        (user?.user_type === 'client' && msg.visible_to === 'client');

      // Hide redundant provider-side "Quote sent with total ..." style messages
      const isRedundantQuoteSent =
        normalizeType(msg.message_type) === 'SYSTEM' &&
        typeof msg.content === 'string' &&
        /^\s*quote\s+sent/i.test(msg.content.trim());

      return visibleToCurrentUser && !isRedundantQuoteSent;
    });

    // Global dedupe: only show a given SYSTEM line once (same system_key+content)
    const seen = new Set<string>();
    const deduped: ThreadMessage[] = [];
    for (const msg of filtered) {
      if (normalizeType(msg.message_type) === 'SYSTEM') {
        const key = `${(msg.system_key || '').toLowerCase()}|${String(msg.content || '').trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      deduped.push(msg);
    }

    // Ensure inquiry card (inquiry_sent_v1) renders BEFORE the first client USER message
    try {
      const isInquiry = (m: ThreadMessage) => {
        const key = ((m as any).system_key || '').toString().toLowerCase();
        if (key === 'inquiry_sent_v1') return true;
        const raw = String((m as any).content || '');
        return raw.startsWith('{') && raw.includes('inquiry_sent_v1');
      };
      const inquiryIdx = deduped.findIndex(isInquiry);
      const firstUserIdx = deduped.findIndex(
        (m) => normalizeType(m.message_type) !== 'SYSTEM' && m.sender_type === 'client'
      );
      if (inquiryIdx !== -1 && firstUserIdx !== -1 && inquiryIdx > firstUserIdx) {
        const [inq] = deduped.splice(inquiryIdx, 1);
        // Insert inquiry card right before the first client message
        deduped.splice(firstUserIdx, 0, inq);
      }
    } catch {}

    return deduped;
  }, [messages, user?.user_type]);

  const groupedMessages = useMemo(() => {
    const groups: { sender_id: number | null; sender_type: string; messages: ThreadMessage[]; showDayDivider: boolean }[] = [];
    visibleMessages.forEach((msg, idx) => {
      const isNewGroupNeededBase = shouldShowTimestampGroup(msg, idx, visibleMessages);
      const isSystemNow = normalizeType(msg.message_type) === 'SYSTEM';
      const prev = idx > 0 ? visibleMessages[idx - 1] : null;
      const wasSystemPrev = prev ? normalizeType(prev.message_type) === 'SYSTEM' : false;
      const isNewGroupNeeded = isNewGroupNeededBase || isSystemNow || wasSystemPrev;
      const isNewDay =
        idx === 0 ||
        format(new Date(msg.timestamp), 'yyyy-MM-dd') !== format(new Date(visibleMessages[idx - 1].timestamp), 'yyyy-MM-dd');

      if (isNewGroupNeeded || groups.length === 0) {
        groups.push({
          sender_id: msg.sender_id,
          sender_type: msg.sender_type,
          messages: [msg],
          showDayDivider: isNewDay,
        });
      } else {
        const lastGroup = groups[groups.length - 1];
        lastGroup.messages.push(msg);
        if (isNewDay) lastGroup.showDayDivider = true;
      }
    });
    return groups;
  }, [visibleMessages, shouldShowTimestampGroup]);

  // Track latest index for scroll anchoring from earlier hooks (e.g., autoResize)
  useEffect(() => {
    latestIndexRef.current = Math.max(0, groupedMessages.length - 1);
  }, [groupedMessages.length]);

  // Keep latest message visible when the composer grows or preview rows toggle
  useEffect(() => {
    if (!virtuosoRef.current) return;
    if (atBottomRef.current !== true) return;
    const idx = Math.max(0, groupedMessages.length - 1);
    try {
      const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
      if (raf) raf(() => { try { virtuosoRef.current?.scrollToIndex?.({ index: idx, align: 'end', behavior: 'auto' }); } catch {} });
      else virtuosoRef.current?.scrollToIndex?.({ index: idx, align: 'end', behavior: 'auto' });
    } catch {}
  }, [groupedMessages.length, composerHeight]);

  useEffect(() => {
    if (!virtuosoRef.current) return;
    if (atBottomRef.current !== true) return;
    const idx = Math.max(0, groupedMessages.length - 1);
    try { virtuosoRef.current?.scrollToIndex?.({ index: idx, align: 'end', behavior: 'auto' }); } catch {}
  }, [groupedMessages.length, imagePreviewUrls.length, attachmentPreviewUrl]);

  // Update last-seen map from messages as a fallback presence signal
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    try {
      const next: Record<number, number> = {};
      for (const m of messages) {
        const t = new Date(m.timestamp).getTime();
        const uid = Number(m.sender_id);
        if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(t)) continue;
        if (next[uid] == null || t > next[uid]) next[uid] = t;
      }
      if (Object.keys(next).length) {
        setLastSeenByUser((prev) => ({ ...prev, ...next }));
      }
    } catch {}
  }, [messages]);

  // Stable keys for each rendered group – used by Virtuoso to avoid remounts
  const groupIds = useMemo(() => groupedMessages.map((g) => (g.messages[0]?.id ?? Math.random())), [groupedMessages]);

  // Render a single group by index; used by Virtuoso item renderer
  const renderGroupAtIndex = useCallback((idx: number) => {
    const group = groupedMessages[idx];
    if (!group || group.messages.length === 0) return null;

    const firstMsgInGroup = group.messages[0];
    const firstNonSystem = group.messages.find((m) => normalizeType(m.message_type) !== 'SYSTEM');
    const showHeader = !!firstNonSystem && firstNonSystem.sender_id !== myUserId;
    const __dayLabel = group.showDayDivider ? daySeparatorLabel(new Date(firstMsgInGroup.timestamp)) : null;
    const __headerView = showHeader ? (
      <div className="flex items-center mb-1">
        {user?.user_type === 'service_provider'
          ? clientAvatarUrl
            ? (
                <SafeImage
                  src={clientAvatarUrl}
                  alt="Client avatar"
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-full object-cover mr-2"
                />
              )
            : (
                <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
                  {clientName?.charAt(0)}
                </div>
              )
          : artistAvatarUrl
          ? (
              <SafeImage
                src={artistAvatarUrl}
                alt="Artist avatar"
                width={20}
                height={20}
                className="h-5 w-5 rounded-full object-cover mr-2"
              />
            )
          : (
              <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
                {artistName?.charAt(0)}
              </div>
            )}
        <span className="text-xs text-gray-600">
          {user?.user_type === 'service_provider' ? clientName : artistName}
        </span>
      </div>
    ) : null;

    return (
      <ThreadMessageGroup key={firstMsgInGroup.id} dayLabel={__dayLabel}>
        <div className="flex flex-col w-full">
          {__headerView}
          {/* Bubbles */}
          {(() => {
            // Coalesce consecutive image-only messages into a single album item
            const items: Array<{ type: 'album'; msgs: ThreadMessage[] } | { type: 'msg'; msg: ThreadMessage }>[] = [] as any;
            const out: any[] = [];
            const isImageOnly = (m: ThreadMessage) => {
              const url = m.attachment_url || '';
              const img = isImageAttachment(url || undefined);
              if (!img) return false;
              const text = String(m.content || '').trim().toLowerCase();
              if (!text) return true;
              // Treat common placeholders as image-only
              return text === '[attachment]' || text === 'attachment' || text === '[image]' || text === 'image';
            };
            for (let i = 0; i < group.messages.length; ) {
              const m = group.messages[i];
              if (isImageOnly(m)) {
                const block: ThreadMessage[] = [m];
                let j = i + 1;
                while (j < group.messages.length && isImageOnly(group.messages[j])) {
                  block.push(group.messages[j]);
                  j++;
                }
                if (block.length > 1) {
                  out.push({ type: 'album', msgs: block });
                } else {
                  out.push({ type: 'msg', msg: m });
                }
                i = j;
              } else {
                out.push({ type: 'msg', msg: m });
                i++;
              }
            }
            return out.map((entry, idx2) => {
              if (entry.type === 'album') {
                const msgs = entry.msgs as ThreadMessage[];
                const first = msgs[0];
                const isMsgFromSelfAlbum = first.sender_id === myUserId;
                const bubbleBase = isMsgFromSelfAlbum
                  ? 'bg-blue-50 text-gray-900 whitespace-pre-wrap break-words'
                  : 'bg-gray-50 text-gray-900 whitespace-pre-wrap break-words';
                const bubbleShapeAlbum = isMsgFromSelfAlbum ? 'rounded-br-none rounded-xl' : 'rounded-bl-none rounded-xl';
                const albumAlignClass = isMsgFromSelfAlbum ? 'ml-auto mr-0' : 'mr-auto ml-0';
                const albumItems = msgs.map((mm) => {
                  const raw = mm.local_preview_url || mm.attachment_url || '';
                  return { id: mm.id, raw, url: toApiAttachmentsUrl(raw) };
                });
                return (
                  <div
                    key={`album-${first.id}`}
                    className={`group relative inline-block select-none w-auto max-w-[75%] px-3 py-2 text-[13px] leading-snug ${bubbleBase} ${bubbleShapeAlbum} ${albumAlignClass} mb-2`}
                  >
                    <div className="w-full overflow-x-auto flex gap-2 snap-x" style={{ WebkitOverflowScrolling: 'touch' } as any}>
                      {albumItems.map((item, k) => (
                        <button
                          key={`${item.id}-${k}`}
                          type="button"
                          className="relative flex-shrink-0 snap-center"
                          onClick={() => openImageModalForUrl(imageSrcById[item.id] || item.url)}
                          aria-label="Open image"
                        >
                          <img
                            src={imageSrcById[item.id] || item.url}
                            alt={`Image ${k + 1}`}
                            className="block h-40 w-auto max-w-[70vw] rounded-lg object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement & { dataset: any };
                              const current = imageSrcById[item.id] || item.url;
                              const hasAlt = !!el.dataset.triedAlt;
                              if (!hasAlt) {
                                const alt = altAttachmentPath(current);
                                setImageSrcById((prev) => ({ ...prev, [item.id]: alt }));
                                el.dataset.triedAlt = '1';
                                return;
                              }
                              if (!el.dataset.triedBlob) {
                                el.dataset.triedBlob = '1';
                                void fetchAttachmentBlobUrl(item.url).then((blobUrl) => {
                                  if (blobUrl) setImageSrcById((prev) => ({ ...prev, [item.id]: blobUrl }));
                                });
                              }
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              const msg = (entry as any).msg as ThreadMessage;
              const msgIdx = group.messages.indexOf(msg);
              const isMsgFromSelf = msg.sender_id === myUserId;
              const isLastInGroup = msgIdx === group.messages.length - 1;
              const isSystemMsg = isSystemMsgHelper(msg);

              let bubbleShape = 'rounded-xl';
              if (isSystemMsg) {
                bubbleShape = 'rounded-lg';
              } else if (isMsgFromSelf) {
                bubbleShape = isLastInGroup ? 'rounded-br-none rounded-xl' : 'rounded-xl';
              } else {
                bubbleShape = isLastInGroup ? 'rounded-bl-none rounded-xl' : 'rounded-xl';
              }

            const quoteId = Number(msg.quote_id);
            const isQuoteMessage =
              quoteId > 0 &&
              (normalizeType(msg.message_type) === 'QUOTE' ||
                (normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'review_quote'));

            // Detect inline inquiry card payload even if message_type is not SYSTEM
            try {
              const raw = String((msg as any).content || '');
              if (raw.startsWith('{') && raw.includes('inquiry_sent_v1')) {
                const parsed = JSON.parse(raw);
                const card = parsed?.inquiry_sent_v1;
                if (card) {
                  const cardViewUrl = resolveListingViewUrl(card.view);
                  const alignClass = isMsgFromSelf ? 'ml-auto' : 'mr-auto';
                  const dateOnly = card.date ? String(card.date).slice(0, 10) : null;
                  const prettyDate = (() => {
                    if (!dateOnly) return null;
                    const d = new Date(dateOnly);
                    return isValid(d) ? format(d, 'd LLL yyyy') : dateOnly;
                  })();
                  return (
                    <div key={msg.id} className={`my-2 ${alignClass} w-full md:w-1/3 md:max-w-[480px] group relative`} role="group" aria-label="Inquiry sent">
                      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-gray-600 font-medium">{t('system.inquirySent', 'Inquiry sent')}</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{card.title || t('system.listing', 'Listing')}</div>
                          </div>
                          {card.cover && (
                            <SafeImage src={card.cover} alt="" width={56} height={56} className="ml-auto h-14 w-14 rounded-lg object-cover" sizes="56px" />
                          )}
                        </div>
                        {(prettyDate || card.guests) && (
                          <div className="mt-2 text-xs text-gray-600">
                            {[prettyDate, card.guests ? `${card.guests} guest${Number(card.guests) === 1 ? '' : 's'}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                        {cardViewUrl && (
                          <div className="mt-3">
                            <a
                              href={cardViewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white hover:no-underline focus:text-white active:text-white"
                            >
                              {t('system.viewListing', 'View listing')}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              }
            } catch {}

            // Plain system line (except for special actions handled below)
            if (isSystemMsg && msg.action !== 'view_booking_details' && msg.action !== 'review_quote') {
              return (
                <div key={msg.id} ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}>
                  {renderSystemLine(msg)}
                </div>
              );
            }

            const bubbleBase = isMsgFromSelf
              ? 'bg-blue-50 text-gray-900 whitespace-pre-wrap break-words'
              : 'bg-gray-50 text-gray-900 whitespace-pre-wrap break-words';
            const bubbleClasses = `${bubbleBase} ${bubbleShape}`;
            const messageTime = format(new Date(msg.timestamp), 'HH:mm');

            if (isQuoteMessage) {
              const quoteData = quotes[quoteId];
              if (!quoteData) {
                return (
                  <div
                    key={msg.id}
                    id={`quote-${quoteId}`}
                    className="mb-0.5 w-full"
                    ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                  >
                    <QuoteBubbleSkeleton />
                  </div>
                );
              }
              const isClient = isClientViewFlag;
              const isPaid = isPaidFlag;
              return (
                <div
                  key={msg.id}
                  id={`quote-${quoteId}`}
                  className="mb-0.5 w-full"
                  ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                >
                  {isClient && quoteData.status === 'pending' && !isPaid && (
                    <div className="my-2">
                      <div className="flex items-center gap-3 text-gray-500">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-[11px]">
                          {t('quote.newFrom', 'New quote from {name}', { name: artistName || 'the artist' })}
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                    </div>
                  )}

                  <MemoQuoteBubble
                    quoteId={quoteId}
                    description={quoteData.services[0]?.description || ''}
                    price={Number(quoteData.services[0]?.price || 0)}
                    soundFee={Number(quoteData.sound_fee)}
                    travelFee={Number(quoteData.travel_fee)}
                    accommodation={quoteData.accommodation || undefined}
                    discount={Number(quoteData.discount) || undefined}
                    subtotal={Number(quoteData.subtotal)}
                    total={Number(quoteData.total)}
                    status={
                      quoteData.status === 'pending'
                        ? 'Pending'
                        : quoteData.status === 'accepted'
                          ? 'Accepted'
                          : quoteData.status === 'rejected' || quoteData.status === 'expired'
                            ? 'Rejected'
                            : 'Pending'
                    }
                    isClientView={isClientViewFlag}
                    isPaid={isPaidFlag}
                    expiresAt={quoteData.expires_at || undefined}
                    eventDetails={eventDetails}
                    providerName={artistName || 'Service Provider'}
                    providerAvatarUrl={artistAvatarUrl || undefined}
                    providerId={currentArtistId}
                    cancellationPolicy={artistCancellationPolicy || undefined}
                    paymentTerms={'Pay the full amount now via Booka secure checkout'}
                    providerRating={bookingDetails?.service?.service_provider?.rating as any}
                    providerRatingCount={bookingDetails?.service?.service_provider?.rating_count as any}
                    providerVerified={true}
                    mapUrl={(() => {
                      const tb: any = (bookingRequest as any)?.travel_breakdown || {};
                      const name = (parsedBookingDetails as any)?.location_name || tb.venue_name || tb.place_name || tb.location_name || '';
                      const addr = (parsedBookingDetails as any)?.location || tb.address || tb.event_city || tb.event_town || (bookingRequest as any)?.service?.service_provider?.location || '';
                      const q = [name, addr].filter(Boolean).join(', ');
                      return (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : undefined) as any;
                    })()}
                    includes={(() => {
                      const arr: string[] = [];
                      if (Number(quoteData.sound_fee) > 0) arr.push('Sound equipment');
                      if (Number(quoteData.travel_fee) > 0) arr.push('Travel to venue');
                      arr.push('Performance as described');
                      return arr;
                    })()}
                    excludes={(() => {
                      const arr: string[] = [];
                      if (!Number(quoteData.sound_fee)) arr.push('Sound equipment');
                      arr.push('Venue/Power/Stage');
                      return arr;
                    })()}
                    onViewDetails={undefined}
                    onAskQuestion={() => textareaRef.current?.focus()}
                    onAccept={undefined}
                    onPayNow={
                      user?.user_type === 'client' && (quoteData.status === 'pending' || quoteData.status === 'accepted') && !isPaid && !isPaymentOpen
                        ? async () => {
                            try {
                              if (quoteData.status === 'pending') {
                                await handleAcceptQuote(quoteData);
                              }
                            } catch (e) {
                              // If acceptance fails, surface error and abort payment
                              console.error('Failed to accept quote', e);
                              setThreadError('Could not accept the quote. Please try again.');
                              return;
                            }
                            try {
                              const amt = Number(quoteData.total || 0);
                              openPaymentModal({ bookingRequestId, amount: amt } as any);
                            } catch (e) {
                              console.error('Payment modal error', e);
                            }
                          }
                        : undefined
                    }
                  />

                  {/* Guidance notes for artists when client needs to act */}
                  {user?.user_type === 'service_provider' && quoteData.status === 'pending' && (
                    <div className="mt-3">
                      <div className="flex items-start gap-2 rounded-lg bg-gray-50 text-gray-600 text-[12px] px-3 py-2 border border-gray-100">
                        <InformationCircleIcon className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-[11px] text-gray-600">
                            Pending client action — we’ll notify you when they respond.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Reveal images lazily – declared in top-level version; keep minimal here
            const reactionMapForMsg = ((reactions[msg.id] || (msg.reactions as any) || {}) as Record<string, number>);
            const hasReactionsForMsg = Object.entries(reactionMapForMsg).some(([, c]) => (Number(c) > 0));

              return (
              <div
                key={(msg as any).client_key || msg.id}
                id={`msg-${msg.id}`}
                className={`group relative inline-block select-none w-auto max-w-[75%] px-3 py-2 text-[13px] leading-snug ${bubbleClasses} ${hasReactionsForMsg ? 'mb-5' : (msgIdx < group.messages.length - 1 ? 'mb-0.5' : 'mb-3')} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'} ${highlightFor === msg.id ? 'ring-1 ring-indigo-200' : ''}`}
                ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                onTouchStart={(e) => startLongPress(msg.id, e)}
                onTouchMove={moveLongPress}
                onTouchEnd={endLongPress}
                onTouchCancel={(e) => endLongPress(e)}
                style={{ WebkitTouchCallout: 'none' } as any}
              >
                {/* Desktop hover extender zones: make hover area span full row side */}
                {isMsgFromSelf ? (
                  <div className="hidden md:block absolute inset-y-0 left-0 right-0 pointer-events-none" aria-hidden="true" />
                ) : (
                  <div className="hidden md:block absolute inset-y-0 left-0 right-0 pointer-events-none" aria-hidden="true" />
                )}
                <div className={'pr-9 mb-1'}>
                  {msg.reply_to_preview && (
                    <button
                      type="button"
                      onClick={() =>
                        msg.reply_to_message_id &&
                        scrollToMessage(msg.reply_to_message_id)
                      }
                      className="mb-1 w-full rounded bg-gray-200 text-left text-[12px] text-gray-700 px-2 py-1 border-l-2  border-gray-800 cursor-pointer "
                      title="View replied message"
                    >
                      <span className="line-clamp-2 break-words">
                        {msg.reply_to_preview}
                      </span>
                    </button>
                  )}
                  {/* No dot indicator; receipts are shown on sender bubbles as double checks */}

                  <>
                    {(() => {
                      // Suppress placeholder labels; style non-image attachments like a reply header box
                      const url = msg.attachment_url
                        ? (/^(blob:|data:)/i.test(msg.attachment_url) ? msg.attachment_url : toApiAttachmentsUrl(msg.attachment_url))
                        : '';
                      const display = msg.local_preview_url || url;
                      const metaTypeH = String((msg.attachment_meta as any)?.content_type || '').toLowerCase();
                      const isAudio = metaTypeH.startsWith('audio/') || isAudioAttachmentUrl(display);
                      const isImage = metaTypeH.startsWith('image/') || (!isAudio && isImageAttachment(display));
                      const contentLower = String(msg.content || '').trim().toLowerCase();
                      const isVoicePlaceholder = contentLower === '[voice note]' || contentLower === 'voice note';
                      const isAttachmentPlaceholder = contentLower === '[attachment]' || contentLower === 'attachment';
                      if (isAudio && isVoicePlaceholder) return null; // legacy voice-note placeholder hidden
                      if (isImage && isAttachmentPlaceholder) return null; // hide generic attachment label for images
                      // For audio attachments, prefer the player only (no header label)
                      if (isAudio) return null;
                      // For non-image attachments, render a reply-style header with file label; no text body below
                      if (!isImage && msg.attachment_url) {
                        const meta = (msg.attachment_meta as AttachmentMeta | null) ?? null;
                        let label = meta?.original_filename?.trim() || String(msg.content || '').trim();
                        if (!label || isAttachmentPlaceholder) {
                          try {
                            label = decodeURIComponent((url.split('?')[0].split('/').pop() || 'Attachment'));
                          } catch {
                            label = 'Attachment';
                          }
                        }
                        const sizeLabel = typeof meta?.size === 'number' && meta.size > 0 ? formatBytes(meta.size) : null;
                        // Pick an icon by extension
                        const metaTypeLower = String(meta?.content_type || '').toLowerCase();
                        let IconComp: React.ComponentType<React.SVGProps<SVGSVGElement>> | null = DocumentTextIcon;
                        try {
                          const clean = url.split('?')[0];
                          const ext = (clean.split('.').pop() || '').toLowerCase();
                          if (['mp3','m4a','ogg','webm','wav'].includes(ext)) IconComp = MusicalNoteIcon;
                          else if (ext === 'pdf') IconComp = PdfIcon as any;
                          else if (['doc','docx'].includes(ext)) IconComp = WordIcon as any;
                          else if (['xls','xlsx','csv'].includes(ext)) IconComp = ExcelIcon as any;
                          else if (['ppt','pptx'].includes(ext)) IconComp = PowerPointIcon as any;
                          else if (['txt','rtf','md'].includes(ext)) IconComp = DocumentTextIcon;
                          else IconComp = PaperClipIcon;
                        } catch { IconComp = DocumentTextIcon; }
                        const extLower = (() => { try { const clean = url.split('?')[0]; return (clean.split('.').pop() || '').toLowerCase(); } catch { return ''; } })();
                        const isPdf = metaTypeLower.includes('pdf') || extLower === 'pdf';
                        const isOfficeDoc = (
                          metaTypeLower.includes('msword') ||
                          metaTypeLower.includes('vnd.openxmlformats-officedocument.wordprocessingml.document') ||
                          metaTypeLower.includes('vnd.ms-excel') ||
                          metaTypeLower.includes('vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
                          metaTypeLower.includes('vnd.ms-powerpoint') ||
                          metaTypeLower.includes('vnd.openxmlformats-officedocument.presentationml.presentation') ||
                          metaTypeLower.includes('rtf') ||
                          metaTypeLower.includes('csv') ||
                          ['doc','docx','xls','xlsx','ppt','pptx','rtf','csv'].includes(extLower)
                        );
                        return (
                          <div
                            className={`mb-3 w-full rounded bg-gray-200 text-left text-[12px] text-gray-700 px-2 py-1 ${!isAudio ? 'cursor-pointer' : ''}`}
                            title={label}
                            role={!isAudio ? 'button' : undefined}
                            tabIndex={!isAudio ? 0 : undefined}
                            onClick={!isAudio ? (e) => {
                              e.stopPropagation();
                              const target = toApiAttachmentsUrl(url);
                              if (isPdf || isOfficeDoc) {
                                try { window.open(target, '_blank', 'noopener,noreferrer'); } catch {}
                              } else {
                                setFilePreviewSrc(target);
                              }
                            } : undefined}
                            onKeyDown={!isAudio ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                const target = toApiAttachmentsUrl(url);
                                if (isPdf || isOfficeDoc) {
                                  try { window.open(target, '_blank', 'noopener,noreferrer'); } catch {}
                                } else {
                                  setFilePreviewSrc(target);
                                }
                              }
                            } : undefined}
                          >
                            <div className="flex items-start gap-1.5 w-full">
                               {IconComp ? <IconComp className="w-4 h-4 flex-shrink-0 mt-0.5" /> : null}
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 break-words font-medium">{label}</div>
                                {sizeLabel && <div className="text-[11px] text-gray-500 mt-0.5">{sizeLabel}</div>}
                                {isPdf || isOfficeDoc ? <div className="mt-0.5 text-[11px] text-indigo-700">Open</div> : null}
                              </div>
                            </div>
                            {uploadProgressById[msg.id] != null && (
                              <div className="mt-1 h-1 bg-gray-300 rounded-full overflow-hidden">
                                <div className="h-1 bg-indigo-500" style={{ width: `${uploadProgressById[msg.id]}%` }} />
                              </div>
                            )}
                          </div>
                        );
                      }
                      return msg.content;
                    })()}
                    {msg.attachment_url && (
                      (() => {
                        // Always derive from local preview (optimistic) if present
                        const raw = msg.attachment_url!;
                        const baseUrl = /^(blob:|data:)/i.test(raw) ? raw : toApiAttachmentsUrl(raw);
                        const display = msg.local_preview_url || baseUrl;

            const metaType = String((msg.attachment_meta as any)?.content_type || '').toLowerCase();
            const isAud = metaType.startsWith('audio/') || isAudioAttachmentUrl(display);
            const isVid = metaType.startsWith('video/') || (!isAud && isVideoAttachmentUrl(display));
            const isImg = metaType.startsWith('image/') || (!isAud && !isVid && isImageAttachment(display));

                        if (isImg) {
                          const pct = uploadProgressById[msg.id];
                          const R = 18; // ring radius
                          const C = Math.PI * 2 * R;
                          return (
                            <div className="relative mt-0 inline-block w-full">
                              <button
                                type="button"
                                onClick={() => openImageModalForUrl(imageSrcById[msg.id] || toApiAttachmentsUrl(display))}
                                className="block"
                                aria-label="Open image"
                              >
                                <img
                                  src={imageSrcById[msg.id] || toApiAttachmentsUrl(display)}
                                  alt="Image attachment"
                                  className="block w-full h-auto rounded-xl"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    const el = e.currentTarget as HTMLImageElement & { dataset: any };
                                    const primary = toApiAttachmentsUrl(display);
                                    const cur = imageSrcById[msg.id] || primary;
                                    if (!el.dataset.triedAlt) {
                                      const alt = altAttachmentPath(cur);
                                      setImageSrcById((prev) => ({ ...prev, [msg.id]: alt }));
                                      el.dataset.triedAlt = '1';
                                      return;
                                    }
                                    if (!el.dataset.triedBlob) {
                                      el.dataset.triedBlob = '1';
                                      void fetchAttachmentBlobUrl(primary).then((blobUrl) => {
                                        if (blobUrl) setImageSrcById((prev) => ({ ...prev, [msg.id]: blobUrl }));
                                      });
                                    }
                                  }}
                                />
                              </button>
                              {pct != null && (
                                <div className="absolute inset-0 grid place-items-center">
                                  <div className="relative">
                                    <svg width="48" height="48" viewBox="0 0 48 48">
                                      <circle cx="24" cy="24" r={R} stroke="#e5e7eb" strokeWidth="4" fill="none" />
                                      <circle
                                        cx="24"
                                        cy="24"
                                        r={R}
                                        stroke="#6366f1"
                                        strokeWidth="4"
                                        fill="none"
                                        strokeDasharray={`${C} ${C}`}
                                        strokeDashoffset={`${C * (1 - Math.max(0, Math.min(100, pct)) / 100)}`}
                                        transform="rotate(-90 24 24)"
                                      />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (isAud) {
                          // Avoid rendering <audio> with a local blob while uploading on mobile.
                          // Show a clean uploading row with progress; render actual <audio> after send.
                          const isPending = msg.status === 'sending' || msg.status === 'queued';
                          if (isPending) {
                            const pct = uploadProgressById[msg.id];
                            return (
                              <div className="mt-1 inline-flex items-center gap-2 text-xs text-gray-600">
                                <span>Uploading…</span>
                                <div className="w-28 h-1 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-1 bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, pct ?? 10))}%` }} />
                                </div>
                              </div>
                            );
                          }

                          // For sent audio, prefer remote/proxied URLs first; do not use local blob as initial src
                          const fallbackChain = buildAttachmentFallbackChain(raw);
                          const pathCandidate = fallbackChain.find(
                            (c) => typeof c === 'string' && (/^\/(attachments|media)(\/|$)/i.test(c) || /^\/static\/(attachments|media)(\/|$)/i.test(c)),
                          );
                          const absoluteCandidate = fallbackChain.find((c) => /^https?:/i.test(c));
                          const initialAudioSrc = pathCandidate || absoluteCandidate || toProxyPath(baseUrl);
                          const audioFallbacks = initialAudioSrc
                            ? [initialAudioSrc, ...fallbackChain.filter((c) => c !== initialAudioSrc)]
                            : fallbackChain;
                          return (
                            <ChatAudioPlayer initialSrc={initialAudioSrc} fallbacks={audioFallbacks} original={raw} compactWidth="w-full" />
                          );
                        }

                        if (isVid) {
                          const videoSrc = toProxyPath(display);
                          const pct = uploadProgressById[msg.id];
                          const R = 18; const C = Math.PI * 2 * R;
                          return (
                            <div className="mt-1 inline-block w-full md:w-1/2 lg:w-1/2 relative">
                              <video
                                className="w-full rounded-xl"
                                controls
                                preload="metadata"
                                playsInline
                                src={videoSrc}
                              />
                              {pct != null && (
                                <div className="absolute inset-0 grid place-items-center">
                                  <div className="relative">
                                    <svg width="48" height="48" viewBox="0 0 48 48">
                                      <circle cx="24" cy="24" r={R} stroke="#e5e7eb" strokeWidth="4" fill="none" />
                                      <circle
                                        cx="24"
                                        cy="24"
                                        r={R}
                                        stroke="#6366f1"
                                        strokeWidth="4"
                                        fill="none"
                                        strokeDasharray={`${C} ${C}`}
                                        strokeDashoffset={`${C * (1 - Math.max(0, Math.min(100, pct)) / 100)}`}
                                        transform="rotate(-90 24 24)"
                                      />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return null;
                      })()
                    )}
                  </>
                </div>

                {/* Time & status */}
                <div className="absolute bottom-0 right-1 text-[10px] text-gray-500 select-none flex items-center">
                  <span className="tabular-nums">{messageTime}</span>
                  {isMsgFromSelf && (
                    msg.status === 'failed' ? (
                      <ExclamationTriangleIcon className="w-3 h-3 text-red-500" aria-label="Failed to send" />
                    ) : (msg.status === 'sending' || msg.status === 'queued') ? (
                      <ClockIcon className="w-3 h-3" aria-label="Sending" />
                    ) : (
                      <ReadReceipt state={toDeliveryState(msg)} at={msg.timestamp} align={isMsgFromSelf ? 'outgoing' : 'incoming'} />
                    )
                  )}
                </div>

                {/* Hover actions (desktop): small chevron button to open menu */}
                <HoverActions msg={msg} isMsgFromSelf={isMsgFromSelf} />

                {/* Reaction picker: render outside bubble, above it.
                    For received (left-aligned) bubbles, anchor from the middle to the right.
                    For sent (right-aligned) bubbles, anchor from the middle to the left. */}
                {reactionPickerFor === msg.id && (
                  <div
                    ref={reactionPickerRefDesktop}
                    className={`absolute bottom-full mb-1 z-40 pointer-events-auto ${
                      isMsgFromSelf ? 'right-1/2' : 'left-1/2'
                    }`}
                  >
                    <div className={`inline-flex ${isMsgFromSelf ? 'justify-end' : 'justify-start'}`}>
                      <ReactionBar id={msg.id} />
                    </div>
                  </div>
                )}

                {/* Reaction trigger – always visible for reliability */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 z-30 opacity-100 pointer-events-auto ${
                    isMsgFromSelf ? '-left-6' : '-right-6'
                  }`}
                >
                  <button
                    type="button"
                    title="React"
                    aria-label="React to message"
                    className="w-6 h-6 flex items-center justify-center text-black hover:scale-110 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenuFor(null);
                      setReactionPickerFor((v) => (v === msg.id ? null : msg.id));
                    }}
                  >
                    <FaceSmileIcon className="w-5 h-5 text-black" />
                  </button>
                </div>

                {/* Reactions badge: bottom-left of bubble for both sender and receiver.
                    Sits half inside, half outside the bubble for emphasis. */}
                {(Object.entries(reactionMapForMsg).some(([, c]) => Number(c) > 0)) && (
                  <div className="absolute left-2 -bottom-3 z-20">
                    <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 shadow-sm">
                      {Object.entries(reactionMapForMsg)
                        .filter(([, c]) => Number(c) > 0)
                        .map(([k, c]) => (
                          <span key={k} className="leading-none">
                            {k} {c}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Chevron menu: render outside bubble, above it; mirror direction like reactions */}
                {actionMenuFor === msg.id && (
                  <div
                    className={`absolute bottom-full mb-1 z-40 pointer-events-auto ${
                      isMsgFromSelf ? 'right-1/2' : 'left-1/2'
                    }`}
                  >
                    <div
                      ref={actionMenuRef}
                      className="rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                      onClick={() => {
                        try {
                          const parts: string[] = [];
                          if (msg.content) parts.push(msg.content);
                          if (msg.attachment_url) parts.push(toApiAttachmentsUrl(msg.attachment_url));
                          void navigator.clipboard.writeText(parts.join('\n'));
                        } catch {}
                        setActionMenuFor(null);
                        setCopiedFor(msg.id);
                        setTimeout(() => setCopiedFor((v) => (v === msg.id ? null : v)), 1200);
                      }}
                    >
                      Copy
                    </button>
                      <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                      onClick={() => {
                        setReplyTarget(msg);
                        setReactionPickerFor(null);
                        setActionMenuFor(null);
                      }}
                    >
                      Reply
                    </button>
                      <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                      onClick={() => {
                        setReactionPickerFor(msg.id);
                        setActionMenuFor(null);
                      }}
                    >
                      React
                    </button>
                      {msg.attachment_url && (
                        <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={async () => {
                          try {
                            const url = toApiAttachmentsUrl(msg.attachment_url!);
                            const res = await fetch(url, { credentials: 'include' as RequestCredentials });
                            if (!res.ok) throw new Error(String(res.status));
                            const blob = await res.blob();
                            const a = document.createElement('a');
                            const objectUrl = URL.createObjectURL(blob);
                            a.href = objectUrl;
                            a.download = url.split('/').pop() || 'file';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(objectUrl);
                          } catch (err) {
                            try { window.open(toApiAttachmentsUrl(msg.attachment_url!), '_blank', 'noopener,noreferrer'); } catch {}
                          } finally {
                            setActionMenuFor(null);
                          }
                        }}
                      >
                        Download
                        </button>
                      )}
                      {isMsgFromSelf && (
                        <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          setActionMenuFor(null);
                          const ok = typeof window !== 'undefined' ? window.confirm('Delete this message?') : true;
                          if (!ok) return;
                          const snapshot = messages;
                          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                          try {
                            const bid = bookingDetails?.id || (parsedBookingDetails as any)?.id;
                            if (bid) await deleteMessageForBookingRequest(bookingRequestId, msg.id);
                          } catch (e) {
                            setMessages(snapshot);
                            alert('Could not delete this message.');
                          }
                        }}
                      >
                        Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            });
          })()}
        </div>
      </ThreadMessageGroup>
    );
  }, [
    groupedMessages,
    myUserId,
    user?.user_type,
    clientAvatarUrl,
    clientName,
    artistAvatarUrl,
    artistName,
    resolveListingViewUrl,
    quotes,
    // ensure UI responds to local toggles and badges
    reactionPickerFor,
    actionMenuFor,
    reactions,
    copiedFor,
    highlightFor,
  ]);

  // Hide artist inline quote composer for pure inquiry threads created from profile page
  // Also treat threads started via message-threads/start (no booking details/quotes yet) as inquiries
  const isInquiryThread = useMemo(() => {
    try {
      // Explicit inquiry card
      for (const m of messages) {
        if (normalizeType(m.message_type) !== 'SYSTEM') continue;
        const key = (m as any).system_key ? String((m as any).system_key).toLowerCase() : '';
        if (key === 'inquiry_sent_v1') return true;
        const raw = String((m as any).content || '');
        if (raw.startsWith('{') && raw.includes('inquiry_sent_v1')) return true;
      }
      // Implicit inquiry: first messages but no quotes or booking details yet
      const hasQuoteLike = messages.some(
        (m) => Number(m.quote_id) > 0 || (normalizeType(m.message_type) === 'SYSTEM' && m.action === 'review_quote')
      );
      if (hasQuoteLike) return false;
      const hasClientUserMsg = messages.some(
        (m) => normalizeType(m.message_type) !== 'SYSTEM' && m.sender_type === 'client'
      );
      const hasDetails = Boolean(parsedBookingDetails) || Boolean(bookingRequest?.travel_breakdown);
      // If we have a client intro but no details/quotes yet, consider it an inquiry
      if (hasClientUserMsg && !hasDetails) return true;
    } catch {}
    return false;
  }, [messages, parsedBookingDetails, bookingRequest]);

  // ---- System message rendering (centralized)
  const renderSystemLine = useCallback((msg: ThreadMessage) => {
    const key = (msg.system_key || '').toLowerCase();
    let label = systemLabel(msg);
    const rawContent = String(msg.content || '').trim();

    const actions: React.ReactNode[] = [];

    // Custom inline inquiry card with image + CTA
    if (key === 'inquiry_sent_v1') {
      let card: any = null;
      try {
        const raw = String((msg as any).content || '');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.inquiry_sent_v1) card = parsed.inquiry_sent_v1;
      } catch {}
      if (card) {
        const cardViewUrl = resolveListingViewUrl(card.view);
        const isSelf = myUserId && msg.sender_id === myUserId;
        const alignClass = isSelf ? 'ml-auto' : 'mr-auto';
        const dateOnly = card.date ? String(card.date).slice(0, 10) : null;
        const prettyDate = (() => {
          if (!dateOnly) return null;
          const d = new Date(dateOnly);
          return isValid(d) ? format(d, 'd LLL yyyy') : dateOnly;
        })();
        return (
          <div className={`my-2 ${alignClass} w-full md:w-1/3 md:max-w-[480px] group relative`} role="group" aria-label="Inquiry sent">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-600 font-medium">{t('system.inquirySent', 'Inquiry sent')}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{card.title || t('system.listing', 'Listing')}</div>
                </div>
                {card.cover && (
                  <SafeImage src={card.cover} alt="" width={56} height={56} className="ml-auto h-14 w-14 rounded-lg object-cover" sizes="56px" />
                )}
              </div>
              {(prettyDate || card.guests) && (
                <div className="mt-2 text-xs text-gray-600">
                  {[prettyDate, card.guests ? `${card.guests} guest${Number(card.guests) === 1 ? '' : 's'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
              {cardViewUrl && (
                <div className="mt-3">
                  <a
                    href={cardViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white hover:no-underline focus:text-white active:text-white"
                  >
                    {t('system.viewListing', 'View listing')}
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    if (key.startsWith('listing_approved_v1') || key.startsWith('listing_rejected_v1')) {
      const isApproved = key.includes('approved');
      const raw = String(msg.content || '');
      const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
      const heading = lines.find((line) => /^listing\s+(approved|rejected)/i.test(line)) || lines[0] || '';
      const title = heading.includes(':') ? heading.split(':').slice(1).join(':').trim() : heading;
      const reasonLine = lines.find((line) => /^reason:/i.test(line));
      const reason = reasonLine ? reasonLine.split(':').slice(1).join(':').trim() : null;
      const viewLine = lines.find((line) => /^view listing:/i.test(line));
      const viewUrlRaw = viewLine ? viewLine.split(':').slice(1).join(':').trim() : null;
      const supportLine = lines.find((line) => /^need help/i.test(line));
      const alignClass = msg.sender_id === myUserId ? 'ml-auto' : 'mr-auto';
      const palette = isApproved
        ? {
            border: 'border-emerald-200',
            bg: 'bg-emerald-50',
            iconBg: 'bg-emerald-600',
            iconFg: 'text-white',
            titleColor: 'text-emerald-900',
            accent: 'text-emerald-700',
          }
        : {
            border: 'border-amber-200',
            bg: 'bg-amber-50',
            iconBg: 'bg-amber-500',
            iconFg: 'text-white',
            titleColor: 'text-amber-900',
            accent: 'text-amber-700',
          };

      const icon = isApproved ? (
        <CheckCircleIcon className={`h-5 w-5 ${palette.iconFg}`} aria-hidden="true" />
      ) : (
        <ExclamationTriangleIcon className={`h-5 w-5 ${palette.iconFg}`} aria-hidden="true" />
      );

      const resolvedViewUrl = resolveListingViewUrl(viewUrlRaw);

      return (
        <div className={`my-3 ${alignClass} w-full md:w-1/2 md:max-w-[520px]`} role="group" aria-label={isApproved ? t('system.listingApproved', 'Listing approved') : t('system.listingRejected', 'Listing rejected')}>
          <div className={`rounded-2xl border ${palette.border} ${palette.bg} p-4 shadow-sm transition-shadow hover:shadow-md`}
            data-testid="booka-moderation-card"
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${palette.iconBg}`}>
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${palette.accent}`}>
                  {isApproved ? t('system.listingApprovedTitle', 'Listing approved') : t('system.listingRejectedTitle', 'Listing rejected')}
                </p>
                <p className={`mt-1 text-sm font-semibold ${palette.titleColor} truncate`}>
                  {title || t('system.listingTitleFallback', 'Listing update')}
                </p>
                {reason && !isApproved && (
                  <p className="mt-2 text-xs text-gray-700" data-testid="booka-moderation-reason">
                    {reason}
                  </p>
                )}
                {supportLine && (
                  <p className="mt-2 text-[11px] text-gray-600">
                    {supportLine.replace(/^need help\??\s*/i, '') || supportLine}
                  </p>
                )}
                {resolvedViewUrl && (
                  <div className="mt-3">
                    <a
                      href={resolvedViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
                    >
                      {t('system.viewListing', 'View listing')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Sound supplier invite card
    if (/preferred sound supplier/i.test(rawContent)) {
      const match = rawContent.match(/preferred sound supplier for\s+(.+?)(?:\.|$)/i);
      const program = match ? match[1].trim() : t('system.soundSupplierDefault', 'this Live Experience');
      const alignClass = msg.sender_id === myUserId ? 'ml-auto' : 'mr-auto';
      return (
        <div className={`my-3 ${alignClass} w-full md:w-1/2 md:max-w-[520px]`} data-testid="sound-supplier-invite">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <SparklesIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                  {t('system.soundSupplierInvite', 'Preferred supplier invite')}
                </p>
                <p className="mt-1 text-sm font-semibold text-indigo-900 truncate">
                  {t('system.soundSupplierFor', 'for {program}', { program })}
                </p>
                <p className="mt-2 text-xs text-indigo-900">
                  {t('system.soundSupplierInstructions', 'Please submit your indoor and outdoor tier pricing so we can book you quickly for this experience.')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => respondToSupplierInvite(msg.id, 'accept', program)}
                    disabled={supplierInviteAction?.msgId === msg.id}
                    className="!py-1 !px-3 !min-h-0 !min-w-0 text-xs"
                  >
                    {supplierInviteAction?.msgId === msg.id && supplierInviteAction?.choice === 'accept'
                      ? t('system.soundSupplierAccepting', 'Accepting...')
                      : t('system.soundSupplierAccept', 'Accept invite')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => respondToSupplierInvite(msg.id, 'decline', program)}
                    disabled={supplierInviteAction?.msgId === msg.id}
                    className="!py-1 !px-3 !min-h-0 !min-w-0 text-xs"
                  >
                    {supplierInviteAction?.msgId === msg.id && supplierInviteAction?.choice === 'decline'
                      ? t('system.soundSupplierDeclining', 'Declining...')
                      : t('system.soundSupplierDecline', 'Decline')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Receipt download (payment received / receipt available)
    if (key === 'payment_received' || key === 'receipt_available' || key === 'download_receipt' || /\breceipt\b/i.test(label)) {
      let url = bookingDetails?.payment_id
        ? `/api/v1/payments/${bookingDetails.payment_id}/receipt`
        : paymentInfo?.receiptUrl || null;
      if (!url && typeof (msg as any).content === 'string') {
        const m = (msg as any).content.match(/(https?:\/\/[^\s]+\/api\/v1\/payments\/[^\s/]+\/receipt|\/?api\/v1\/payments\/[^\s/]+\/receipt)/i);
        if (m) url = m[1].startsWith('http') ? m[1] : `${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      }
      // Keep relative URL if same-origin; external absolute URLs pass through
      if (url) {
        actions.push(
          <a
            key="dl-receipt"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[11px] text-indigo-700 underline hover:text-indigo-800"
          >
            {t('system.downloadReceipt', 'Download receipt')}
          </a>
        );
      }
    }

    // Deposit flow removed: clients pay full upfront; do not inject deposit CTAs

    // Review request CTA
    if (key === 'review_request' && onShowReviewModal) {
      actions.push(
        <Button
          key="leave-review"
          type="button"
          onClick={() => onShowReviewModal(true)}
          className="ml-2 !py-0.5 !px-2 !text-[11px]"
        >
          {t('system.leaveReview', 'Leave review')}
        </Button>
      );
    }

    // Event reminder: compute days left and format label; also handle inline variants
    if (key.startsWith('event_reminder')) {
      let eventDate: Date | undefined;
      const rawDate = (parsedBookingDetails as any)?.date || (bookingDetails as any)?.start_time || undefined;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) eventDate = d;
      }
      if (eventDate) {
        const today = startOfDay(new Date());
        const days = Math.max(0, differenceInCalendarDays(startOfDay(eventDate), today));
        // Override label with normalized copy when we can compute
        const niceDate = format(eventDate, 'yyyy-MM-dd');
        // Prefer a relative URL as in backend examples
        let calUrl: string | null = null;
        if ((bookingDetails as any)?.id) {
          const bid = (bookingDetails as any).id as number;
          calUrl = `/api/v1/bookings/${bid}/calendar.ics`;
        }
        // Inline label with raw URL instead of a button
        label = calUrl
          ? t(
              'system.eventReminderShortWithCal',
              'Event in {n} days: {date}. Add to calendar: {url}. If not done yet, please finalise event prep.',
              { n: String(days), date: niceDate, url: calUrl }
            )
          : t(
              'system.eventReminderShort',
              'Event in {n} days: {date}. Please finalise event prep.  Add to calendar: {url}.',
              { n: String(days), date: niceDate,  url: calUrl }
            );
      }
    } else {
      // Fallback: detect inline event reminder text even if system_key isn't set as expected
      const raw = String((msg as any).content || '');
      const match = raw.match(/\bEvent\s+in\s+(\d+)\s+days:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ T]\d{2}:\d{2})?/i);
      if (match) {
        const n = match[1];
        const d = match[2];
        // Extract calendar URL and include it inline in the label
        let calUrl: string | null = null;
        const m = raw.match(/add\s+to\s+calendar:\s*(https?:\/\/\S+|\/\S*)/i);
        if (m) calUrl = /^https?:\/\//i.test(m[1]) ? m[1] : `${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
        label = calUrl
          ? t('system.eventReminderShortWithCal', 'Event in {n} days: {date}. Add to calendar: {url}. If not done yet, please finalise event prep.', { n, date: d, url: calUrl })
          : t('system.eventReminderShort', 'Event in {n} days: {date}. If not done yet, please finalise event prep.', { n, date: d });
      }
    }

    // Detect "View listing: <url>" to surface a clean CTA button
    try {
      const raw = String((msg as any).content || '');
      const mView = raw.match(/view\s+listing\s*:\s*(https?:\/\/\S+|\/\S*)/i);
      if (mView) {
        let vurl = mView[1];
        if (!/^https?:\/\//i.test(vurl)) vurl = `${vurl.startsWith('/') ? '' : '/'}${vurl}`;
        actions.push(
          <a
            key="view-listing"
            href={vurl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[11px] text-indigo-700 underline hover:text-indigo-800"
          >
            {t('system.viewListing', 'View listing')}
          </a>
        );
      }
    } catch {}

    // Remove any inline receipt URL from the label; we surface a clean CTA instead
    const displayLabel = (() => {
      const stripped = String(label || '')
        .replace(/receipt:\s*(https?:\/\/\S+|\/\S*)/gi, '')
        // Keep "Add to calendar" URL for event reminders; strip elsewhere
        [key.startsWith('event_reminder') ? 'replaceAll' : 'replace'](/add\s+to\s+calendar:\s*(https?:\/\/\S+|\/\S*)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return stripped || String(label || '').trim();
    })();

    // Centered divider style: lines left/right, text in middle; actions below
    const isBookaModeration = key.startsWith('listing_approved_v1') || key.startsWith('listing_rejected_v1');
    return (
      <div className="my-3">
        {isBookaModeration && (
          <div className="flex items-center justify-center mb-1">
            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold">
              Booka
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="px-2 bg-white text-gray-600 max-w-[75%] text-center break-words">
            {displayLabel}
          </span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>
        {actions.length > 0 && (
          <div className="mt-2 flex items-center justify-center gap-2">
            {actions}
          </div>
        )}
      </div>
    );
  }, [
    bookingDetails,
    paymentInfo,
    quotes,
    isClientViewFlag,
    isPaidFlag,
    isPaymentOpen,
    openPaymentModal,
    bookingRequestId,
    onShowReviewModal,
    parsedBookingDetails,
    respondToSupplierInvite,
    supplierInviteAction,
    t,
    myUserId,
    resolveListingViewUrl,
  ]);

  // ---- Reactions helpers (persisted)
  const toggleReaction = useCallback(async (msgId: number, emoji: string) => {
    // compute has from latest myReactions snapshot
    const hasNow = (myReactions[msgId] || new Set<string>()).has(emoji);

    // optimistic: compute from latest state snapshots safely using functional updates
    let committedCounts: Record<string, number> = {};
    setReactions((prev) => {
      const msgSnapshot = messages.find((m) => m.id === msgId);
      const merged = {
        ...((prev[msgId] as any) || {}),
        ...(((msgSnapshot?.reactions as any) || {}) as Record<string, number>),
      } as Record<string, number>;
      const nextCount = Math.max(0, (merged[emoji] || 0) + (hasNow ? -1 : 1));
      if (nextCount <= 0) delete merged[emoji];
      else merged[emoji] = nextCount;
      committedCounts = { ...merged };
      if (Object.keys(merged).length === 0) {
        const copy = { ...prev } as Record<number, Record<string, number>>;
        delete copy[msgId];
        return copy;
      }
      return { ...prev, [msgId]: merged };
    });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions: committedCounts } : m)));
    setMyReactions((m) => {
      const copy = new Set(m[msgId] || []) as Set<string>;
      if (hasNow) copy.delete(emoji); else copy.add(emoji);
      return { ...m, [msgId]: copy };
    });

    try {
      if (hasNow) await removeMessageReaction(bookingRequestId, msgId, emoji);
      else await addMessageReaction(bookingRequestId, msgId, emoji);
    } catch {
      // keep optimistic
    }
  }, [bookingRequestId, myReactions, messages]);

  const ReactionBar: React.FC<{ id: number }> = ({ id }) => {
    const opts = ['👍','❤️','😂','🎉','👏','🔥'];
    return (
      <div className="mt-1 inline-flex gap-1.5 rounded-full bg-white border border-gray-200 px-2 py-1 shadow">
        {opts.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => { toggleReaction(id, e); setReactionPickerFor(null); setActionMenuFor(null); }}
            className="text-sm rounded-full hover:bg-gray-100 px-3 py-1"
          >
            {e}
          </button>
        ))}
      </div>
    );
  };

  // Isolate complex hover actions to avoid JSX bracket/paren drift in the map callback
  const HoverActions: React.FC<{ msg: ThreadMessage; isMsgFromSelf: boolean }> = ({ msg, isMsgFromSelf }) => {
    const chevronPos = 'top-1 right-1';

    return (
      <div className={`absolute ${chevronPos} opacity-100 pointer-events-auto z-30`}>
        {/* Chevron menu */}
        <button
          type="button"
          title="More"
          className="w-4 h-4 rounded-md bg-white border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-50"
          onClick={(e) => {
            e.stopPropagation();
            setReactionPickerFor(null);
            setActionMenuFor((v) => (v === msg.id ? null : msg.id));
          }}
        >
          <ChevronDownIcon className="w-3 h-3" />
        </button>
        {/* Removed legacy absolute action menu; inline one handles actions */}
      </div>
    );
  };

  // ---- Emoji select
  const handleEmojiSelect = (emoji: { native?: string }) => {
    if (emoji?.native) setNewMessageContent((prev) => `${prev}${emoji.native}`);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  // ---- Send message
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newMessageContent.trim();
      const pendingImages = imageFiles.map((file, index) => ({
        file,
        previewUrl:
          imagePreviewUrls[index] || (typeof window !== 'undefined' ? URL.createObjectURL(file) : ''),
      }));
      const pendingAttachment = attachmentFile
        ? [{ file: attachmentFile, previewUrl: attachmentPreviewUrl || (typeof window !== 'undefined' ? URL.createObjectURL(attachmentFile) : '') }]
        : [];
      const attachments = [...pendingImages, ...pendingAttachment];

      if (!trimmed && attachments.length === 0) return;
      if (isSendingRef.current) return;

      if (attachments.length > 0 && !navigator.onLine) {
        setThreadError('Cannot send attachments while offline.');
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      setThreadError(null);

      const resetComposer = () => {
        setNewMessageContent('');
        setAttachmentFile(null);
        setAttachmentPreviewUrl(null);
        setImageFiles([]);
        setImagePreviewUrls([]);
        setUploadingProgress(0);
        setIsUploadingAttachment(false);
        setPreviewAudioDuration(null);
        setReplyTarget(null);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.rows = 1;
          textareaRef.current.focus();
        }
      };

      const finalizeMessage = (tempId: number, real: ThreadMessage) => {
        setMessages((prev) => {
          const byId = new Map<number, ThreadMessage>();
          let tempLocalPreview: string | null = null;
          let tempWasAudio = false;
          let clientKey: string | undefined = undefined;
          for (const m of prev) {
            if (m.id === tempId) {
              const ct = String((m.attachment_meta as any)?.content_type || '').toLowerCase();
              tempWasAudio = ct.startsWith('audio/');
              tempLocalPreview = (m as any)?.local_preview_url || null;
              clientKey = (m as any)?.client_key as string | undefined;
              continue;
            }
            byId.set(m.id, m);
          }
          // For audio, do not carry local blob preview into the finalized message.
          // This avoids rendering a blob that can fail on some devices.
          const carryPreview = tempWasAudio ? null : (tempLocalPreview || null);
          const merged = { ...real, local_preview_url: carryPreview } as any;
          if (clientKey) merged.client_key = clientKey;
          byId.set(real.id, merged);
          const next = Array.from(byId.values()).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
          writeCachedMessages(bookingRequestId, next);
          return next;
        });
        setUploadProgressById((prev) => {
          const next = { ...prev };
          delete next[tempId];
          return next;
        });
        try {
          if (typeof window !== 'undefined') {
            const previewText = String(real.content || '').slice(0, 160);
            window.dispatchEvent(
              new CustomEvent('thread:preview', {
                detail: { id: bookingRequestId, content: previewText, ts: real.timestamp, unread: false },
              }),
            );
            // Avoid immediately emitting threads:updated to prevent duplicate preview flashes;
            // the preview event updates the list instantly and backend broadcasts will follow.
          }
        } catch {}
      };

      const createOptimisticMessage = (
        tempId: number,
        partial: Partial<ThreadMessage>,
      ): ThreadMessage => {
        const clientKey = `tmp-${tempId}-${Date.now()}`;
        const optimistic: ThreadMessage = {
          id: tempId,
          // @ts-ignore – internal rendering helper to keep keys stable
          client_key: clientKey,
          booking_request_id: bookingRequestId,
          sender_id: myUserId,
          sender_type: user?.user_type === 'service_provider' ? 'service_provider' : 'client',
          content: partial.content ?? '',
          message_type: (partial.message_type as MessageKind) || 'USER',
          quote_id: null,
          attachment_url: partial.attachment_url ?? null,
          attachment_meta: (partial.attachment_meta as AttachmentMeta | null) ?? null,
          visible_to: 'both',
          action: null,
          avatar_url: undefined,
          expires_at: null,
          unread: false,
          is_read: true,
          timestamp: gmt2ISOString(),
          status: partial.status ?? (navigator.onLine ? 'sending' : 'queued'),
          reply_to_message_id: partial.reply_to_message_id ?? null,
          reply_to_preview: partial.reply_to_preview ?? null,
          local_preview_url: partial.local_preview_url ?? null,
        };
        setMessages((prev) => mergeMessages(prev, optimistic));
        return optimistic;
      };

      try {
        let replyId: number | null = replyTarget?.id ?? null;

        if (trimmed) {
          const tempId = -Date.now();
          createOptimisticMessage(tempId, {
            content: trimmed,
            reply_to_message_id: replyId,
            reply_to_preview: replyTarget ? replyTarget.content.slice(0, 120) : null,
          });
          const payload: MessageCreate = {
            content: trimmed,
            reply_to_message_id: replyId ?? undefined,
          };

          if (!navigator.onLine) {
            enqueueMessage({ tempId, payload });
          } else {
            try {
              const res = await postMessageToBookingRequest(bookingRequestId, payload);
              const real = { ...normalizeMessage(res.data), status: 'sent' as const } as ThreadMessage;
              finalizeMessage(tempId, real);
            } catch (err) {
              console.error('Failed to send message:', err);
              setMessages((prev) => {
                const next = prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' as const } : m));
                writeCachedMessages(bookingRequestId, next);
                return next;
              });
              enqueueMessage({ tempId, payload });
              setThreadError(
                `Failed to send message. ${(err as Error).message || 'Please try again later.'}`,
              );
            }
          }

          replyId = null;
        }

        if (attachments.length > 0) {
          resetComposer();
          setIsUploadingAttachment(true);

          for (let index = 0; index < attachments.length; index += 1) {
            const { file, previewUrl } = attachments[index];
            const tempId = -Date.now() - (index + 1);
            const fallbackContent = file.type.startsWith('audio/')
              ? 'Voice note'
              : file.type.startsWith('image/')
              ? '[attachment]'
              : file.name
              ? file.name
              : 'Attachment';
            const optimisticMeta: AttachmentMeta = {
              original_filename: file.name || null,
              content_type: file.type || null,
              size: Number.isFinite(file.size) ? file.size : null,
            };
            createOptimisticMessage(tempId, {
              content: fallbackContent,
              attachment_url: previewUrl || null,
              attachment_meta: optimisticMeta,
              reply_to_message_id: replyId,
              reply_to_preview: replyId && replyTarget ? replyTarget.content.slice(0, 120) : null,
              local_preview_url: previewUrl || null,
            });
            setUploadProgressById((prev) => ({ ...prev, [tempId]: 0 }));

            try {
              try { uploadAbortRef.current?.abort(); } catch {}
              uploadAbortRef.current = new AbortController();
              const uploadRes = await uploadMessageAttachment(
                bookingRequestId,
                file,
                (evt) => {
                  if (evt.total) {
                    const pct = Math.round((evt.loaded * 100) / evt.total);
                    setUploadingProgress(pct);
                    setUploadProgressById((prev) => ({ ...prev, [tempId]: pct }));
                  }
                },
                uploadAbortRef.current?.signal,
              );

              const payload: MessageCreate = {
                content: fallbackContent,
                attachment_url: uploadRes.data.url,
                attachment_meta: uploadRes.data.metadata ?? optimisticMeta,
                reply_to_message_id: replyId ?? undefined,
              };

              const res = await postMessageToBookingRequest(bookingRequestId, payload);
              const real = { ...normalizeMessage(res.data), status: 'sent' as const } as ThreadMessage;
              finalizeMessage(tempId, real);
              // Keep audio blob URLs a bit longer as a primary source for freshly
              // sent voice notes on mobile; remote URLs can take a moment.
              if (!(file.type || '').toLowerCase().startsWith('audio/')) {
                revokeObjectUrlSoon(previewUrl);
              }
            } catch (err) {
              console.error('Failed to send attachment:', err);
              setMessages((prev) => {
                const next = prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m));
                writeCachedMessages(bookingRequestId, next);
                return next;
              });
              setUploadProgressById((prev) => {
                const n = { ...prev };
                delete n[tempId];
                return n;
              });
              setThreadError(
                `Failed to send attachment ${file.name || ''}. ${
                  (err as Error).message || 'Please try again later.'
                }`.trim(),
              );
            } finally {
              replyId = null;
              setUploadingProgress(0);
            }
          }

          setIsUploadingAttachment(false);
        } else {
          resetComposer();
        }

        onMessageSent?.();
      } catch (err) {
        console.error('Failed to send message:', err);
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [
      newMessageContent,
      attachmentFile,
      attachmentPreviewUrl,
      imageFiles,
      imagePreviewUrls,
      bookingRequestId,
      onMessageSent,
      myUserId,
      user?.user_type,
      enqueueMessage,
      replyTarget,
    ],
  );

  // ---- Quote actions
  const handleSendQuote = useCallback(
    async (quoteData: QuoteV2Create) => {
      try {
        const res = await createQuoteV2(quoteData);
        const created = res.data;
        setQuote(created);
        // No drawer — QuoteBubble modal presents details via "View quote".
        void fetchMessages({ mode: 'incremental', force: true, reason: 'quote-send' });
        onMessageSent?.();
        onQuoteSent?.();
        refreshBookingRequest();
      } catch (err) {
        console.error('Failed to send quote:', err);
        setThreadError(`Failed to send quote. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [
      fetchMessages,
      onMessageSent,
      onQuoteSent,
      bookingRequestId,
      myUserId,
      user?.user_type,
      clientName,
      refreshBookingRequest,
    ],
  );

  const handleDeclineRequest = useCallback(async () => {
    try {
      await updateBookingRequestArtist(bookingRequestId, { status: 'request_declined' });
      void fetchMessages({ mode: 'incremental', force: true, reason: 'request-decline' });
      onMessageSent?.();
      refreshBookingRequest();
    } catch (err) {
      console.error('Failed to decline request:', err);
      setThreadError(`Failed to decline request. ${(err as Error).message || 'Please try again.'}`);
    }
  }, [bookingRequestId, fetchMessages, onMessageSent, refreshBookingRequest]);

  const handleAcceptQuote = useCallback(
    async (quote: QuoteV2) => {
      let bookingSimple: BookingSimple | null = null;
      try {
        const res = await acceptQuoteV2(quote.id, serviceId);
        bookingSimple = res.data;
      } catch (err) {
        console.error('Failed to accept quote:', err);
        setThreadError(`Failed to accept quote. ${(err as Error).message || 'Please try again.'}`);
        return;
      }

      try {
        const freshQuote = await getQuoteV2(quote.id);
        setQuote(freshQuote.data);

        const bookingId = freshQuote.data.booking_id;
        if (!bookingId) throw new Error('Booking not found after accepting quote');

        const details = await getBookingDetails(bookingId);
        // Store details, but only consider confirmed after payment completes
        setBookingDetails(details.data);

        // Payment modal (triggered separately via onPayNow) will update status
        void fetchMessages({ mode: 'incremental', force: true, reason: 'quote-accept' });
        refreshBookingRequest();
      } catch (err) {
        console.error('Failed to finalize quote acceptance process:', err);
        setThreadError(`Quote accepted, but there was an issue setting up payment. ${(err as Error).message || 'Please try again.'}`);
      }
    },
    [
      bookingRequestId,
      fetchMessages,
      serviceId,
      onBookingConfirmedChange,
      myUserId,
      user?.user_type,
      clientName,
      refreshBookingRequest,
    ],
  );

  const handleDeclineQuote = useCallback(
    async (quote: QuoteV2) => {
      try {
        await declineQuoteV2(quote.id);
        const updatedQuote = await getQuoteV2(quote.id);
        setQuote(updatedQuote.data);
        refreshBookingRequest();
      } catch (err) {
        console.error('Failed to decline quote:', err);
        setThreadError('Failed to decline quote. Please refresh and try again.');
      }
    },
    [refreshBookingRequest],
  );

  // Emit booking context for header menus (additive, safe)
  useEffect(() => {
    const accepted = Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id);
    const bid = (bookingDetails as any)?.id || (accepted as any)?.booking_id || null;
    try { (window as any).__currentBookingId = bid; } catch {}
    try { window.dispatchEvent(new Event('booking:context')); } catch {}
    return () => {
      try { (window as any).__currentBookingId = null; } catch {}
      try { window.dispatchEvent(new Event('booking:context')); } catch {}
    };
  }, [bookingDetails?.id, quotes]);

  // Collapsible state for Event Prep card
  const [eventPrepCollapsed, setEventPrepCollapsed] = useState(true);

  // ---- Request a new quote (client)
  const handleRequestNewQuote = useCallback(async () => {
    try {
      const text = 'Hi! It looks like the quote expired. Could you please send a new quote?';
      const res = await postMessageToBookingRequest(bookingRequestId, { content: text });
      setMessages((prev) => {
        const next = mergeMessages(prev, normalizeMessage(res.data));
        writeCachedMessages(bookingRequestId, next);
        return next;
      });
      setThreadError(null);
    } catch (err) {
      console.error('Failed to request new quote:', err);
      setThreadError('Failed to request a new quote. Please try again.');
    }
  }, [bookingRequestId]);

  // ---- Details panel blur on mobile
  useEffect(() => {
    if (isDetailsPanelOpen) {
      textareaRef.current?.blur();
      setShowEmojiPicker(false);
    }
  }, [isDetailsPanelOpen]);

  // Keep last message visible by padding the scroll area a tiny amount only.
  // Do not pad by composer height to avoid large jumps while typing.
  const effectiveBottomPadding = `calc(${BOTTOM_GAP_PX}px + env(safe-area-inset-bottom))`;
  const hasSendable = useMemo(
    () => newMessageContent.trim().length > 0 || Boolean(attachmentFile) || imageFiles.length > 0,
    [newMessageContent, attachmentFile, imageFiles.length],
  );

  const containerClasses = 'relative flex-1 min-h-0 flex flex-col gap-3 bg-white px-3 overflow-x-hidden overflow-y-hidden';

  // Composer height changes are handled implicitly by Virtuoso layout.

  // ===== Render ===============================================================
  return (
    <div ref={wrapperRef} className="relative flex flex-col rounded-b-2xl overflow-hidden w-full bg-white h-full min-h-0">
      {/* Messages */}
      <div className={containerClasses} style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overflowX: 'hidden' }}>
        {!transport.online && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-900"
            role="status"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
            <span>You're offline. We’ll sync this conversation when you’re back online.</span>
          </div>
        )}
        {loading && (
          <div className="py-2 space-y-2" aria-hidden="true">
            <div className="flex w-full">
              <div className="max-w-[65%] rounded-2xl rounded-bl-none bg-gray-100 h-12 animate-pulse" />
            </div>
            <div className="flex w-full justify-end">
              <div className="max-w-[55%] rounded-2xl rounded-br-none bg-gray-100 h-8 animate-pulse" />
            </div>
            <div className="flex w-full">
              <div className="max-w-[72%] rounded-2xl rounded-bl-none bg-gray-100 h-16 animate-pulse" />
            </div>
          </div>
        )}
        {!loading && (
          visibleMessages.length === 0 && !isSystemTyping && (
            <div className="text-center py-4">
              {user?.user_type === 'client' ? (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.client', 'Your request is in - expect a quote soon. Add any notes or questions below.')}
                  <>
                    <span className="mx-1">·</span>
                    <button
                      type="button"
                      className="text-xs font-medium text-gray-600 underline underline-offset-2"
                      onClick={() => onOpenDetailsPanel?.()}
                    >
                      {t('chat.empty.viewDetails', 'View details')}
                    </button>
                  </>
                </p>
              ) : user?.user_type === 'service_provider' ? (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.artist', 'No messages yet—say hi or share details. You can send a quick quote when you’re ready.')}
                </p>
              ) : (
                <p className="text-xs text-gray-600">
                  {t('chat.empty.default', 'Start the conversation whenever you’re ready.')}
                </p>
              )}
            </div>
          )
        )}

        {!loading && user?.user_type === 'service_provider' && !bookingConfirmed && !hasSentQuote && !isPersonalizedVideo && !!bookingRequest && !isModerationThread && !isInquiryThread && (
          <div
            className="max-h-[70vh] overflow-auto overscroll-contain pr-1"
            data-testid="artist-inline-quote"
            aria-label={t('chat.inlineQuote', 'Inline Quote')}
          >
            <MemoInlineQuoteForm
              artistId={currentArtistId}
              clientId={currentClientId}
              bookingRequestId={bookingRequestId}
              serviceName={computedServiceName}
              initialBaseFee={baseFee}
              initialTravelCost={travelFee}
              initialSoundNeeded={initialSound}
              initialSoundCost={initialSoundCost}
              calculationParams={calculationParams}
              onSubmit={handleSendQuote}
              onDecline={handleDeclineRequest}
              eventDetails={eventDetails}
            />
          </div>
        )}

        {/* Grouped messages (virtualized when enabled) */}
        <div
          ref={virtualizationHostRef}
          className="relative flex-1 min-h-[80px] overflow-hidden flex"
          style={{ paddingBottom: effectiveBottomPadding }}
          data-thread-virtuoso-host
        >
          {virtuosoViewportHeight > 0 ? (
            <Virtuoso
              ref={virtuosoRef}
              key={bookingRequestId}
              totalCount={groupedMessages.length}
              computeItemKey={(index) => groupIds[index]}
              itemContent={(index: number) => <div className="w-full">{renderGroupAtIndex(index)}</div>}
              // Open at bottom but do not animate scrolling on first render
              followOutput={true}
              initialTopMostItemIndex={groupedMessages.length > 0 ? groupedMessages.length - 1 : 0}
              style={{ height: Math.max(1, virtuosoViewportHeight), width: '100%' }}
              atBottomStateChange={(atBottom: boolean) => {
                setShowScrollButton(!atBottom);
                setIsUserScrolledUp(!atBottom);
                atBottomRef.current = atBottom;
                // If the user anchored at bottom after initial load, flush read receipts now.
                if (atBottom) {
                  try { scheduleMarkRead(messagesRef.current, 'hydrate'); } catch {}
                }
              }}
              increaseViewportBy={{ top: 400, bottom: 600 }}
              overscan={200}
            />
          ) : (
            <div className="w-full" style={{ minHeight: '50vh' }} aria-hidden="true" />
          )}
        </div>

        {typingIndicator && <p className="text-xs text-gray-500" aria-live="polite">{typingIndicator}</p>}

        {/* messagesEnd anchor removed (virtualized) */}
      </div>

      {/* No skeleton or spinner per request */}

      {/* Mobile reaction overlay: global scrim + centered picker */}
      {reactionPickerFor !== null && actionMenuFor === null && isMobile && (
        <div className="sm:hidden fixed inset-0 z-[2000]">
          <button
            type="button"
            aria-label="Close reactions"
            className="absolute inset-0 bg-black/30"
            onClick={() => setReactionPickerFor(null)}
          />
          <div className="relative w-full h-full flex items-center justify-center">
            <div ref={reactionPickerRefMobile}>
              <ReactionBar id={reactionPickerFor} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile overlay: dim screen; center received actions; show reactions above */}
      {actionMenuFor !== null && isMobile && (
        <div className="fixed inset-0 z-[2000] sm:hidden">
          <button
            type="button"
            aria-label="Close actions"
            className="absolute inset-0 bg-white/70 backdrop-blur-sm z-[2001]"
            onClick={() => { setActionMenuFor(null); setReactionPickerFor(null); }}
          />
          {(() => {
            const msg = messages.find((m) => m.id === actionMenuFor);
            const isFromSelf = msg ? (msg.sender_id === myUserId) : false;
            return (
              <div className="relative w-full h-full flex items-center justify-center px-6 pointer-events-none">
                <div className="w-full max-w-sm flex flex-col items-stretch gap-3 z-[2002] pointer-events-auto">
                  {/* Reactions row on top for mobile */}
                  {reactionPickerFor !== null && (
                    <div ref={reactionPickerRefMobile} className="flex items-center justify-center">
                      <ReactionBar id={reactionPickerFor} />
                    </div>
                  )}
                  {/* Target message preview */}
                  {msg && (
                    <div className="w-full">
                      {(() => {
                        const bubbleBase = isFromSelf ? 'bg-blue-50 text-gray-900 whitespace-pre-wrap break-words' : 'bg-gray-50 text-gray-900 whitespace-pre-wrap break-words';
                        const bubbleClasses = `${bubbleBase} rounded-xl`;
                        const isImg = isImageAttachment(msg.attachment_url || undefined);
                        return (
                          <div className={`px-3 py-2 text-[13px] leading-snug ${bubbleClasses}`}>
                            {isImg ? (
                              <span>Image</span>
                            ) : (
                              <span className="block max-h-24 overflow-hidden">{msg.content}</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* Actions list for both sent and received */}
                  {msg && (
                    <div ref={actionMenuRef} className="rounded-md border border-gray-200 bg-white shadow-lg">
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          try {
                            const parts: string[] = [];
                            if (msg.content) parts.push(msg.content);
                            if (msg.attachment_url) parts.push(toApiAttachmentsUrl(msg.attachment_url));
                            void navigator.clipboard.writeText(parts.join('\n'));
                          } catch (e) {
                            console.error('Copy failed', e);
                          } finally {
                            setActionMenuFor(null);
                            setCopiedFor(msg.id);
                            setTimeout(() => setCopiedFor((v) => (v === msg.id ? null : v)), 1200);
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          setReplyTarget(msg);
                          setReactionPickerFor(null);
                          setActionMenuFor(null);
                        }}
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onClick={() => {
                          setReactionPickerFor(msg.id);
                        }}
                      >
                        React
                      </button>
                      {msg.attachment_url && (
                        <button
                          type="button"
                          className="block w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                          onClick={async () => {
                            try {
                              const url = toApiAttachmentsUrl(msg.attachment_url!);
                              const res = await fetch(url, { credentials: 'include' as RequestCredentials });
                              if (!res.ok) throw new Error(String(res.status));
                              const blob = await res.blob();
                              const a = document.createElement('a');
                              const objectUrl = URL.createObjectURL(blob);
                              a.href = objectUrl;
                              a.download = url.split('/').pop() || 'file';
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              URL.revokeObjectURL(objectUrl);
                            } catch (err) {
                              try { window.open(toApiAttachmentsUrl(msg.attachment_url!), '_blank', 'noopener,noreferrer'); } catch {}
                            } finally {
                              setActionMenuFor(null);
                            }
                          }}
                        >
                          Download
                        </button>
                      )}
                      {isFromSelf && (
                        <button
                          type="button"
                          className="block w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            setActionMenuFor(null);
                            const ok = typeof window !== 'undefined' ? window.confirm('Delete this message?') : true;
                            if (!ok) return;
                            const snapshot = messages;
                            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                            try {
                              const bid = bookingDetails?.id || (parsedBookingDetails as any)?.id;
                              if (bid) await deleteMessageForBookingRequest(bookingRequestId, msg.id);
                            } catch (e) {
                              setMessages(snapshot);
                              console.error('Delete failed', e);
                              alert('Could not delete this message.');
                            }
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}


      {/* Scroll-to-bottom (mobile only) — hidden while details panel is open */}
      {showScrollButton && !isDetailsPanelOpen && (
        <button
          type="button"
          aria-label="Scroll to latest message"
          onClick={() => {
            try {
              virtuosoRef.current?.scrollToIndex?.({ index: Math.max(0, groupedMessages.length - 1), align: 'end', behavior: 'smooth' });
            } catch {}
            setShowScrollButton(false);
            setIsUserScrolledUp(false);
          }}
          className="fixed bottom-24 right-6 z-50 md:hidden rounded-full bg-indigo-600 p-3 text-white shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25L12 15.75 4.5 8.25" />
          </svg>
        </button>
      )}

      {/* Details Card Modal (portal) */}
      {showDetailsCard && isPortalReady && createPortal(
        (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetailsCard(false)} aria-hidden="true" />
            <div role="dialog" aria-modal="true" className="relative z-[10000] w-full sm:max-w-md md:max-w-lg bg-white text-black rounded-2xl shadow-2xl max-h-[92vh] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-base font-semibold">Your booking details</h3>
                <button
                  type="button"
                  onClick={() => setShowDetailsCard(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Close details"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {showBookingSummarySkeleton ? (
                <div className="px-4 py-4">
                  <BookingSummarySkeleton variant="modal" />
                </div>
              ) : (
                <BookingSummaryCard
                  parsedBookingDetails={parsedBookingDetails}
                  imageUrl={bookingDetails?.service?.media_url}
                  serviceName={computedServiceName}
                  artistName={artistName}
                  bookingConfirmed={bookingConfirmed}
                  paymentInfo={paymentInfo}
                  bookingDetails={bookingDetails}
                  quotes={quotes}
                  allowInstantBooking={Boolean(allowInstantBooking && user?.user_type === 'client')}
                  openPaymentModal={openPaymentModal}
                  bookingRequestId={bookingRequestId}
                  baseFee={baseFee}
                  travelFee={travelFee}
                  initialSound={initialSound}
                  artistCancellationPolicy={artistCancellationPolicy}
                  currentArtistId={currentArtistId}
                  instantBookingPrice={instantBookingPrice}
                  // Adapt UI to service type in modal
                  showTravel={!isPersonalizedVideo}
                  showSound={!isPersonalizedVideo}
                  showPolicy={!isPersonalizedVideo}
                  showEventDetails={!isPersonalizedVideo}
                  showReceiptBelowTotal={isPersonalizedVideo}
                />
              )}
            </div>
          </div>
        ),
        document.body
      )}

      {/* Attachment preview — hide on mobile while details panel open */}
      {/* Image previews row (multiple) */}
      {imagePreviewUrls.length > 0 && (
        <div className={isDetailsPanelOpen ? 'hidden md:flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner' : 'flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner'}>
          {/* Add more images button on the left */}
          <input id="image-upload" type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImageFiles(Array.from(e.target.files || []))} />
          <label htmlFor="image-upload" className="flex-shrink-0 w-10 h-10 rounded-md border border-dashed border-gray-300 bg-white/70 text-gray-600 flex items-center justify-center cursor-pointer hover:bg-white" title="Add images">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </label>
          <div className="flex-1 flex flex-wrap items-center justify-center gap-2 overflow-hidden">
            {imagePreviewUrls.map((u, i) => (
              <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-white">
            <img src={u} alt={`Preview ${i+1}`} className="w-16 h-16 object-cover object-center" />
                <button type="button" aria-label="Remove image" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-white" onClick={() => removeImageAt(i)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-image attachment preview (audio/video/files) */}
      {attachmentPreviewUrl && attachmentFile && !attachmentFile.type.startsWith('image/') && (
        <div className={isDetailsPanelOpen ? 'hidden md:flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner' : 'flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner'}>
          {attachmentFile && (attachmentFile.type.startsWith('audio/') || /\.(webm|mp3|m4a|ogg|wav)$/i.test(attachmentFile.name || '')) ? (
            (() => {
              const isVoiceNote = /^voice-note-\d+\./i.test(attachmentFile.name || '');
              return (
                <>
                  <ChatAudioPlayer
                    initialSrc={attachmentPreviewUrl}
                    fallbacks={[attachmentPreviewUrl]}
                    original={attachmentPreviewUrl}
                    compactWidth="w-full"
                  />
                  {!isVoiceNote && (
                    <span className="text-xs text-gray-700 font-medium">
                      {attachmentFile.name} ({formatBytes(attachmentFile.size)})
                    </span>
                  )}
                </>
              );
            })()
          ) : attachmentFile && (attachmentFile.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(attachmentFile.name || '')) ? (
            <>
              <video className="w-48 rounded" controls src={attachmentPreviewUrl} preload="metadata" />
              <span className="text-xs text-gray-700 font-medium">{attachmentFile.name} ({formatBytes(attachmentFile.size)})</span>
            </>
          ) : (
            <>
              {attachmentFile?.type === 'application/pdf' ? (
                <DocumentIcon className="w-8 h-8 text-red-600" />)
                : (<DocumentTextIcon className="w-8 h-8 text-gray-600" />)}
              <span className="text-xs text-gray-700 font-medium">{attachmentFile?.name} ({formatBytes(attachmentFile.size)})</span>
            </>
          )}
          <button type="button" onClick={() => setAttachmentFile(null)} className="text-xs text-red-600 hover:text-red-700 font-medium" aria-label="Remove attachment">Remove</button>
        </div>
      )}

        {/* Composer — hidden on mobile while details panel is open, or entirely when disabled */}
      {(() => { const composerDisabled = Boolean(disableComposer || isModerationThread); return user && !composerDisabled; })() && (
        <>
          <div
            ref={composerRef}
            data-testid="composer-container"
            className={
              isDetailsPanelOpen
                ? 'hidden md:block sticky bottom-0 z-[60] pb-safe flex-shrink-0 relative backdrop-blur-xl backdrop-saturate-150 bg-white/30 dark:bg-zinc-900/35 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'
                : 'block sticky bottom-0 z-[60] pb-safe flex-shrink-0 relative backdrop-blur-xl backdrop-saturate-150 bg-white/30 dark:bg-zinc-900/35 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'
            }
          >
            {/* Event Prep: show as a bottom bar above the composer, always in view */}
            {(() => {
              const accepted = Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id);
              const bookingIdForPrep = (bookingDetails as any)?.id || (accepted as any)?.booking_id || null;
              // Show Event Prep whenever a booking exists (accepted quote created a booking),
              // do not gate on env flag to ensure it’s visible.
              return Boolean(bookingIdForPrep);
            })() && (
              <div className="px-1 border-b border-gray-100 bg-white">
                <EventPrepCard
                  bookingId={(bookingDetails as any)?.id || (Object.values(quotes).find((q: any) => q?.status === 'accepted' && q?.booking_id) as any)?.booking_id}
                  bookingRequestId={bookingRequestId}
                  eventDateISO={(bookingDetails as any)?.start_time || (parsedBookingDetails as any)?.date}
                  canEdit={Boolean(user)}
                  onContinuePrep={(id) => router.push(`/dashboard/events/${id}`)}
                  summaryOnly
                />
              </div>
            )}
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50">
                <EmojiPicker data={data} onEmojiSelect={handleEmojiSelect} previewPosition="none" />
              </div>
            )}

            {/* Reply preview row (full width, single line) */}
            {replyTarget && (
              <div className="px-2 pt-1">
                <div className="w-full rounded-md px-2 py-1 text-[12px] text-gray-700 flex items-center justify-between ring-1 ring-black/10 bg-white/70 dark:bg-white/10">
                  <div className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    Replying to {replyTarget.sender_type === 'client' ? 'Client' : 'You'}: <span className="italic text-gray-500">{replyTarget.content}</span>
                  </div>
                  <button type="button" className="ml-2 text-gray-500 hover:text-gray-700 flex-shrink-0" onClick={() => setReplyTarget(null)} aria-label="Cancel reply">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSendMessage} className="flex items-center gap-x-1.5 px-2 pt-1.5 pb-1.5">
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const imgs = files.filter((f) => f.type.startsWith('image/'));
                  const others = files.filter((f) => !f.type.startsWith('image/'));
                  if (imgs.length) addImageFiles(imgs);
                  if (others.length) setAttachmentFile(others[0]);
                }}
                accept="image/*,application/pdf,audio/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,application/rtf"
                multiple
              />
              <label
                htmlFor="file-upload"
                aria-label="Upload attachment"
                className="flex-shrink-0 w-9 h-9 grid place-items-center rounded-full cursor-pointer ring-1 ring-black/10 bg-white/55 hover:bg-white/70 text-zinc-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </label>


              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                aria-label="Add emoji"
                className="flex-shrink-0 w-9 h-9 grid place-items-center rounded-full ring-1 ring-black/10 bg-white/55 hover:bg-white/70 text-zinc-700 transition-colors"
              >
                <FaceSmileIcon className="w-5 h-5" />
              </button>

              {/* Voice note */}
              {/* Textarea (16px to avoid iOS zoom) */}
              <div className="flex-1 min-h-[40px] rounded-2xl px-3 py-2 ring-1 ring-black/10 bg-white/55 backdrop-blur-sm focus-within:ring-0">
              <textarea
                ref={textareaRef}
                value={newMessageContent}
                onChange={(e) => setNewMessageContent(e.target.value)}
                onInput={autoResizeTextarea}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                autoFocus
                rows={1}
                className="w-full bg-transparent resize-none outline-none focus:outline-none focus:ring-0 focus:border-0 text-[15px] leading-6 text-zinc-900 placeholder:text-zinc-600/70 ios-no-zoom font-medium min-h-[36px]"
                aria-label="New message input"
                disabled={isUploadingAttachment}
              />
              </div>

              {/* Right-side mic ↔ send swap */}
              <div className="relative w-9 h-9">
                {/* Send (when text or attachments) */}
                <button
                  type="submit"
                  aria-label="Send message"
                  aria-hidden={!hasSendable}
                  tabIndex={hasSendable ? 0 : -1}
                  className={[
                    'absolute inset-0 grid place-items-center rounded-full transition-all duration-200 ease-out',
                    hasSendable
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-90 pointer-events-none',
                    'bg-[#25D366] hover:bg-[#1ec45b] text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  ].join(' ')}
                  disabled={isSending || isUploadingAttachment || !hasSendable}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>

                {/* Mic (no text/attachments) */}
                <button
                  type="button"
                  aria-label={isRecording ? 'Stop recording' : 'Record voice note'}
                  aria-hidden={hasSendable}
                  tabIndex={hasSendable ? -1 : 0}
                  onClick={async () => {
                    if (hasSendable) return; // safeguard
                    if (isRecording) {
                      mediaRecorderRef.current?.stop();
                      setIsRecording(false);
                      return;
                    }
                    recordedChunksRef.current = [];
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      const candidates = ['audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/webm;codecs=opus','audio/webm','audio/ogg'];
                      const supported = (candidates as string[]).find((t) => {
                        try { return typeof (window as any).MediaRecorder !== 'undefined' && (window as any).MediaRecorder.isTypeSupported && (window as any).MediaRecorder.isTypeSupported(t); } catch { return false; }
                      }) || undefined;
                      const mr = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
                      mediaRecorderRef.current = mr;
                      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
                      mr.onstop = async () => {
                        const mime = recordedChunksRef.current[0]?.type || mediaRecorderRef.current?.mimeType || 'audio/webm';
                        const blob = new Blob(recordedChunksRef.current, { type: mime });
                        if (blob.size === 0) return;
                        const ext = /mp4/i.test(mime) ? 'm4a' : /aac/i.test(mime) ? 'aac' : /mpeg/i.test(mime) ? 'mp3' : /ogg/i.test(mime) ? 'ogg' : /wav/i.test(mime) ? 'wav' : 'webm';
                        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mime });
                        setAttachmentFile(file);
                        try { setAttachmentPreviewUrl(URL.createObjectURL(file)); } catch {}
                        try { setShowEmojiPicker(false); } catch {}
                        try { textareaRef.current?.focus(); } catch {}
                        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
                      };
                      mr.start();
                      setIsRecording(true);
                    } catch (e) {
                      console.error('Mic permission error', e);
                      alert('Microphone permission is required to record voice notes.');
                    }
                  }}
                  className={[
                    'absolute inset-0 w-9 h-9 grid place-items-center rounded-full transition-all duration-200 ease-out',
                    (newMessageContent.trim() || attachmentFile || imageFiles.length > 0)
                      ? 'opacity-0 scale-90 pointer-events-none'
                      : 'opacity-100 scale-100',
                    isRecording ? 'bg-red-600 text-white hover:bg-red-700' : 'ring-1 ring-black/10 bg-white/55 hover:bg-white/70 text-zinc-700',
                  ].join(' ')}
                >
                  {isRecording ? <XMarkIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
                </button>
              </div>
            </form>
          </div>

          {/* Leave Review (hidden on mobile when panel open) */}
          {user?.user_type === 'client' &&
            bookingDetails &&
            bookingDetails.status === 'completed' &&
            !(bookingDetails as Booking & { review?: Review }).review && (
              <div className={isDetailsPanelOpen ? 'hidden md:block' : 'block'}>
                <Button
                  type="button"
                  onClick={() => onShowReviewModal?.(true)}
                  className="mt-1.5 text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                >
                  Leave Review
                </Button>
              </div>
            )}

      {paymentModal}

      <ImagePreviewModal
        open={imageModalIndex !== null}
        src={imageModalIndex !== null ? (imageUrls[imageModalIndex] || '') : ''}
        images={imageUrls}
        index={imageModalIndex ?? 0}
        onIndexChange={(i) => setImageModalIndex(i)}
        onReply={() => {
          if (imageModalIndex !== null) {
            const msg = imageMessages[imageModalIndex];
            if (msg) setReplyTarget(msg);
          }
          setImageModalIndex(null);
        }}
        onClose={() => setImageModalIndex(null)}
      />

      {/* Generic file preview (PDF/audio/etc.) */}
      <ImagePreviewModal
        open={Boolean(filePreviewSrc)}
        src={filePreviewSrc || ''}
        onClose={() => setFilePreviewSrc(null)}
        onReply={() => {
          // Best-effort: reply to message that matches this URL (absolute or proxied)
          const m = messages.find((mm) => {
            if (!mm.attachment_url) return false;
            const abs = getFullImageUrl(mm.attachment_url) as string;
            return abs === filePreviewSrc || toProxyPath(abs) === filePreviewSrc;
          });
          if (m) setReplyTarget(m as any);
          setFilePreviewSrc(null);
        }}
      />
    </>
  )}

      {/* Quote Drawer removed */}

      {/* Errors */}


      {wsFailed && (
        <p className="text-xs text-red-600 p-4 mt-1.5" role="alert">
          Connection lost. Please refresh the page or sign in again.
        </p>
      )}
    </div>
  );
});

MessageThread.displayName = 'MessageThread';
export default React.memo(MessageThread);
