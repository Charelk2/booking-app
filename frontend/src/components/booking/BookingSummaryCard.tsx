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

interface BookingSummaryCardProps {
  parsedBookingDetails?: ParsedBookingDetails;
  imageUrl?: string | null;
  serviceName?: string;
  artistName?: string;
  bookingConfirmed: boolean;
  paymentInfo: {
    status: string | null;
    amount: number | null;
    receiptUrl: string | null;
  };
  bookingDetails: Booking | null;
  quotes: Record<number, QuoteV2>;
  allowInstantBooking?: boolean;
  openPaymentModal: (args: { bookingRequestId: number; amount: number }) => void;
  bookingRequestId: number;
  baseFee: number;
  travelFee: number;
  initialSound?: boolean;
  artistCancellationPolicy?: string | null;
  currentArtistId: number;
  instantBookingPrice?: number;
}

export default function BookingSummaryCard({
  parsedBookingDetails,
  imageUrl,
  serviceName,
  artistName,
  bookingConfirmed,
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
      <div className="px-4 mt-3 flex items-center gap-3">
        <div className="relative h-16 w-16 rounded-xl overflow-hidden shrink-0">
          {imageUrl ? (
            <SafeImage
              src={imageUrl}
              alt="Service image"
              fill
              className="object-cover"
              sizes="64px"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
            />
          ) : (
            <div className="absolute inset-0 bg-gray-200" aria-hidden="true" />
          )}
        </div>
        <div>
          <div className="text-base font-semibold">
            {serviceName || 'Service'}
          </div>
          <div className="text-sm text-gray-600">
            {artistName || 'Service Provider'}
          </div>
        </div>
      </div>

      <div className="my-4 mt-4 border-t border-gray-200" />

      <div className="px-4 pb-4 overflow-y-auto max-h-[60vh] text-sm leading-6">
        {/* Booking details list */}
        <ul className="divide-y divide-gray-100">
          {parsedBookingDetails?.eventType && (
            <li className="py-2">
              <span className="font-semibold">Event Type:</span>{' '}
              {parsedBookingDetails.eventType}
            </li>
          )}
          {parsedBookingDetails?.date && (
            <li className="py-2">
              <span className="font-semibold">Date:</span>{' '}
              {isValid(new Date(parsedBookingDetails.date))
                ? format(new Date(parsedBookingDetails.date), 'PPP p')
                : parsedBookingDetails.date}
            </li>
          )}
          {(() => {
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
            const label = name ? (addr ? `${name} — ${addr}` : name) : (addr || '');
            return label ? (
              <li className="py-2">
                <span className="font-semibold">Location:</span>{' '}
                {label}
              </li>
            ) : null;
          })()}
          {parsedBookingDetails?.guests && (
            <li className="py-2">
              <span className="font-semibold">Guests:</span>{' '}
              {parsedBookingDetails.guests}
            </li>
          )}
          {parsedBookingDetails?.venueType && (
            <li className="py-2">
              <span className="font-semibold">Venue Type:</span>{' '}
              {parsedBookingDetails.venueType}
            </li>
          )}
          {parsedBookingDetails?.soundNeeded && (
            <li className="py-2">
              <span className="font-semibold">Sound:</span>{' '}
              {parsedBookingDetails.soundNeeded}
            </li>
          )}
          {parsedBookingDetails?.notes && (
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
                <span className="font-medium">{bookingDetails?.id ?? '—'}</span>
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

        {/* Estimate or Quote Totals */}
        {(() => {
          const quoteList = Object.values(quotes || {});
          const accepted = quoteList.find((q) => q.status === 'accepted');
          const pending = quoteList.filter((q) => q.status === 'pending');
          const latestPending = pending.sort((a, b) => (a.id || 0) - (b.id || 0)).slice(-1)[0];
          const best = accepted || latestPending;

          if (best) {
            return (
              <div className="mt-4">
                <div className="font-semibold mb-1">Quote total</div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
                  {best.services?.[0]?.description && (
                    <div className="flex justify-between text-gray-700">
                      <span>{best.services[0].description}</span>
                      <span>{formatCurrency(Number(best.services[0].price || 0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-700">
                    <span>Sound</span>
                    <span>{formatCurrency(Number(best.sound_fee || 0))}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Travel</span>
                    <span>{formatCurrency(Number(best.travel_fee || 0))}</span>
                  </div>
                  {best.accommodation && (
                    <div className="flex justify-between text-gray-700">
                      <span>Accommodation</span>
                      <span>{best.accommodation}</span>
                    </div>
                  )}
                  {Number(best.discount || 0) > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Discount</span>
                      <span>-{formatCurrency(Number(best.discount || 0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold mt-2 border-t border-gray-200 pt-2">
                    <span>Total</span>
                    <span>{formatCurrency(Number(best.total || 0))}</span>
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
              <div className="font-semibold mb-1">Total</div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <div className="flex justify-between text-gray-700">
                  <span>Base fee</span>
                  <span>{formatCurrency(Number(baseFee || 0))}</span>
                </div>
                <div className="flex justify-between text-gray-700 mt-1">
                  <span>Travel</span>
                  <span>{formatCurrency(Number(travelFee || 0))}</span>
                </div>
                <div className="flex justify-between font-semibold mt-2 border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(Number(baseFee || 0) + Number(travelFee || 0))}</span>
                </div>
                {typeof initialSound !== 'undefined' && (
                  <div className="text-xs text-gray-500 mt-1">
                    Sound equipment: {initialSound ? 'Yes' : 'No'} (if required, may be quoted separately)
                  </div>
                )}
              </div>

              {allowInstantBooking && (
                <div className="mt-3 text-right">
                  <Button
                    type="button"
                    onClick={() =>
                      openPaymentModal({
                        bookingRequestId,
                        amount:
                          Number(
                            instantBookingPrice ??
                              Number(baseFee || 0) + Number(travelFee || 0)
                          ),
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
        })()}

        {/* Policy */}
        <div className="mt-5">
          <div className="font-semibold mb-1">Cancellation policy</div>
          <p className="text-gray-600 text-sm">
            {artistCancellationPolicy?.trim() ||
              'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider.'}
          </p>
        </div>

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
