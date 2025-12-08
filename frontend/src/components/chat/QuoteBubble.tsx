// src/components/chat/QuoteBubble.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { formatDistanceToNowStrict, isAfter, isBefore } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import StatusBadge from '../ui/StatusBadge';
import { X } from 'lucide-react';
import { StarIcon, CheckBadgeIcon, MapPinIcon, CalendarDaysIcon } from '@heroicons/react/24/solid';
import SafeImage from '@/components/ui/SafeImage';
import { getServiceProviderReviews } from '@/lib/api';
import type { Review } from '@/types';
import type { QuoteTotalsResolved } from '@/lib/quoteTotals';
import { QUOTE_TOTALS_PLACEHOLDER } from '@/lib/quoteTotals';

/* ───────── Types ───────── */

type QuoteStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Expired' | 'Paid';

export interface EventDetails {
  from?: string;
  receivedAt?: string;
  event?: string;
  date?: string;
  guests?: string;
  venue?: string;
  notes?: string;
  locationName?: string;
  locationAddress?: string;
}

export interface QuotePeekProps {
  // identity & summary
  quoteId?: number | string;
  description: string;

  // amounts (subtotal optional; we’ll compute if missing)
  price?: number;
  soundFee?: number;
  travelFee?: number;
  accommodation?: string;
  discount?: number;
  subtotal?: number;
  total: number;
  totalsPreview?: QuoteTotalsResolved;
  /** Optional explicit line items (e.g. sound package + extras) for a richer breakdown. */
  lineItems?: { label: string; amount: number }[];

  // state/time
  status: QuoteStatus;
  expiresAt?: string | null;

  // context
  isClientView?: boolean;
  isPaid?: boolean;
  eventDetails?: EventDetails;
  providerName?: string;
  providerAvatarUrl?: string | null;
  providerRating?: number;
  providerRatingCount?: number;
  providerVerified?: boolean;
  providerId?: number;
  cancellationPolicy?: string | null;
  paymentTerms?: string | null; // e.g. "Full payment to Booka now"
  includes?: string[];
  excludes?: string[];
  taxes?: { label?: string; amount: number }[];
  vat?: number;
  tax?: number;
  mapUrl?: string | null;

  // actions
  onAccept?: () => void;
  onPayNow?: () => void;
  onDecline?: () => void;
  onAskQuestion?: () => void;
  disableRequestNewQuote?: boolean;
  onViewDetails?: () => void;

  className?: string;
}

/* ───────── Helpers ───────── */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!window?.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function useLockBody(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [on]);
}

/** Renders “BookaSecure™” with a small, top-right TM. */
const BookaSecureTM = () => (
  <span className="inline-flex items-baseline">
    BookaSecure
    <sup className="ml-0.5 text-[9px] relative -top-0.5 leading-none">TM</sup>
  </span>
);

/**
 * Inject BookaSecure™ into payment terms if the text mentions “BookaSecure”
 * (or “Booka Secure”, any case, with or without TM/™). Falls back to a default copy otherwise.
 */
function renderPaymentTerms(raw?: string | null): React.ReactNode {
  const fallback = (
    <>
      Pay the full amount now via <BookaSecureTM /> Checkout
    </>
  );
  if (!raw || raw.trim() === '') return fallback;

  // Split around “booka secure” (with optional whitespace) and optional TM/™ after it.
  const parts = raw.split(/(booka\s*secure(?:\s*(?:tm|™))?)/ig);
  if (parts.length === 1) return raw; // No match; return as-is.

  return (
    <>
      {parts.map((part, i) =>
        /booka\s*secure(?:\s*(?:tm|™))?/i.test(part) ? (
          <BookaSecureTM key={i} />
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

/* ───────── Component ───────── */

export default function QuotePeek(props: QuotePeekProps) {
  const {
    quoteId, description,
    price, soundFee, travelFee, accommodation, discount, subtotal, total,
    status, expiresAt, isClientView, isPaid: paidProp, eventDetails,
    providerName, providerAvatarUrl, providerRating, providerRatingCount,
    providerVerified,
    providerId,
    cancellationPolicy, paymentTerms, includes = [], excludes = [],
    taxes = [], vat, tax, mapUrl,
    onAccept, onPayNow, onDecline, onAskQuestion, onViewDetails,
    disableRequestNewQuote,
    className,
  } = props;

  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  useLockBody(open);

  // time chips
  const [expiryTick, setExpiryTick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setExpiryTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const now = new Date();
  const hasExpiry = !!expiresAt && isAfter(new Date(expiresAt), now);
  const isExpired = !!expiresAt && isBefore(new Date(expiresAt), now);
  const isPaid = Boolean(paidProp);
  const expiryText = useMemo(() => {
    if (isPaid) return 'Booking Confirmed';
    if (!expiresAt) return 'Valid until paid';
    if (isExpired)  return `Expired ${formatDistanceToNowStrict(new Date(expiresAt), { addSuffix: true })}`;
    if (hasExpiry)  return `Expires in ${formatDistanceToNowStrict(new Date(expiresAt))}`;
    return 'Valid until paid';
  }, [expiresAt, hasExpiry, isExpired, expiryTick, isPaid]);

  const isPending  = !isPaid && status === 'Pending';
  const isAccepted = !isPaid && status === 'Accepted';
  const displayStatus: QuoteStatus = isPaid ? 'Paid' : status;

  const chips: string[] = [];
  if (eventDetails?.event) chips.push(eventDetails.event);
  if (eventDetails?.guests) chips.push(`${eventDetails.guests} guests`);
  if (eventDetails?.venue) {
    const v = (eventDetails.venue || '').trim();
    const cap = v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    chips.push(cap);
  }

  const showNotes = !!eventDetails?.notes && eventDetails!.notes.trim() !== '';

  const showPrice    = typeof price === 'number' && !Number.isNaN(price);
  const showTravel   = typeof travelFee === 'number' && !Number.isNaN(travelFee);
  // Only show a separate "Sound" row when there is a positive
  // sound amount. This avoids misleading "Sound R0" rows when
  // sound is handled by third-party suppliers or provided by
  // the client.
  const showSound    = typeof soundFee === 'number' && !Number.isNaN(soundFee) && soundFee > 0;
  const showDiscount = typeof discount === 'number' && (discount ?? 0) > 0;
  const showAccom    = (accommodation ?? '').trim().length > 0;
  const lineItems = Array.isArray((props as any).lineItems)
    ? ((props as any).lineItems as { label: string; amount: number }[]).filter(
        (it) => it && typeof it.label === 'string' && Number.isFinite(Number(it.amount)),
      )
    : [];
  const hasLineItems = lineItems.length > 0;

  const safeNum = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const derivedSubtotal =
    subtotal != null && Number.isFinite(Number(subtotal))
      ? Number(subtotal)
      : [showPrice ? safeNum(price) : 0, showTravel ? safeNum(travelFee) : 0, showSound ? safeNum(soundFee) : 0, showDiscount ? -safeNum(discount) : 0]
          .reduce((a, b) => a + b, 0);

  const money = (v?: number) => formatCurrency(safeNum(v));
  const canDecide = isPending && !isExpired;

  // Human labels for date and location
  const requestedDateLabel = (eventDetails?.date || '').trim();
  const locationLabel = useMemo(() => {
    const byName = (eventDetails?.locationName || '').trim();
    const byAddr = (eventDetails?.locationAddress || '').trim();
    if (byName) return byName;
    if (byAddr) return byAddr;
    if (mapUrl) {
      try {
        const u = new URL(mapUrl);
        const q = u.searchParams.get('query');
        if (q) return decodeURIComponent(q);
      } catch {}
    }
    return '';
  }, [eventDetails?.locationName, eventDetails?.locationAddress, mapUrl]);

  // Stick to the first non-empty location label to avoid hydration flicker
  const [stableLocation, setStableLocation] = useState<string>('');
  useEffect(() => {
    const next = (locationLabel || '').trim();
    if (next && next !== stableLocation) setStableLocation(next);
  }, [locationLabel, stableLocation]);

  // For peek: a friendlier location “name”
  const peekLocationName = useMemo(() => {
    if ((eventDetails?.locationName || '').trim()) return (eventDetails!.locationName || '').trim();
    if (!mapUrl) return '';
    try {
      const q = new URL(mapUrl).searchParams.get('query') || '';
      const decoded = decodeURIComponent(q);
      const first = decoded.split(',')[0]?.trim() || '';
      if (first && !/^\d/.test(first)) return first;
    } catch {}
    return '';
  }, [eventDetails?.locationName, mapUrl]);

  // Address-only label for modal
  const addressOnlyLabel = useMemo(() => {
    const addr = (eventDetails?.locationAddress || '').trim();
    if (addr) return addr;
    if (mapUrl) {
      try {
        const q = new URL(mapUrl).searchParams.get('query') || '';
        const decoded = decodeURIComponent(q);
        const parts = decoded.split(',');
        if (parts.length > 1) return parts.slice(1).join(',').trim();
        return decoded;
      } catch {}
    }
    return '';
  }, [eventDetails?.locationAddress, mapUrl]);

  const modalLocationLabel = useMemo(() => {
    const nm = (peekLocationName || '').trim();
    const addr = addressOnlyLabel;
    if (nm) return addr ? `${nm} - ${addr}` : nm;
    return stableLocation || locationLabel;
  }, [peekLocationName, addressOnlyLabel, stableLocation, locationLabel]);

  const subtotalForVat = useMemo(() => {
    if (subtotal != null && Number.isFinite(Number(subtotal))) {
      return Number(subtotal);
    }
    return Number.isFinite(derivedSubtotal) ? derivedSubtotal : undefined;
  }, [subtotal, derivedSubtotal]);

  const vatFallback = useMemo(() => {
    const totalNumber = Number(total);
    if (!Number.isFinite(totalNumber)) return undefined;
    if (!Number.isFinite(Number(subtotalForVat))) return undefined;
    const diff = totalNumber - Number(subtotalForVat);
    return diff > 0 ? Math.round(diff * 100) / 100 : undefined;
  }, [total, subtotalForVat]);

  // All fee/VAT math comes from the backend. Show placeholders if previews are missing.
  const mergedTotals = props.totalsPreview ?? undefined;
  const providerSubtotalPreview =
    typeof mergedTotals?.providerSubtotal === 'number' && Number.isFinite(mergedTotals.providerSubtotal)
      ? mergedTotals.providerSubtotal
      : undefined;
  const platformFeeEx = typeof mergedTotals?.platformFeeExVat === 'number' ? mergedTotals.platformFeeExVat : undefined;
  const platformFeeVat = typeof mergedTotals?.platformFeeVat === 'number' ? mergedTotals.platformFeeVat : undefined;
  const clientTotal = typeof mergedTotals?.clientTotalInclVat === 'number' ? mergedTotals.clientTotalInclVat : undefined;
  const platformFeeIncl =
    platformFeeEx !== undefined && platformFeeVat !== undefined ? platformFeeEx + platformFeeVat : undefined;

  const normalizedTotal = Number(total);
  const normalizedSubtotal = Number(subtotalForVat);
  const headerAmountSource = isClientView
    ? (
      (typeof clientTotal === 'number' && Number.isFinite(clientTotal) ? clientTotal : undefined) ??
      (Number.isFinite(normalizedTotal) && normalizedTotal > 0 ? normalizedTotal : undefined) ??
      (Number.isFinite(normalizedSubtotal) && normalizedSubtotal > 0 ? normalizedSubtotal : undefined)
    )
    : (
      (Number.isFinite(normalizedTotal) && normalizedTotal > 0 ? normalizedTotal : undefined) ??
      providerSubtotalPreview ??
      (Number.isFinite(normalizedSubtotal) && normalizedSubtotal > 0 ? normalizedSubtotal : undefined)
    );
  const displayTotal = typeof headerAmountSource === 'number' ? headerAmountSource : undefined;

  // Fetch reviews lazily when the details modal opens (best effort)
  const [peekReviews, setPeekReviews] = useState<Review[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!providerId || !open) return;
      try {
        const res = await getServiceProviderReviews(providerId);
        if (!cancelled) setPeekReviews((res.data || []).slice(0, 2));
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [providerId, open]);

  const demoReviews = useMemo<Review[]>(() => {
    const name = (providerName || '').toLowerCase();
    if (name.includes('spoegwolf')) {
      return [
        { id: 1, booking_id: 0, rating: 4, comment: 'Amazing set and great energy!', created_at: '', updated_at: '' } as any,
        { id: 2, booking_id: 0, rating: 4, comment: 'Professional and on time. Crowd loved it.', created_at: '', updated_at: '' } as any,
        { id: 3, booking_id: 0, rating: 4, comment: 'Easy to work with and responsive.', created_at: '', updated_at: '' } as any,
        { id: 4, booking_id: 0, rating: 4, comment: 'Sound and vibe were on point!', created_at: '', updated_at: '' } as any,
        { id: 5, booking_id: 0, rating: 1, comment: 'Ran into some hiccups on the day.', created_at: '', updated_at: '' } as any,
      ];
    }
    return [];
  }, [providerName]);

  const allReviews = useMemo(() => (peekReviews.length ? peekReviews : demoReviews), [peekReviews, demoReviews]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const reviewsToShow = useMemo(() => (showAllReviews ? allReviews : allReviews.slice(0, 2)), [allReviews, showAllReviews]);

  const renderStars = (n: number) => (
    <span className="inline-flex items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} className={i < n ? 'h-3.5 w-3.5 text-yellow-400' : 'h-3.5 w-3.5 text-gray-300'} />
      ))}
    </span>
  );

  /* --- handlers --- */
  const handleAcceptPay = () => {
    setOpen(false);
    props.onPayNow?.();
  };

  /* --- UI --- */
  return (
    <>
      {/* PEEK (thread item) */}
      <div className={clsx('w-full md:w-1/2 lg:w-1/2 rounded-xl border border-gray-200 bg-white', className)}>
        {/* Peek header: provider and title */}
        <div className="flex items-start justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <div className="mt-0.5 text-[13px] font-semibold text-gray-900 inline-flex items-center gap-1 truncate">
              {providerVerified && <CheckBadgeIcon className="h-3.5 w-3.5 text-emerald-600" title="Verified" />} {description}
            </div>

            {(() => {
              if (chips.length === 0) return null;
              return (
                <>
                  {/* Mobile: first 3 with +N */}
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {chips.slice(0, 3).map((c, i) => (
                      <span key={`m-${c}-${i}`} className="truncate rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{c}</span>
                    ))}
                    {chips.length > 3 && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">+{chips.length - 3}</span>
                    )}
                  </div>
                  {/* Web: show all chips */}
                  <div className="mt-1 hidden sm:flex flex-wrap gap-1">
                    {chips.map((c, i) => (
                      <span key={`w-${c}-${i}`} className="truncate rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{c}</span>
                    ))}
                  </div>
                </>
              );
            })()}

            {(eventDetails?.date || locationLabel) && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600 pb-5">
                {eventDetails?.date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDaysIcon className="h-3.5 w-3.5 text-gray-500" />
                    <span>{eventDetails.date}</span>
                  </span>
                )}
                {(peekLocationName || stableLocation || locationLabel) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="h-3.5 w-3.5 text-gray-500" />
                    <span className="truncate max-w-[60vw] sm:max-w-[360px]">{peekLocationName || stableLocation || locationLabel}</span>
                  </span>
                )}
              </div>
            )}

            {(typeof providerRating === 'number' || providerRatingCount) && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-600">
                {typeof providerRating === 'number' && (
                  <>
                    <StarIcon className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="font-medium">{providerRating?.toFixed(1)}</span>
                  </>
                )}
                {providerRatingCount ? <span className="text-gray-500">({providerRatingCount})</span> : null}
              </div>
            )}

            {reviewsToShow.length > 0 && (
              <div className="mt-1 space-y-0.5">
                <div className="text-[10px] font-medium text-gray-500">Recent reviews</div>
                {reviewsToShow.map((r, i) => (
                  <div key={`rv-${i}`} className="flex items-start gap-1.5 text-[11px] text-gray-700 truncate">
                    <span className="h-4 w-4 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                      {(() => {
                        const base = (providerName || 'R');
                        const a = base.charAt(0).toUpperCase();
                        const b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(i % 26);
                        return `${a}${b}`;
                      })()}
                    </span>
                    {renderStars(Number(r.rating || 0))}
                    <span className="truncate">“{r.comment || ''}”</span>
                  </div>
                ))}
                {allReviews.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setShowAllReviews((s) => !s)}
                    className="text-[10px] text-gray-600 underline hover:text-gray-800"
                    aria-label={showAllReviews ? 'See fewer reviews' : 'See more reviews'}
                  >
                    {showAllReviews ? 'See fewer' : `See more (${allReviews.length - 2} more)`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-extrabold tabular-nums text-gray-900">
              {displayTotal !== undefined ? formatCurrency(displayTotal) : QUOTE_TOTALS_PLACEHOLDER}
            </div>
            {/* Taxes pill: intentionally minimal for now */}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2 rounded-b-xl">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <StatusBadge status={displayStatus} />
            <span className={clsx(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]',
              isExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600'
            )}>
              {expiryText}
            </span>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
              >
                <MapPinIcon className="h-3.5 w-3.5 text-gray-500" />
                <span className="hidden sm:inline">Open in Maps</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50"
          >
            View quote
          </button>
        </div>
      </div>

      {/* MODAL / SHEET */}
      {open && (typeof document !== 'undefined' && document.body) ? createPortal((
        <Modal onClose={() => setOpen(false)} reduced={reduced}>
          <div className="flex-1 min-h-0 flex flex-col relative">
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
                <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-200 text-gray-700">📋</span>
                <span className="truncate">
                  {`Quote${quoteId ? ` #${String(quoteId).toString().padStart(4, '0')}` : ''}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={displayStatus} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* scrollable body */}
            <div
              data-scrollable
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-3 overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' as any }}
            >
              {/* provider + title + chips */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  {providerAvatarUrl ? (
                    <SafeImage src={providerAvatarUrl} alt="Provider avatar" width={32} height={32} sizes="32px" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-200" aria-hidden />
                  )}
                  <div>
                    <div className="text-[12px] text-gray-600">Service Provider</div>
                    <div className="text-[13px] font-semibold text-gray-900 flex items-center gap-1">
                      <span>{providerName || '-'}</span>
                      {typeof providerRating === 'number' && (
                        <>
                          <StarIcon className="h-3.5 w-3.5 text-yellow-400" />
                          <span className="text-[11px] text-gray-600">{providerRating.toFixed(1)}</span>
                        </>
                      )}
                      {providerRatingCount ? <span className="text-[11px] text-gray-500">({providerRatingCount})</span> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[13px] font-semibold text-gray-900">{description}</div>
                {chips.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {chips.map((c, i) => (
                      <span key={`${c}-${i}`} className="truncate rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{c}</span>
                    ))}
                  </div>
                )}
                {(requestedDateLabel || modalLocationLabel) && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-gray-700">
                    {requestedDateLabel && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDaysIcon className="h-4 w-4 text-gray-500" />
                        <span>{requestedDateLabel}</span>
                      </span>
                    )}
                    {modalLocationLabel && (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="h-4 w-4 text-gray-500" />
                        <span className="truncate max-w-[70vw] sm:max-w-[320px]">{modalLocationLabel}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* breakdown card */}
              <div className="rounded-lg border border-gray-200">
                <div className="px-3 py-2">
                  {hasLineItems
                    ? lineItems.map((it, idx) => (
                        <Row
                          // eslint-disable-next-line react/no-array-index-key
                          key={`${it.label}-${idx}`}
                          label={it.label}
                          value={money(it.amount)}
                        />
                      ))
                    : showPrice && <Row label="Service Provider Fee" value={money(price)} />}
                  {showTravel && <Row label="Travel" value={money(travelFee)} />}
                  {showSound  && <Row label="Sound" value={money(soundFee)} />}

                  {showAccom && <RowNote label="Accommodation" note={accommodation!} />}

                  {showDiscount && (
                    <Row
                      label="Discount"
                      value={`−${money(discount)}`}
                      valueClass="text-emerald-700"
                    />
                  )}

                  <Divider />

                  {/* Subtotal */}
                  <div className="font-semibold ">
                    <Row label="Subtotal" value={money(derivedSubtotal)} valueClass="!font-semibold" />
                  </div>

                  {/* VAT / Tax */}
                  {(() => {
                    let label = 'VAT';
                    let value: number | undefined;
                    if (Array.isArray(taxes) && taxes.length) {
                      value = taxes.reduce((sum, entry) => {
                        const amount = Number(entry?.amount ?? 0);
                        return Number.isFinite(amount) ? sum + amount : sum;
                      }, 0);
                      label = 'Taxes';
                    } else if (typeof vat === 'number' && vat > 0) {
                      value = Number(vat);
                    } else if (typeof tax === 'number' && tax > 0) {
                      value = Number(tax);
                      label = 'Tax';
                    } else {
                      value = vatFallback;
                    }
                    return (
                      <Row
                        label={label}
                        value={value !== undefined ? money(value) : QUOTE_TOTALS_PLACEHOLDER}
                      />
                    );
                  })()}

                  {/* Client-facing platform fee (informational; applied at checkout) */}
                  {isClientView && (
                        <Row label="Booka Service Fee (3% - VAT included)" value={platformFeeIncl !== undefined ? money(platformFeeIncl) : QUOTE_TOTALS_PLACEHOLDER} />
                  )}

                  {/* Total / Total To Pay (client) */}
                  <div className="mt-2 border-t border-b border-gray-300 py-2">
                    <div className="font-semibold">
                      {isClientView ? (
                        <Row label="Total To Pay" value={clientTotal !== undefined ? money(clientTotal) : QUOTE_TOTALS_PLACEHOLDER} valueClass="!font-semibold" />
                      ) : (
                        <Row label="Total" value={displayTotal !== undefined ? money(displayTotal) : QUOTE_TOTALS_PLACEHOLDER} valueClass="!font-semibold" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Includes / Excludes / Notes */}
              {(includes.length > 0 || excludes.length > 0 || showNotes) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {includes.length > 0 && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="text-[12px] font-semibold text-gray-700 mb-1">What’s included</div>
                      <ul className="list-disc pl-4 text-[12px] text-gray-700 space-y-0.5">
                        {includes.slice(0, 6).map((i, ix) => (<li key={ix}>{i}</li>))}
                      </ul>
                    </div>
                  )}
                  {(excludes.length > 0 || showNotes) && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="text-[12px] font-semibold text-gray-700 mb-1">Notes</div>
                      {excludes.length > 0 && (
                        <ul className="list-disc pl-4 text-[12px] text-gray-700 space-y-0.5 mb-1">
                          {excludes.slice(0, 6).map((i, ix) => (<li key={ix}>{i}</li>))}
                        </ul>
                      )}
                      {showNotes && (
                        <p className="text-[12px] leading-relaxed text-gray-600 whitespace-pre-line">{eventDetails!.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Policy & meta */}
              {(cancellationPolicy || paymentTerms || eventDetails?.receivedAt) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {cancellationPolicy && (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <div className="text-[12px] font-semibold text-gray-700">Cancellation policy</div>
                      <p className="mt-1 text-[12px] text-gray-600 line-clamp-4">{cancellationPolicy}</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="text-[12px] font-semibold text-gray-700">Payment</div>
                    <p className="mt-1 text-[12px] text-gray-600">{renderPaymentTerms(paymentTerms)}</p>
                    <div className="mt-2 flex items-center gap-2 opacity-80">
                      <span className="inline-flex items-center justify-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">VISA</span>
                      <span className="inline-flex items-center justify-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">MC</span>
                      <span className="inline-flex items-center justify-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">AMEX</span>
                      <span className="inline-flex items-center justify-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">EFT</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* sticky footer actions */}
              <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex max-w-screen-sm items-center gap-2 px-4 py-3">
                  <div className="text-[11px] text-gray-600">{expiryText}</div>
                  <div className="ml-auto flex items-center gap-2">
                    {isClientView && canDecide && (
                      <>
                        <button
                          type="button"
                          onClick={handleAcceptPay}
                          className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                        >
                          Pay now
                        </button>
                        {onDecline && (
                          <button
                            type="button"
                            onClick={onDecline}
                            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                          >
                            Decline
                          </button>
                        )}
                      </>
                    )}
                    {isClientView && !canDecide && isAccepted && !isExpired && onPayNow && (
                      <button
                        type="button"
                        onClick={() => { setOpen(false); onPayNow?.(); }}
                        className="rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                      >
                        Pay now
                      </button>
                    )}
                    {isClientView && isExpired && !isPaid && !disableRequestNewQuote && (
                      <button
                        type="button"
                        onClick={() => { try { setOpen(false); onAskQuestion?.(); } catch {} }}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                        title="Request a new quote"
                      >
                        Request new quote
                      </button>
                    )}
                  </div>
                </div>
              </div>
          </div>
        </Modal>
      ), document.body) : null}
    </>
  );
}

/* ───────── Tiny primitives ───────── */

function Row({ label, value, muted, valueClass }: { label: string; value: string; muted?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className={clsx('text-[12px] text-gray-700', muted && 'text-gray-500')}>{label}</dt>
      <dd className={clsx('text-[12px] font-light text-gray tabular-nums', valueClass)}>{value}</dd>
    </div>
  );
}
function RowNote({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <dt className="text-[12px] text-gray-700">{label}</dt>
      <dd className="max-w-[70%] text-right text-gray-700">
        <div className="text-[12px] whitespace-pre-line">{note}</div>
      </dd>
    </div>
  );
}
function Divider() {
  return <div className="my-2 h-px w-full bg-gray-200" />;
}

/* ───────── Minimal modal (desktop center / mobile sheet) ───────── */

function Modal({ children, onClose, reduced }: { children: React.ReactNode; onClose: () => void; reduced: boolean }) {
  // close on ESC
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const startY = useRef(0);
  const dragY = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    // find scrollable child marked with data-scrollable
    if (!panelRef.current) return;
    panelRef.current.tabIndex = -1;
    panelRef.current.focus();
    scrollRef.current = panelRef.current.querySelector('[data-scrollable]') as HTMLDivElement | null;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const canScroll = el.scrollHeight > el.clientHeight + 4;
      setShowScrollHint(canScroll && !atBottom);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    const inGrabber = (e.target as HTMLElement)?.closest?.('[data-grabber]');
    if (!inGrabber) {
      dragging.current = false;
      return;
    }
    const top = scrollRef.current.scrollTop;
    if (top <= 0) {
      dragging.current = true;
      startY.current = e.touches[0].clientY;
      dragY.current = 0;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || !panelRef.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      dragging.current = false;
      panelRef.current.style.transform = 'translateY(0px)';
      return;
    }
    dragY.current = dy;
    panelRef.current.style.transform = `translateY(${dy}px)`;
    e.preventDefault();
  };
  const onTouchEnd = () => {
    if (!panelRef.current) return;
    if (!dragging.current) return;
    const dy = dragY.current;
    dragging.current = false;
    if (dy > 80) {
      onClose();
    } else {
      panelRef.current.style.transition = 'transform 160ms ease';
      panelRef.current.style.transform = 'translateY(0px)';
      setTimeout(() => {
        if (panelRef.current) panelRef.current.style.transition = '';
      }, 180);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
        style={reduced ? { opacity: 1 } : { transition: 'opacity 120ms ease', opacity: 1 }}
      />
      {/* panel */}
      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 top-auto mx-auto w-full max-w-screen-sm rounded-t-2xl border border-gray-200 bg-white shadow-xl overflow-hidden sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:px-0 sm:pb-0 flex flex-col min-h-0 max-h-[88vh] h-[88vh] sm:h-[80vh] sm:max-h-[80vh]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* grabber */}
        <div data-grabber className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-gray-300 sm:hidden" aria-hidden />
        {/* scroll hint gradient */}
        {showScrollHint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-12 h-8 bg-gradient-to-t from-white/95 to-transparent sm:bottom-0 sm:h-6" aria-hidden />
        )}
        {children}
      </div>
    </div>
  );
}
