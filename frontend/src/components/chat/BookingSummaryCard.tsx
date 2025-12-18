'use client';

import React from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { format, isValid } from 'date-fns';
import { getFullImageUrl, formatCurrency, buildReceiptUrl } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { resolveQuoteTotalsPreview, QUOTE_TOTALS_PLACEHOLDER } from '@/lib/quoteTotals';
import { Booking, QuoteV2 } from '@/types';
import {
  videoOrderApiClient,
  type VideoOrder,
} from '@/features/booking/personalizedVideo/engine/apiClient';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Users, CheckCircle, User } from 'lucide-react';

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  time?: string;
  location?: string;
  location_name?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

type PaymentInitArgs = {
  bookingRequestId: number;
  amount: number;
  customerEmail?: string;
  providerName?: string;
  serviceName?: string;
};

interface BookingSummaryCardProps {
  variant?: 'default' | 'personalizedVideo';
  hideHeader?: boolean;
  hideHeaderText?: boolean;
  parsedBookingDetails?: ParsedBookingDetails;
  imageUrl?: string | null;
  serviceName?: string;
  artistName?: string;
  bookingConfirmed: boolean;
  quotesLoading?: boolean;
  paymentInfo: {
    status: string | null;
    amount: number | null;
    receiptUrl: string | null;
    reference?: string | null;
  };
  bookingDetails: Booking | null;
  quotes: Record<number, QuoteV2>;
  allowInstantBooking?: boolean;
  openPaymentModal: (args: PaymentInitArgs) => void;
  bookingRequestId: number;
  baseFee: number;
  travelFee: number;
  initialSound?: boolean;
  artistCancellationPolicy?: string | null;
  currentArtistId: number;
  instantBookingPrice?: number;
  showTravel?: boolean;
  showSound?: boolean;
  showPolicy?: boolean;
  showReceiptBelowTotal?: boolean;
  showEventDetails?: boolean;
  belowHeader?: React.ReactNode;
  clientReviewCta?: React.ReactNode;
}

const AvatarHeader: React.FC<
  Pick<
    BookingSummaryCardProps,
    'imageUrl' | 'serviceName' | 'artistName' | 'bookingConfirmed' | 'parsedBookingDetails' | 'clientReviewCta'
  >
> = ({ imageUrl, serviceName, artistName, bookingConfirmed, parsedBookingDetails, clientReviewCta }) => {
  const fullImageUrl = (getFullImageUrl(imageUrl || null) || imageUrl) as string | undefined;
  const eventDate = parsedBookingDetails?.date;
  const formattedDate =
    eventDate && isValid(new Date(eventDate))
      ? format(new Date(eventDate), 'EEE, d MMMM, yyyy')
      : 'Date TBD';
  const formattedTime =
    eventDate && isValid(new Date(eventDate))
      ? format(new Date(eventDate), 'h:mm a')
      : 'Time TBD';
  const rawLocation = String(parsedBookingDetails?.location || '').trim();
  const mapsUrl = rawLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawLocation)}`
    : '';

  return (
    <header
      className="relative w-full  overflow-x-hidden"
      aria-label="Booking header"
    >
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,1) 30%, rgba(0,0,0,1) 80%, rgba(0,0,0,0))',
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,1) 30%, rgba(0,0,0,1) 80%, rgba(0,0,0,0))',
        }}
      />
      <div className="relative px-6 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-lg overflow-hidden shrink-0 ring-4 ring-white shadow-md">
            {fullImageUrl ? (
              <SafeImage
                src={fullImageUrl}
                alt="Service image"
                fill
                className="object-cover"
                sizes="64px"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
              />
            ) : (
              <div className="w-full h-full bg-indigo-500 flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {bookingConfirmed && (
              <div
                className="mb-1 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-black shadow"
                aria-label="Booking confirmed"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Confirmed
              </div>
            )}

            <h1 className="text-xl font-extrabold leading-tight text-gray-900 truncate">
              {serviceName || 'Booking Details'}
            </h1>
            {artistName && (
              <p className="mt-0.5 text-sm font-medium text-gray-600 truncate">
                with {artistName}
              </p>
            )}
          </div>
        </div>

        {clientReviewCta && (
          <div className="mt-2">
            {clientReviewCta}
          </div>
        )}
      </div>
    </header>
  );
};

export default function BookingSummaryCard({
  hideHeader = false,
  hideHeaderText = false,
  variant = 'default',
  parsedBookingDetails,
  imageUrl,
  serviceName,
  artistName,
  bookingConfirmed,
  quotesLoading = false,
  paymentInfo,
  bookingDetails,
  quotes,
  allowInstantBooking,
  openPaymentModal,
  bookingRequestId,
  baseFee,
  travelFee,
  initialSound,
  artistCancellationPolicy,
  currentArtistId,
  instantBookingPrice,
  showTravel = true,
  showSound = true,
  showPolicy = true,
  showReceiptBelowTotal = false,
  showEventDetails = true,
  belowHeader,
  clientReviewCta,
}: BookingSummaryCardProps) {
  const { user } = useAuth();
  const [briefLink, setBriefLink] = React.useState<string | null>(null);
  const [briefComplete, setBriefComplete] = React.useState<boolean>(false);
  const [pvOrderId, setPvOrderId] = React.useState<number | null>(null);
  const [pvOrder, setPvOrder] = React.useState<VideoOrder | null>(null);
  const [pvOrderLoading, setPvOrderLoading] = React.useState(false);
  const isPersonalizedVideo = variant === 'personalizedVideo';
  const enablePvOrders =
    (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? '') === '1';

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      try {
        const oid = localStorage.getItem(`vo-order-for-thread-${bookingRequestId}`);
        const resolved = oid || (enablePvOrders && isPersonalizedVideo ? String(bookingRequestId) : null);
        if (resolved) {
          const resolvedId = Number(resolved);
          setPvOrderId(Number.isFinite(resolvedId) && resolvedId > 0 ? resolvedId : null);
          setBriefLink(`/video-orders/${resolved}/brief`);
          setBriefComplete(!!localStorage.getItem(`vo-brief-complete-${resolved}`));
        } else {
          setBriefLink(null);
          setBriefComplete(false);
          setPvOrderId(null);
        }
      } catch {}
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, [bookingRequestId, enablePvOrders, isPersonalizedVideo]);

  React.useEffect(() => {
    if (!enablePvOrders || !isPersonalizedVideo || !pvOrderId) {
      setPvOrder(null);
      setPvOrderLoading(false);
      return;
    }
    let cancelled = false;
    setPvOrderLoading(true);
    (async () => {
      try {
        const order = await videoOrderApiClient.getOrder(pvOrderId);
        if (cancelled) return;
        setPvOrder(order);
      } catch {
        if (!cancelled) setPvOrder(null);
      } finally {
        if (!cancelled) setPvOrderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enablePvOrders, isPersonalizedVideo, pvOrderId]);

  const getLocationLabel = () => {
    const locName = (parsedBookingDetails as any)?.location_name as string | undefined;
    const raw = (parsedBookingDetails?.location || '').trim();
    let name = (locName || '').trim();
    let addr = '';
    if (!name && raw) {
      const parts = raw.split(',');
      const first = (parts[0] || '').trim();
      if (first && !/^\d/.test(first)) {
        name = first;
        addr = parts.slice(1).join(',').trim();
      } else {
        addr = raw;
      }
    } else if (name) {
      addr = raw;
    }
    return name ? (addr ? `${name} - ${addr}` : name) : addr || '';
  };

  // Quote selection (accepted > latest pending)
  const bestState = React.useMemo(() => {
    const list = Object.values(quotes || {}).filter((q: any) => {
      const qBookingId =
        q?.booking_request_id ??
        (q as any)?.booking_requestId ??
        (q?.booking_request ? (q as any).booking_request.id : null);
      return Number(qBookingId) === Number(bookingRequestId);
    });
    const accepted = list.find((q: any) =>
      String(q?.status || '').toLowerCase().includes('accepted')
    );
    const pending = list.filter((q: any) => {
      const s = String(q?.status || '').toLowerCase();
      return s === 'pending' || s.includes('pending');
    });
    const latestPending = pending.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0] || null;
    return { list, accepted: accepted || null, latestPending, best: accepted || latestPending || null };
  }, [quotes, bookingRequestId]);

  // Treat the viewer as the client for this booking when they are the booking.client_id,
  // even if their global user_type is 'service_provider'.
  const isClient =
    !!user &&
    !!bookingDetails &&
    Number(user.id) === Number((bookingDetails as any).client_id);

  const isProvider =
    !!user &&
    !!bookingDetails &&
    Number(user.id) === Number(currentArtistId || 0);

  const pvStatus = String(pvOrder?.status || '').toLowerCase();
  const pvDeliveredHint =
    pvStatus === 'delivered' || pvStatus === 'completed' || pvStatus === 'closed';
  const pvCanDeliverHint = pvStatus === 'in_production';
  const pvVideoHref = pvOrderId ? `/video-orders/${pvOrderId}/deliver` : null;
  const showPvVideoButton = Boolean(pvVideoHref && (pvDeliveredHint || (isProvider && pvCanDeliverHint)));
  const pvVideoButtonLabel = pvDeliveredHint ? 'View video' : 'Deliver video';

  type Payout = {
    id: number;
    booking_id: number | null;
    amount: number;
    currency: string;
    status: string;
    type: string;
    scheduled_at: string | null;
    paid_at: string | null;
    reference: string | null;
  };

  const bookingId = bookingDetails?.id ?? null;
  const [payoutsForBooking, setPayoutsForBooking] = React.useState<Payout[] | null>(null);
  const [payoutsLoading, setPayoutsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isProvider || !bookingId) {
      setPayoutsForBooking(null);
      setPayoutsLoading(false);
      return;
    }
    let cancelled = false;

    const payoutStageOrder = (t: string): number => {
      const v = String(t || '').toLowerCase();
      if (v === 'first50') return 1;
      if (v === 'final50') return 2;
      return 99;
    };

    (async () => {
      setPayoutsLoading(true);
      try {
        const res = await fetch(apiUrl('/api/v1/payouts/me?limit=200&offset=0'), { credentials: 'include' });
        if (!res.ok) throw new Error(`payouts ${res.status}`);
        const data = (await res.json()) as { items?: Payout[] };
        const items = Array.isArray(data?.items) ? data.items : [];
        const filtered = items
          .filter((p) => Number(p?.booking_id || 0) === Number(bookingId))
          .sort((a, b) => {
            const stage = payoutStageOrder(a.type) - payoutStageOrder(b.type);
            if (stage !== 0) return stage;
            return (a.id || 0) - (b.id || 0);
          });
        if (cancelled) return;
        setPayoutsForBooking(filtered);
      } catch {
        if (cancelled) return;
        setPayoutsForBooking([]);
      } finally {
        if (cancelled) return;
        setPayoutsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isProvider, bookingId]);

  // Sticky mobile CTA height measurement to create safe bottom space
  const stickyRef = React.useRef<HTMLDivElement | null>(null);
  const [stickyH, setStickyH] = React.useState(0);
  const stickyPresent = !!(allowInstantBooking && !bestState.accepted && bestState.best);

  React.useLayoutEffect(() => {
    if (!stickyPresent || !stickyRef.current || typeof ResizeObserver === 'undefined') {
      setStickyH(0);
      return;
    }
    const el = stickyRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setStickyH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stickyPresent]);

  // Small prep button: brief > provider profile > support


  return (
    // NO horizontal scroll: overflow-x-hidden; also clip overscroll
    <section
      className="w-full bg-white overflow-x-hidden overscroll-x-none"
      aria-label="Booking summary"
    >
      {!hideHeader && (
        <>
          <AvatarHeader
            imageUrl={imageUrl}
            serviceName={isPersonalizedVideo ? 'Personalised Video' : serviceName}
            artistName={artistName}
            bookingConfirmed={(() => {
              const paid = String(paymentInfo?.status || '').toLowerCase() === 'paid';
              const status = String(bookingDetails?.status || '').toLowerCase();
              const statusConfirmed = status.includes('confirmed') || status === 'completed';
              return Boolean(bookingConfirmed || paid || statusConfirmed);
            })()}
            parsedBookingDetails={parsedBookingDetails}
            clientReviewCta={clientReviewCta}
          />
          {belowHeader && (
            <div className="px-6 pt-2 pb-2 sm:px-8 max-w-full overflow-x-hidden">
              {belowHeader}
            </div>
          )}
        </>
      )}

      {/* CONTENT (single column; cost now directly after Event Details) */}
      <div
        className={[
          'px-6 sm:px-8 py-6 max-w-full overflow-x-hidden',
          stickyPresent
            ? 'pb-[calc(var(--sticky-h,64px)+env(safe-area-inset-bottom,0px)+24px)]'
            : 'pb-6',
        ].join(' ')}
        style={stickyPresent ? ({ ['--sticky-h' as any]: `${stickyH}px` } as React.CSSProperties) : undefined}
      >
        {/* Event Details */}
        {!isPersonalizedVideo && (
          <section id="event-details" className="scroll-mt-20" aria-labelledby="event-details-h">
            <h2 id="event-details-h" className="text-xl font-bold text-gray-900 mb-3">
              Event Details
            </h2>

            <ul className="rounded-lg bg-white border border-gray-200 p-3 space-y-2 shadow-sm overflow-x-hidden">
              {showEventDetails && parsedBookingDetails?.eventType && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Event Type:</span>
                  <span className="text-gray-800 break-words">{parsedBookingDetails.eventType}</span>
                </li>
              )}
              {showEventDetails && parsedBookingDetails?.date && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Date &amp; Time:</span>
                  <span className="text-gray-800 break-words">
                    {(() => {
                      const rawDate = String(parsedBookingDetails.date || '').trim();
                      const rawTime = String(parsedBookingDetails.time || '').trim();
                      const d = new Date(rawDate);
                      const dateLabel = isValid(d) ? format(d, 'EEE, d MMMM, yyyy') : rawDate;
                      const isDateOnly = /T00:00:00\.000Z$/.test(rawDate) || /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
                      const timeLabel = rawTime
                        ? rawTime
                        : isValid(d) && !isDateOnly
                          ? format(d, 'h:mm a')
                          : '';
                      return timeLabel ? `${dateLabel} • ${timeLabel}` : dateLabel;
                    })()}
                  </span>
                </li>
              )}
              {showEventDetails && getLocationLabel() && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Location:</span>
                  {(() => {
                    const raw = String(parsedBookingDetails?.location || '').trim();
                    const url = raw
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`
                      : '';
                    const label = getLocationLabel();
                    return url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-800 visited:text-gray-800 no-underline hover:no-underline hover:cursor-pointer break-words"
                        title={raw}
                      >
                        {label}
                      </a>
                    ) : (
                      <span className="text-gray-800 break-words">{label}</span>
                    );
                  })()}
                </li>
              )}
              {showEventDetails && parsedBookingDetails?.guests && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Guests:</span>
                  <span className="text-gray-800 break-words">{parsedBookingDetails.guests}</span>
                </li>
              )}
              {showEventDetails && parsedBookingDetails?.venueType && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Venue Type:</span>
                  <span className="text-gray-800 break-words">{parsedBookingDetails.venueType}</span>
                </li>
              )}
              {showSound && showEventDetails && parsedBookingDetails?.soundNeeded && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Sound:</span>
                  <span className="text-gray-800 break-words">{parsedBookingDetails.soundNeeded}</span>
                </li>
              )}
              {showEventDetails && parsedBookingDetails?.notes && (
                <li className="flex items-start">
                  <span className="font-semibold w-28 text-gray-600 shrink-0">Notes:</span>
                  <span className="text-gray-800 italic break-words">{parsedBookingDetails.notes}</span>
                </li>
              )}
            </ul>

            {/* Small, not-full-width prep button under Event Details */}

          </section>
        )}

        {/* COST SUMMARY — NOW IMMEDIATELY BELOW EVENT DETAILS */}
        {!isPersonalizedVideo && (
          <section
            id="cost-summary"
            className="mt-8 scroll-mt-20"
            aria-labelledby="cost-summary-h"
          >
            <h2 id="cost-summary-h" className="text-xl font-bold text-gray-900 mb-3">
              {bestState.accepted ? 'Final Total' : 'Cost Summary'}
            </h2>

            {quotesLoading && (bestState.list?.length ?? 0) === 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-2 animate-pulse">
                <div className="h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-4 w-1/3 rounded bg-gray-200" />
                <div className="h-4 w-5/12 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
              </div>
            )}

            {bestState.best && !quotesLoading && (
              <CostBreakdown
                quote={bestState.best as any}
                isClient={isClient}
                showSound={showSound}
                showTravel={showTravel}
                allowInstantBooking={!!allowInstantBooking && !bestState.accepted}
                onReserve={() =>
                  openPaymentModal({
                    bookingRequestId,
                    amount: (() => {
                      const preview = resolveQuoteTotalsPreview(bestState.best as any);
                      return typeof preview.clientTotalInclVat === 'number' ? preview.clientTotalInclVat : 0;
                    })(),
                    customerEmail: (user as any)?.email || undefined,
                  })
                }
                showReceiptBelowTotal={showReceiptBelowTotal}
              />
            )}

            {!bestState.best && !quotesLoading && (
              <div className="rounded-lg border border-dashed border-gray-400 bg-gray-50 p-4 text-sm text-gray-600 text-center italic">
                No quote is available yet for this request. Awaiting provider response.
              </div>
            )}
          </section>
        )}

        {/* Order Info */}
        {bookingDetails && (
          <section id="order-information" className="mt-8 scroll-mt-20" aria-labelledby="order-info-h">
            <h2 id="order-info-h" className="text-xl font-bold text-gray-900 mb-3">
              Order Information
            </h2>
            <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-2 shadow-sm overflow-x-hidden">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Order Number</span>
                <span className="font-semibold flex items-center gap-2 text-gray-900">
                  {bookingDetails?.id != null ? `#${bookingDetails.id}` : ''}
                  {(() => {
                    const reference =
                      paymentInfo.reference ||
                      (bookingDetails?.payment_id ? String(bookingDetails.payment_id) : null);
                    if (!reference) return null;
                    return <span className="text-xs font-normal text-gray-500">({reference})</span>;
                  })()}
                </span>
              </div>
              {(() => {
                const bookingId = bookingDetails?.id;
                const anyBooking: any = bookingDetails as any;
                const vis = Array.isArray(anyBooking?.visible_invoices)
                  ? (anyBooking.visible_invoices as Array<{ type: string; id: number }>)
                  : [];

                const receiptUrl = buildReceiptUrl(
                  paymentInfo.receiptUrl,
                  bookingDetails?.payment_id ?? null,
                );

                let providerHref: string | null = null;
                if (bookingId) {
                  const providerInv = vis.find(
                    (iv) => iv.type === 'provider_tax' || iv.type === 'provider_invoice',
                  );
                  const fallbackInv = vis.length ? vis[vis.length - 1] : undefined;
                  const target = providerInv || fallbackInv;
                  if (target && typeof target.id === 'number') {
                    providerHref = `/invoices/${target.id}`;
                  } else if (bookingDetails?.invoice_id) {
                    providerHref = `/invoices/${bookingDetails.invoice_id}`;
                  } else {
                    providerHref = `/invoices/by-booking/${bookingId}?type=provider`;
                  }
                }

                let bookaHref: string | null = null;
                if (bookingId && isClient) {
                  const clientFeeInv = vis.find((iv) => iv.type === 'client_fee_tax');
                  if (clientFeeInv && typeof clientFeeInv.id === 'number') {
                    bookaHref = `/invoices/${clientFeeInv.id}`;
                  } else {
                    bookaHref = `/invoices/by-booking/${bookingId}?type=client_fee`;
                  }
                }

                const showReceipt = Boolean(isClient && receiptUrl);

                const showPayoutDocs = Boolean(
                  isProvider &&
                    bookingId &&
                    (payoutsLoading ||
                      (Array.isArray(payoutsForBooking) &&
                        payoutsForBooking.length > 0)),
                );

                if (!showReceipt && !providerHref && !bookaHref && !showPayoutDocs) return null;

                const payoutStageLabel = (t: string): string => {
                  const v = String(t || '').toLowerCase();
                  if (v === 'first50') return 'First payout (50%)';
                  if (v === 'final50') return 'Final payout (50%)';
                  return t || 'Payout';
                };

                const formatDateSafe = (ts: string | null): string => {
                  if (!ts) return '—';
                  const d = new Date(ts);
                  if (Number.isNaN(d.getTime())) return '—';
                  try {
                    return format(d, 'd MMM yyyy');
                  } catch {
                    return '—';
                  }
                };

                return (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-700">Documents</div>
                    <div className="mt-2 space-y-2 text-right">
                      {showReceipt && (
                        <a
                          href={receiptUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                        >
                          View receipt
                        </a>
                      )}
                      {providerHref && (
                        <div>
                          <a
                            href={providerHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                          >
                            Download provider invoice
                          </a>
                        </div>
                      )}
                      {bookaHref && (
                        <div>
                          <a
                            href={bookaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                          >
                            Download Booka tax invoice
                          </a>
                        </div>
                      )}

                      {isProvider && (
                        <div className="space-y-1 text-left">
                          {payoutsLoading ? (
                            <div className="text-xs text-gray-500">
                              Loading payout schedule…
                            </div>
                          ) : null}
                          {Array.isArray(payoutsForBooking) &&
                          payoutsForBooking.length > 0 ? (
                            <div className="space-y-2">
                              {payoutsForBooking.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-gray-900">
                                      {payoutStageLabel(p.type)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-gray-600">
                                      Scheduled {formatDateSafe(p.scheduled_at)} ·{' '}
                                      {String(p.status || '').toLowerCase() ===
                                      'paid'
                                        ? `Paid ${formatDateSafe(p.paid_at)}`
                                        : `Status ${p.status || 'queued'}`}
                                    </div>
                                  </div>
                                  <a
                                    href={apiUrl(`/api/v1/payouts/${p.id}/pdf`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                                  >
                                    Remittance PDF
                                  </a>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* Optional brief button (unchanged logic) */}
        {(() => {
          const isProviderForThread = (() => {
            try {
              const raw: any = bookingDetails;
              const uid = user?.id;
              const pid = Number(
                raw?.service_provider_id ||
                raw?.artist_id ||
                raw?.artist?.id ||
                raw?.artist_profile?.user_id ||
                0,
              );
              return Boolean(uid && pid && uid === pid);
            } catch {
              return user?.user_type === 'service_provider';
            }
          })();
          const canShow = !!briefLink && (isClient || (isProviderForThread && briefComplete));
          const label = briefComplete
            ? 'View Brief'
            : isPersonalizedVideo
              ? 'Complete Brief'
              : 'Finish Brief';
          if (!canShow) return null;
          return (
            <div className="pt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <a
                href={briefLink}
                className="inline-flex justify-center items-center w-full sm:w-auto text-center bg-indigo-600 text-white font-semibold rounded-lg px-5 py-3 shadow-lg hover:bg-indigo-700 transition no-underline hover:no-underline hover:text-white visited:text-white"
              >
                {label}
              </a>
              {showPvVideoButton ? (
                <a
                  href={pvVideoHref || undefined}
                  className="inline-flex justify-center items-center w-full sm:w-auto text-center bg-white text-gray-900 font-semibold rounded-lg px-5 py-3 shadow-sm border border-gray-200 hover:bg-gray-50 transition no-underline hover:no-underline"
                  aria-disabled={pvOrderLoading}
                >
                  {pvOrderLoading ? 'Loading…' : pvVideoButtonLabel}
                </a>
              ) : null}
            </div>
          );
        })()}

        {/* Policy */}
        {showPolicy && (
          <section id="cancellation-policy" className="mt-8 scroll-mt-20" aria-labelledby="policy-h">
            <h2 id="policy-h" className="text-xl font-bold text-gray-900 mb-3">
              Cancellation Policy
            </h2>
            <p className="rounded-lg bg-white border border-gray-200 p-3 space-y-2 shadow-sm overflow-x-hidden">
              {artistCancellationPolicy?.trim() ||
                'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider. Please review the full terms before confirming.'}
            </p>
          </section>
        )}

        {/* Helpful links: stack vertically full width on all viewports */}
        <section aria-label="Helpful links" className="mt-8">
          <div className="grid grid-cols-1 gap-4">
            <a
              href="/faq"
              className="block text-center bg-white text-gray-800 font-semibold rounded-lg px-4 py-3 border border-gray-300 hover:bg-gray-50 transition no-underline hover:no-underline"
            >
              Get Support
            </a>
          </div>
        </section>
      </div>

      {/* Mobile sticky CTA; measured height ensures the last buttons are never hidden */}
      {stickyPresent && (
        <div
          ref={stickyRef}
          className="lg:hidden fixed left-0 right-0 bottom-0 z-30 border-t bg-white/90 backdrop-blur p-3 pb-[env(safe-area-inset-bottom)]"
        >
          <Button
            type="button"
            onClick={() =>
              openPaymentModal({
                bookingRequestId,
                amount: (() => {
                  const preview = resolveQuoteTotalsPreview(bestState.best as any);
                  return typeof preview.clientTotalInclVat === 'number' ? preview.clientTotalInclVat : 0;
                })(),
                customerEmail: (user as any)?.email || undefined,
              })
            }
            className="w-full bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 text-base font-semibold rounded-lg shadow-xl transition"
          >
            Reserve Now &rarr;
          </Button>
        </div>
      )}
    </section>
  );
}

/* ---- Cost breakdown (reused) ---- */
function CostBreakdown({
  quote,
  isClient,
  showSound,
  showTravel,
  allowInstantBooking,
  onReserve,
  showReceiptBelowTotal,
}: {
  quote: any;
  isClient: boolean;
  showSound: boolean;
  showTravel: boolean;
  allowInstantBooking: boolean;
  onReserve: () => void;
  showReceiptBelowTotal?: boolean;
}) {
  const base = Array.isArray(quote.services)
    ? quote.services.reduce((sum: number, s: any) => sum + Number(s?.price || 0), 0)
    : 0;

  const sound = Number(quote.sound_fee || 0);
  const travel = Number(quote.travel_fee || 0);
  const discount = Number(quote.discount || 0);
  const subtotal = Number(quote.subtotal || base + sound + travel - discount);
  const total = Number(quote.total || subtotal);
  const vat = Math.max(0, total - subtotal);

  const previewTotals = resolveQuoteTotalsPreview(quote);
  const platformFeeIncl = typeof previewTotals.platformFeeExVat === 'number' && typeof previewTotals.platformFeeVat === 'number'
    ? previewTotals.platformFeeExVat + previewTotals.platformFeeVat
    : undefined;
  const clientTotal = typeof previewTotals.clientTotalInclVat === 'number' ? previewTotals.clientTotalInclVat : undefined;
  const providerSubtotal = typeof previewTotals.providerSubtotal === 'number' ? previewTotals.providerSubtotal : undefined;

  const providerDisplayRaw =
    (Number.isFinite(total) && total > 0 ? total : undefined) ??
    (Number.isFinite(subtotal) && subtotal > 0 ? subtotal : undefined) ??
    providerSubtotal;
  const providerDisplay =
    typeof providerDisplayRaw === 'number' && Number.isFinite(providerDisplayRaw)
      ? formatCurrency(providerDisplayRaw)
      : QUOTE_TOTALS_PLACEHOLDER;
  const clientDisplay =
    typeof clientTotal === 'number' && Number.isFinite(clientTotal)
      ? formatCurrency(clientTotal)
      : QUOTE_TOTALS_PLACEHOLDER;

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-2 shadow-sm overflow-x-hidden">
      <div className="flex justify-between text-gray-700">
        <span>Base Service Fee</span>
        <span>{formatCurrency(base)}</span>
      </div>
      {/* Only show Sound row when there is a positive sound fee.
          This avoids confusing "Sound R0" lines when sound is
          handled separately or not included in this booking. */}
      {showSound && sound > 0 && (
        <div className="flex justify-between text-gray-700">
          <span>Sound Equipment</span>
          <span>{formatCurrency(sound)}</span>
        </div>
      )}
      {showTravel && (
        <div className="flex justify-between text-gray-700">
          <span>Travel Cost</span>
          <span>{formatCurrency(travel)}</span>
        </div>
      )}
      {quote.accommodation && (
        <div className="flex justify-between text-gray-700">
          <span>Accommodation</span>
          <span className="break-words">{quote.accommodation}</span>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between text-green-600 font-medium">
          <span>Discount Applied</span>
          <span>-{formatCurrency(discount)}</span>
        </div>
      )}
      {vat > 0 && (
        <div className="flex justify-between text-gray-700">
          <span>VAT/Tax</span>
          <span>{formatCurrency(vat)}</span>
        </div>
      )}
      {isClient && (
        <div className="flex justify-between text-indigo-600">
          <span>Platform Service Fee (incl. VAT)</span>
          <span>{platformFeeIncl !== undefined ? formatCurrency(platformFeeIncl) : QUOTE_TOTALS_PLACEHOLDER}</span>
        </div>
      )}
      <div className="flex justify-between items-center font-extrabold text-lg mt-3 pt-3 border-t border-gray-300">
        <span className="flex items-center gap-2">
          Final Total
        </span>
        <span>
          {isClient ? clientDisplay : providerDisplay}
        </span>
      </div>

      {allowInstantBooking && (
        <div className="pt-2">
          <Button
            type="button"
            onClick={onReserve}
            className="w-full bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 text-base font-semibold rounded-lg shadow-xl transition"
          >
            Reserve Now &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
