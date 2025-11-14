'use client';

import React from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { format, isValid } from 'date-fns';
import { getFullImageUrl, formatCurrency, buildReceiptUrl } from '@/lib/utils';
import { resolveQuoteTotalsPreview, QUOTE_TOTALS_PLACEHOLDER } from '@/lib/quoteTotals';
import { Booking, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Users, CheckCircle, User } from 'lucide-react';

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
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
}

const AvatarHeader: React.FC<
  Pick<
    BookingSummaryCardProps,
    'imageUrl' | 'serviceName' | 'artistName' | 'bookingConfirmed' | 'parsedBookingDetails'
  >
> = ({ imageUrl, serviceName, artistName, bookingConfirmed, parsedBookingDetails }) => {
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
                className="mb-1 inline-flex items-center rounded-full bg-green-500/90 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white shadow"
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
              <p className="text-sm font-medium text-gray-600 truncate">with {artistName}</p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-gray-700">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            <span>
              {formattedDate}
            </span>
          </div>
          {parsedBookingDetails?.location && (
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-2" />
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate no-underline hover:no-underline hover:cursor-pointer text-gray-700 visited:text-gray-700"
                  title={rawLocation}
                >
                  {parsedBookingDetails.location.split(',')[0].trim()}
                </a>
              ) : (
                <span className="truncate">{parsedBookingDetails.location.split(',')[0].trim()}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default function BookingSummaryCard({
  hideHeader = false,
  hideHeaderText = false,
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
}: BookingSummaryCardProps) {
  const { user } = useAuth();
  const [briefLink, setBriefLink] = React.useState<string | null>(null);
  const [briefComplete, setBriefComplete] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      try {
        const oid = localStorage.getItem(`vo-order-for-thread-${bookingRequestId}`);
        if (oid) {
          setBriefLink(`/video-orders/${oid}/brief`);
          setBriefComplete(!!localStorage.getItem(`vo-brief-complete-${oid}`));
        } else {
          setBriefLink(null);
          setBriefComplete(false);
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
  }, [bookingRequestId]);

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

  const isClient = user?.user_type === 'client';

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
            serviceName={serviceName}
            artistName={artistName}
            bookingConfirmed={(() => {
              const paid = String(paymentInfo?.status || '').toLowerCase() === 'paid';
              const status = String(bookingDetails?.status || '').toLowerCase();
              const statusConfirmed = status.includes('confirmed') || status === 'completed';
              return Boolean(bookingConfirmed || paid || statusConfirmed);
            })()}
            parsedBookingDetails={parsedBookingDetails}
          />
          {belowHeader && (
            <div className="px-6 py-2 sm:px-8  max-w-full overflow-x-hidden">
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
        {/* Provider Invoice download (when available) */}
        {(() => {
          try {
            const paid = String(paymentInfo?.status || '').toLowerCase() === 'paid';
            const status = String(bookingDetails?.status || '').toLowerCase();
            const statusConfirmed = status.includes('confirmed') || status === 'completed';
            const bookingId = bookingDetails?.id;
            const invoiceHref = bookingId ? `/invoices/by-booking/${bookingId}?type=provider` : null;
            if ((paid || statusConfirmed) && invoiceHref) {
              return (
                <div className="mb-4">
                  <a
                    href={invoiceHref}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                    title="Download Provider Invoice"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M12 16.5l4-4h-3V3h-2v9.5H8l4 4z" /><path d="M5 18h14v2H5z" />
                    </svg>
                    Download Provider Invoice
                  </a>
                </div>
              );
            }
          } catch {}
          return null;
        })()}
        {/* Event Details */}
        <section id="event-details" className="scroll-mt-20" aria-labelledby="event-details-h">
          <h2 id="event-details-h" className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">
            Event Details
          </h2>

          <ul className="space-y-3 text-sm leading-relaxed break-words">
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
                  {isValid(new Date(parsedBookingDetails.date))
                    ? format(new Date(parsedBookingDetails.date), 'EEE, d MMMM, yyyy h:mm a')
                    : parsedBookingDetails.date}
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

        {/* COST SUMMARY — NOW IMMEDIATELY BELOW EVENT DETAILS */}
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

        {/* Order Info */}
        {(bookingConfirmed || paymentInfo.status) && (
          <section id="order-information" className="mt-8 scroll-mt-20" aria-labelledby="order-info-h">
            <h2 id="order-info-h" className="text-xl font-bold text-gray-900 mb-3">
              Order Information
            </h2>
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-2">
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
                const url = buildReceiptUrl(
                  paymentInfo.receiptUrl,
                  bookingDetails?.payment_id ?? null
                );
                return url ? (
                  <div className="pt-2 border-t border-gray-100 text-right">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                    >
                      View Receipt &rarr;
                    </a>
                  </div>
                ) : null;
              })()}
            </div>
          </section>
        )}

        {/* Optional brief button (unchanged logic) */}
        {(() => {
          const isProvider = user?.user_type === 'service_provider';
          const canShow = !!briefLink && (isClient || (isProvider && briefComplete));
          const label = briefComplete ? 'View Brief' : 'Finish Brief';
          if (!canShow) return null;
          return (
            <div className="pt-4">
              <a
                href={briefLink}
                className="inline-flex justify-center items-center w-full sm:w-auto text-center bg-indigo-600 text-white font-semibold rounded-lg px-5 py-3 shadow-lg hover:bg-indigo-700 transition"
              >
                {label}
              </a>
            </div>
          );
        })()}

        {/* Policy */}
        {showPolicy && (
          <section id="cancellation-policy" className="mt-8 scroll-mt-20" aria-labelledby="policy-h">
            <h2 id="policy-h" className="text-xl font-bold text-gray-900 mb-3">
              Cancellation Policy
            </h2>
            <p className="text-gray-700 text-sm leading-relaxed break-words">
              {artistCancellationPolicy?.trim() ||
                'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider. Please review the full terms before confirming.'}
            </p>
          </section>
        )}

        {/* Helpful links: stack vertically full width on all viewports */}
        <section aria-label="Helpful links" className="mt-8">
          <div className="grid grid-cols-1 gap-4">
            <a
              href={currentArtistId ? `/service-providers/${currentArtistId}` : '#'}
              className="block text-center bg-gray-900 text-white hover:text-white focus:text-white active:text-white visited:text-white font-semibold rounded-lg px-4 py-3 hover:bg-black transition"
            >
              View Service Profile
            </a>
            <a
              href="/support"
              className="block text-center bg-white text-gray-800 font-semibold rounded-lg px-4 py-3 border border-gray-300  hover:bg-gray-50 transition"
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
    <div className="rounded-lg bg-white border border-gray-200 p-4 space-y-2 shadow-sm overflow-x-hidden">
      <div className="flex justify-between text-gray-700">
        <span>Base Service Fee</span>
        <span>{formatCurrency(base)}</span>
      </div>
      {showSound && (
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
