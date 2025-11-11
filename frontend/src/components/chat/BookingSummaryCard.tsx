'use client';

import React from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { format, isValid } from 'date-fns';
import { getFullImageUrl, formatCurrency, buildReceiptUrl } from '@/lib/utils';
import { Booking, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Users, DollarSign, CheckCircle, User, Clipboard, Share2, Download } from 'lucide-react';

// --- Interfaces (Copied from original) ---

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string; // may be "Name, Address" after selection
  location_name?: string; // optional explicit venue name if available
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
  /** UI toggles to tailor panel per service type */
  showTravel?: boolean;
  showSound?: boolean;
  showPolicy?: boolean;
  showReceiptBelowTotal?: boolean;
  showEventDetails?: boolean;
  /** Optional content to render directly under the header/avatar area */
  belowHeader?: React.ReactNode;
}

// --- Utilities (local to this file) ---

function safeNewDate(value?: string) {
  const d = value ? new Date(value) : null;
  return d && isValid(d) ? d : null;
}

function buildICS(details?: ParsedBookingDetails, title?: string, location?: string) {
  const d = safeNewDate(details?.date);
  if (!d) return null;
  // Basic all-in-one ICS (UTC naive). You can enhance with TZ if you store it.
  const pad = (n: number) => String(n).padStart(2, '0');
  const dt = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booka//Booking Summary//EN',
    'BEGIN:VEVENT',
    `UID:${crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}@booka`,
    `DTSTAMP:${dt}`,
    `DTSTART:${dt}`,
    `SUMMARY:${(title || 'Booka Event').replace(/\n/g, ' ')}`,
    location ? `LOCATION:${location.replace(/\n/g, ' ')}` : '',
    details?.notes ? `DESCRIPTION:${details.notes.replace(/\n/g, ' ')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;
}

// --- NEW Header Component (Shorter, Avatar-focused) ---

const AvatarHeader: React.FC<
  Pick<
    BookingSummaryCardProps,
    'imageUrl' | 'serviceName' | 'artistName' | 'bookingConfirmed' | 'parsedBookingDetails'
  >
> = ({ imageUrl, serviceName, artistName, bookingConfirmed, parsedBookingDetails }) => {
  const fullImageUrl = (getFullImageUrl(imageUrl || null) || imageUrl) as string | undefined;
  const eventDate = parsedBookingDetails?.date;
  const d = safeNewDate(eventDate);
  const formattedDate = d ? format(d, 'EEE, MMM d, yyyy') : 'Date TBD';
  const formattedTime = d ? format(d, 'h:mm a') : 'Time TBD';

  return (
    // ⭐ Sticky header with subtle blur for classy feel, and pointer-events-none background pattern
    <header className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur supports-[backdrop-filter]:bg-gray-50/60 border-b border-gray-200">
      <div className="relative w-full p-6">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative flex items-center gap-4">
          {/* Avatar */}
          <div className="relative h-16 w-16 rounded-full overflow-hidden shrink-0 ring-4 ring-white shadow-lg">
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

          {/* Text */}
          <div className="flex-1 min-w-0">
            {bookingConfirmed && (
              <div className="mb-1 inline-flex items-center rounded-full bg-green-500/90 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white shadow-md">
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

        {/* Key details */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-gray-700">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-indigo-500" />
            <span>{formattedDate} at {formattedTime}</span>
          </div>
          {parsedBookingDetails?.location && (
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-indigo-500" />
              <span>{parsedBookingDetails.location.split(',')[0].trim()}</span>
            </div>
          )}
          {parsedBookingDetails?.guests && (
            <div className="flex items-center">
              <Users className="w-4 h-4 mr-2 text-indigo-500" />
              <span>{parsedBookingDetails.guests} Guests</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// --- Main Component ---

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

  // Helper function to parse location details (copied from original)
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
    return name ? (addr ? `${name} - ${addr}` : name) : (addr || '');
  };

  // ⭐ Compute quote once; keeps renders snappy
  const { quoteList, accepted, latestPending, best } = React.useMemo(() => {
    const all = Object.values(quotes || {}).filter((q: any) => {
      const qBookingId =
        q?.booking_request_id ??
        (q as any)?.booking_requestId ??
        (q?.booking_request ? (q as any).booking_request.id : null);
      return Number(qBookingId) === Number(bookingRequestId);
    });
    const acc = all.find((q: any) => String(q?.status || '').toLowerCase().includes('accepted')) || null;
    const pending = all.filter((q: any) => {
      const s = String(q?.status || '').toLowerCase();
      return s === 'pending' || s.includes('pending');
    });
    const lastPending = pending.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0] || null;
    return {
      quoteList: all,
      accepted: acc,
      latestPending: lastPending,
      best: acc || lastPending || null,
    };
  }, [quotes, bookingRequestId]);

  // ⭐ Build Add-to-Calendar link
  const icsHref = React.useMemo(() => {
    return buildICS(parsedBookingDetails, serviceName, getLocationLabel() || parsedBookingDetails?.location);
  }, [parsedBookingDetails, serviceName]);

  // ⭐ Copy order id convenience
  const handleCopyOrder = React.useCallback(async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* no-op */
    }
  }, []);

  return (
    // ⭐ Removed overflow-hidden; created a 2-row grid with internal scroll that works in pages and modals
    <div className="bg-white min-h-[100dvh] grid grid-rows-[auto,1fr]">
      {!hideHeader && (
        <>
          <AvatarHeader
            imageUrl={imageUrl}
            serviceName={serviceName}
            artistName={artistName}
            bookingConfirmed={bookingConfirmed}
            parsedBookingDetails={parsedBookingDetails}
          />
          {belowHeader && (
            <div className="px-6 py-4 border-b border-gray-100">
              {belowHeader}
            </div>
          )}
        </>
      )}

      {/* ⭐ Scroll container (row 2). Stable gutter avoids layout shift when scrollbar appears */}
      <main className="overflow-y-auto [scrollbar-gutter:stable] overscroll-contain">
        <div className="px-6 py-4 text-sm leading-relaxed">
          {/* Event Details */}
          <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Event Details</h2>
          <dl className="space-y-3">
            {showEventDetails && parsedBookingDetails?.eventType && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Event Type:</dt>
                <dd className="text-gray-800">{parsedBookingDetails.eventType}</dd>
              </div>
            )}
            {showEventDetails && parsedBookingDetails?.date && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Date & Time:</dt>
                <dd className="text-gray-800">
                  {isValid(new Date(parsedBookingDetails.date))
                    ? format(new Date(parsedBookingDetails.date), 'PPP p')
                    : parsedBookingDetails.date}
                </dd>
              </div>
            )}
            {showEventDetails && getLocationLabel() && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Location:</dt>
                <dd className="text-gray-800">{getLocationLabel()}</dd>
              </div>
            )}
            {showEventDetails && parsedBookingDetails?.guests && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Guests:</dt>
                <dd className="text-gray-800">{parsedBookingDetails.guests}</dd>
              </div>
            )}
            {showEventDetails && parsedBookingDetails?.venueType && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Venue Type:</dt>
                <dd className="text-gray-800">{parsedBookingDetails.venueType}</dd>
              </div>
            )}
            {showSound && showEventDetails && parsedBookingDetails?.soundNeeded && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Sound:</dt>
                <dd className="text-gray-800">{parsedBookingDetails.soundNeeded}</dd>
              </div>
            )}
            {showEventDetails && parsedBookingDetails?.notes && (
              <div className="flex items-start">
                <dt className="font-semibold w-28 text-gray-600 shrink-0">Notes:</dt>
                <dd className="text-gray-800 italic">{parsedBookingDetails.notes}</dd>
              </div>
            )}
          </dl>

          {/* Quick actions: add to calendar / share (booka-style helpful touches) */}
          {(icsHref || parsedBookingDetails?.date) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {icsHref && (
                <a
                  href={icsHref}
                  download="booka-event.ics"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Add to Calendar
                </a>
              )}
              {typeof navigator !== 'undefined' && (navigator as any).share && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      (navigator as any).share({
                        title: serviceName || 'Booka Event',
                        text: artistName ? `with ${artistName}` : undefined,
                        url: typeof window !== 'undefined' ? window.location.href : undefined,
                      });
                    } catch {}
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
            </div>
          )}

          {/* Order & receipt */}
          {(bookingConfirmed || paymentInfo.status) && (
            <div className="mt-6 pt-4 border-t border-gray-200" id="order">
              <h2 className="text-xl font-bold text-gray-800 mb-3">Order Information</h2>
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
                      return (
                        <>
                          <span className="text-xs font-normal text-gray-500">({reference})</span>
                          <button
                            type="button"
                            title="Copy order reference"
                            onClick={() => handleCopyOrder(`${bookingDetails?.id ?? ''} ${reference}`.trim())}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                          >
                            <Clipboard className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </button>
                        </>
                      );
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
            </div>
          )}

          {/* Personalized Video Brief Link */}
          {(() => {
            const isClient = user?.user_type === 'client';
            const isProvider = user?.user_type === 'service_provider';
            const canShow = !!briefLink && (isClient || (isProvider && briefComplete));
            const label = briefComplete ? 'View Brief' : 'Finish Brief';
            if (!canShow) return null;
            return (
              <div className="mt-6">
                <a
                  href={briefLink}
                  className="block text-center bg-indigo-600 text-white font-semibold rounded-lg px-4 py-3 shadow-lg hover:bg-indigo-700 transition"
                >
                  {label}
                </a>
              </div>
            );
          })()}

          {/* Estimate or Costing Totals */}
          {(() => {
            if (quotesLoading && (quoteList?.length ?? 0) === 0) {
              return (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">Costing</h2>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-2 animate-pulse">
                    <div className="h-4 w-1/2 rounded bg-gray-200" />
                    <div className="h-4 w-1/3 rounded bg-gray-200" />
                    <div className="h-4 w-5/12 rounded bg-gray-200" />
                    <div className="h-4 w-1/2 rounded bg-gray-200" />
                  </div>
                </div>
              );
            }

            if (best) {
              const base = Array.isArray(best.services)
                ? best.services.reduce((sum: number, s: any) => sum + Number(s?.price || 0), 0)
                : 0;
              const sound = Number((best as any).sound_fee || 0);
              const travel = Number((best as any).travel_fee || 0);
              const discount = Number((best as any).discount || 0);
              const subtotal = Number((best as any).subtotal || (base + sound + travel - discount));
              const total = Number((best as any).total || subtotal);
              const vat = Math.max(0, total - subtotal);
              const isClient = user?.user_type === 'client';
              // Client-facing informational fee preview (applied at checkout)
              const fee = subtotal * 0.03; // 3% of provider subtotal
              const feeVat = fee * 0.15;   // 15% VAT on fee
              const feeIncl = fee + feeVat;
              const clientTotal = Number((best as any)?.client_total_preview ?? (total + feeIncl));
              const totalAmount = isClient ? clientTotal : total;

              return (
                <div className="mt-6 pt-4 border-t border-gray-200" aria-live="polite">
                  <h2 className="text-xl font-bold text-gray-800 mb-3">Cost Summary</h2>
                  <div className="rounded-lg bg-white border border-gray-200 p-4 space-y-2 shadow-inner">
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
                    {(best as any).accommodation && (
                      <div className="flex justify-between text-gray-700">
                        <span>Accommodation</span>
                        <span>{(best as any).accommodation}</span>
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
                        <span>{formatCurrency(feeIncl)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-extrabold text-lg mt-3 pt-3 border-t border-gray-300">
                      <span className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                        Final Total
                      </span>
                      <span>{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  {allowInstantBooking && !accepted && (
                    <div className="mt-4 text-right">
                      <Button
                        type="button"
                        onClick={() =>
                          openPaymentModal({
                            bookingRequestId,
                            amount: Number((best as any).total || 0),
                            customerEmail: (user as any)?.email || undefined,
                          })
                        }
                        className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 text-base font-semibold rounded-lg shadow-xl transition"
                      >
                        Reserve Now &rarr;
                      </Button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 mb-3">Costing</h2>
                <div className="rounded-lg border border-dashed border-gray-400 bg-gray-50 p-4 text-sm text-gray-600 text-center italic">
                  No quote is available yet for this request. Awaiting provider response.
                </div>
              </div>
            );
          })()}

          {/* Policy */}
          {showPolicy && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-3">Cancellation Policy</h2>
              <p className="text-gray-700 text-sm leading-relaxed">
                {artistCancellationPolicy?.trim() ||
                  'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider. Please review the full terms before confirming.'}
              </p>
            </div>
          )}

          {/* Links */}
          <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4 pb-24">
            <a
              href={currentArtistId ? `/service-providers/${currentArtistId}` : '#'}
              className="block text-center bg-gray-800 text-white font-semibold rounded-lg px-4 py-3 shadow-md hover:bg-gray-900 transition"
            >
              View Service Profile
            </a>
            <a
              href="/support"
              className="block text-center bg-white text-gray-800 font-semibold rounded-lg px-4 py-3 border border-gray-300 shadow-md hover:bg-gray-50 transition"
            >
              Get Support
            </a>
          </div>
        </div>

        {/* ⭐ Sticky bottom action area (nice on long scroll) */}
        {allowInstantBooking && !accepted && best && (
          <div className="sticky bottom-0 inset-x-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur p-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                Ready to lock this in?
              </div>
              <Button
                type="button"
                onClick={() =>
                  openPaymentModal({
                    bookingRequestId,
                    amount: Number((best as any).total || 0),
                    customerEmail: (user as any)?.email || undefined,
                  })
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 text-base font-semibold rounded-lg shadow-xl transition"
              >
                Reserve Now
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
