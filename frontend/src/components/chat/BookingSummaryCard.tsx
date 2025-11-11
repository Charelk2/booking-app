'use client';

import React from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { format, isValid } from 'date-fns';
import { getFullImageUrl, formatCurrency, buildReceiptUrl } from '@/lib/utils';
import { Booking, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Users, DollarSign, CheckCircle, User } from 'lucide-react';

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

// --- NEW Header Component (Shorter, Avatar-focused) ---

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
      ? format(new Date(eventDate), 'EEE, MMM d, yyyy')
      : 'Date TBD';
  const formattedTime =
    eventDate && isValid(new Date(eventDate))
      ? format(new Date(eventDate), 'h:mm a')
      : 'Time TBD';

  return (
    <div className="relative w-full bg-gray-50 border-b border-gray-200 p-6">
      {/* Background Element (Cool, subtle pattern) */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }} />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Avatar/Image */}
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

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          {/* Confirmation Status Badge */}
          {bookingConfirmed && (
            <div className="mb-1 inline-flex items-center rounded-full bg-green-500/90 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white shadow-md">
              <CheckCircle className="w-3 h-3 mr-1" />
              Confirmed
            </div>
          )}

          {/* Service Name (Main Title) */}
          <h1 className="text-xl font-extrabold leading-tight text-gray-900 truncate">
            {serviceName || 'Booking Details'}
          </h1>

          {/* Artist Name (Subtitle) */}
          {artistName && (
            <p className="text-sm font-medium text-gray-600 truncate">
              with {artistName}
            </p>
          )}
        </div>
      </div>

      {/* Key Details Bar - Moved below the main content for better flow */}
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

  return (
    // Removed rounded-xl and shadow-2xl from the main container to allow for full-width content
    <div className="bg-white overflow-hidden"> 
      {!hideHeader && (
        <>
          {/* New Avatar-focused Header */}
          <AvatarHeader
            imageUrl={imageUrl}
            serviceName={serviceName}
            artistName={artistName}
            bookingConfirmed={bookingConfirmed}
            parsedBookingDetails={parsedBookingDetails}
          />
          
          {/* Content below the header image, if any */}
          {belowHeader && (
            <div className="px-6 py-4 border-b border-gray-100">
              {belowHeader}
            </div>
          )}
        </>
      )}

      {/* Removed max-h and overflow-y-auto to fix scrolling issue. Changed p-6 to px-6 py-4 to reduce vertical padding. */}
      <div className="px-6 py-4 text-sm leading-relaxed"> 
        {/* Booking details list - Enhanced Styling */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Event Details</h2>
        <ul className="space-y-3">
          {showEventDetails && parsedBookingDetails?.eventType && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Event Type:</span>
              <span className="text-gray-800">{parsedBookingDetails.eventType}</span>
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.date && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Date & Time:</span>
              <span className="text-gray-800">
                {isValid(new Date(parsedBookingDetails.date))
                  ? format(new Date(parsedBookingDetails.date), 'PPP p')
                  : parsedBookingDetails.date}
              </span>
            </li>
          )}
          {showEventDetails && getLocationLabel() && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Location:</span>
              <span className="text-gray-800">{getLocationLabel()}</span>
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.guests && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Guests:</span>
              <span className="text-gray-800">{parsedBookingDetails.guests}</span>
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.venueType && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Venue Type:</span>
              <span className="text-gray-800">{parsedBookingDetails.venueType}</span>
            </li>
          )}
          {showSound && showEventDetails && parsedBookingDetails?.soundNeeded && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Sound:</span>
              <span className="text-gray-800">{parsedBookingDetails.soundNeeded}</span>
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.notes && (
            <li className="flex items-start">
              <span className="font-semibold w-24 text-gray-600 shrink-0">Notes:</span>
              <span className="text-gray-800 italic">{parsedBookingDetails.notes}</span>
            </li>
          )}
        </ul>

        {/* Order & receipt */}
        {(bookingConfirmed || paymentInfo.status) && (
          <div className="mt-6 pt-4 border-t border-gray-200">
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
                      <span className="text-xs font-normal text-gray-500">
                       ({reference})
                      </span>
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
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition duration-150"
                    >
                      View Receipt &rarr;
                    </a>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* Personalized Video Brief Link (client-side only) */}
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
              className="block text-center bg-indigo-600 text-white font-semibold rounded-lg px-4 py-3 shadow-lg hover:bg-indigo-700 transition duration-150"
            >
              {label}
            </a>
          </div>
          );
        })()}

        {/* Estimate or Costing Totals */}
        {(() => {
          const quoteList = Object.values(quotes || {}).filter((q: any) => {
            const qBookingId =
              q?.booking_request_id ??
              (q as any)?.booking_requestId ??
              (q?.booking_request ? (q as any).booking_request.id : null);
            return Number(qBookingId) === Number(bookingRequestId);
          });
          const accepted = quoteList.find((q: any) =>
            String(q?.status || '').toLowerCase().includes('accepted')
          );
          const pending = quoteList.filter((q: any) => {
            const s = String(q?.status || '').toLowerCase();
            return s === 'pending' || s.includes('pending');
          });
          const latestPending = pending.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0];
          const best = accepted || latestPending;

          if (quotesLoading && quoteList.length === 0) {
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
              ? best.services.reduce((sum, s: any) => sum + Number(s?.price || 0), 0)
              : 0;
            const sound = Number(best.sound_fee || 0);
            const travel = Number(best.travel_fee || 0);
            const discount = Number(best.discount || 0);
            const subtotal = Number(best.subtotal || (base + sound + travel - discount));
            const total = Number(best.total || subtotal);
            const vat = Math.max(0, total - subtotal);
            const isClient = user?.user_type === 'client';
            // Client-facing informational fee preview (applied at checkout)
            const fee = subtotal * 0.03; // 3% of provider subtotal (services + travel + sound)
            const feeVat = fee * 0.15;   // 15% VAT on fee
            const feeIncl = fee + feeVat;
            const clientTotal = Number((best as any)?.client_total_preview ?? (total + feeIncl));
            
            const totalAmount = isClient ? clientTotal : total;

            return (
              <div className="mt-6 pt-4 border-t border-gray-200">
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
                  {best.accommodation && (
                    <div className="flex justify-between text-gray-700">
                      <span>Accommodation</span>
                      <span>{best.accommodation}</span>
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
                          amount: Number(best.total || 0),
                          customerEmail: (user as any)?.email || undefined,
                        })
                      }
                      className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 text-base font-semibold rounded-lg shadow-xl transition duration-150"
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

        {/* Links - Now visible due to scrolling fix */}
        <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href={currentArtistId ? `/service-providers/${currentArtistId}` : '#'}
            className="block text-center bg-gray-800 text-white font-semibold rounded-lg px-4 py-3 shadow-md hover:bg-gray-900 transition duration-150"
          >
            View Service Profile
          </a>
          <a
            href="/support"
            className="block text-center bg-white text-gray-800 font-semibold rounded-lg px-4 py-3 border border-gray-300 shadow-md hover:bg-gray-50 transition duration-150"
          >
            Get Support
          </a>
        </div>
      </div>
    </div>
  );
}
