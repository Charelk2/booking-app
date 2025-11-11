'use client';

import React from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { format, isValid } from 'date-fns';
import { getFullImageUrl, formatCurrency, buildReceiptUrl } from '@/lib/utils';
import { Booking, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';

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

  return (
    <>
      {!hideHeader && (
        <>
          <div className="px-4 mt-3 mb-3 flex items-center gap-3">
            <div className="relative h-16 w-16 rounded-xl overflow-hidden shrink-0">
              <SafeImage
                src={(getFullImageUrl(imageUrl || null) || imageUrl) as string | undefined}
                alt="Service image"
                fill
                className="object-cover"
                sizes="64px"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
              />
            </div>
            {!hideHeaderText && (
              <div>
                <div className="text-base font-semibold">
                  {serviceName || 'Service'}
                </div>
                {artistName ? (
                  <div className="text-sm text-gray-600">{artistName}</div>
                ) : null}
              </div>
            )}
          </div>

          {belowHeader && (
            <div className="px-4 mt-2">
              {belowHeader}
            </div>
          )}

          <div className="mt-4 border-t border-gray-200" />
        </>
      )}

      <div className="px-4 pb-4 overflow-y-auto max-h-[60vh] text-sm leading-6">
        {/* Booking details list */}
        <ul className="divide-y divide-gray-100">
          {showEventDetails && parsedBookingDetails?.eventType && (
            <li className="py-2">
              <span className="font-semibold">Event Type:</span>{' '}
              {parsedBookingDetails.eventType}
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.date && (
            <li className="py-2">
              <span className="font-semibold">Date:</span>{' '}
              {isValid(new Date(parsedBookingDetails.date))
                ? format(new Date(parsedBookingDetails.date), 'PPP p')
                : parsedBookingDetails.date}
            </li>
          )}
          {showEventDetails && (() => {
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
            const label = name ? (addr ? `${name} - ${addr}` : name) : (addr || '');
            return label ? (
              <li className="py-2">
                <span className="font-semibold">Location:</span>{' '}
                {label}
              </li>
            ) : null;
          })()}
          {showEventDetails && parsedBookingDetails?.guests && (
            <li className="py-2">
              <span className="font-semibold">Guests:</span>{' '}
              {parsedBookingDetails.guests}
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.venueType && (
            <li className="py-2">
              <span className="font-semibold">Venue Type:</span>{' '}
              {parsedBookingDetails.venueType}
            </li>
          )}
          {showSound && showEventDetails && parsedBookingDetails?.soundNeeded && (
            <li className="py-2">
              <span className="font-semibold">Sound:</span>{' '}
              {parsedBookingDetails.soundNeeded}
            </li>
          )}
          {showEventDetails && parsedBookingDetails?.notes && (
            <li className="py-2">
              <span className="font-semibold">Notes:</span>{' '}
              {parsedBookingDetails.notes}
            </li>
          )}
        </ul>

        {/* Order & receipt */}
        {(bookingConfirmed || paymentInfo.status) && (
          <div className="mt-4">
            <div className="font-semibold mb-1">Order</div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Order number</span>
                <span className="font-medium flex items-center gap-2">
                  {bookingDetails?.id != null ? `#${bookingDetails.id}` : ''}
                  {(() => {
                    const reference =
                      paymentInfo.reference ||
                      (bookingDetails?.payment_id ? String(bookingDetails.payment_id) : null);
                    if (!reference) return null;
                    return (
                      <span className="text-xs font-normal text-gray-500">
                       {reference}
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
                  <div className="mt-2 text-right">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline text-gray-700"
                    >
                      View receipt
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
          const label = briefComplete ? 'View brief' : 'Finish brief';
          if (!canShow) return null;
          return (
          <div className="mt-4">
            <a
              href={briefLink}
              className="block text-center bg-black text-white font-semibold rounded-lg border border-gray-200 px-3 py-2 hover:bg-black hover:text-white hover:no-underline"
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
          const loadingQuotes = Boolean(quotesLoading) && quoteList.length === 0;
          // Tolerate variant status strings (e.g., 'accepted_by_client', 'pending_client_action')
          const accepted = quoteList.find((q: any) => String(q?.status || '').toLowerCase().includes('accept'));
          const pending = quoteList.filter((q: any) => {
            const s = String(q?.status || '').toLowerCase();
            return s === 'pending' || s.includes('pending');
          });
          const latestPending = pending.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0];
          const best = accepted || latestPending;

          if (loadingQuotes) {
            return (
              <div className="mt-4">
                <div className="font-semibold mb-1">Costing</div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2 animate-pulse">
                  <div className="h-3 w-1/2 rounded bg-gray-200" />
                  <div className="h-3 w-1/3 rounded bg-gray-200" />
                  <div className="h-3 w-5/12 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-200" />
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
            return (
              <div className="mt-4">
                <div className="font-semibold mb-1">Costing</div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
                  <div className="flex justify-between text-gray-700">
                    <span>Base fee</span>
                    <span>{formatCurrency(base)}</span>
                  </div>
                  {showSound && (
                    <div className="flex justify-between text-gray-700">
                      <span>Sound</span>
                      <span>{formatCurrency(sound)}</span>
                    </div>
                  )}
                  {showTravel && (
                    <div className="flex justify-between text-gray-700">
                      <span>Travel</span>
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
                    <div className="flex justify-between text-gray-700">
                      <span>Discount</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {vat > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>VAT</span>
                      <span>{formatCurrency(vat)}</span>
                    </div>
                  )}
                  {isClient && (
                    <div className="flex justify-between text-gray-700">
                      <span>Booka Service Fee (3% — VAT included)</span>
                      <span>{formatCurrency(feeIncl)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold mt-2 border-t border-gray-200 pt-2">
                    <span>Total</span>
                    <span>{formatCurrency(isClient ? clientTotal : total)}</span>
                  </div>
                </div>

                {allowInstantBooking && !accepted && (
                  <div className="mt-3 text-right">
                    <Button
                      type="button"
                      onClick={() =>
                        openPaymentModal({
                          bookingRequestId,
                          amount: Number(best.total || 0),
                          customerEmail: (user as any)?.email || undefined,
                        })
                      }
                      className="bg-gray-900 text-white hover:bg-black"
                    >
                      Reserve now
                    </Button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="mt-4">
              <div className="font-semibold mb-1">Costing</div>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                No quote is available yet for this request.
              </div>
            </div>
          );
        })()}

        {/* Policy */}
        {showPolicy && (
        <div className="mt-5">
          <div className="font-semibold mb-1">Cancellation policy</div>
          <p className="text-gray-600 text-sm">
            {artistCancellationPolicy?.trim() ||
              'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider.'}
          </p>
        </div>
        )}

        {/* Links */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a
            href={currentArtistId ? `/service-providers/${currentArtistId}` : '#'}
            className="block text-center bg-black text-white font-semibold rounded-lg border border-gray-200 px-3 py-2 hover:bg-black hover:text-white hover:no-underline"
          >
            View service
          </a>
          <a
            href="/support"
            className="block text-center bg-black text-white font-semibold rounded-lg border border-gray-200 px-3 py-2 hover:bg-black hover:text-white hover:no-underline"
          >
            Get support
          </a>
        </div>
      </div>
    </>
  );
}
// moved to chat folder
