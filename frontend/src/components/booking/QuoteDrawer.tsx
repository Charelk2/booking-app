import React, { useMemo } from 'react';
import clsx from 'clsx';
import { format, formatDistanceToNowStrict, isAfter } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import StatusBadge from '../ui/StatusBadge';
import { Booking, QuoteV2 } from '@/types';

interface QuoteDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  quote?: QuoteV2 | null;
  booking?: Booking | null;
  isClientView?: boolean;
  isPaid?: boolean;
  onAccept?: () => void;
  onPayNow?: () => void;
  onDecline?: () => void;
  onOpenReceipt?: () => void;
  eventSummary?: string | null;
  /** Offset from top of viewport so the drawer sits below the header on web */
  topOffset?: number;
  onRequestNewQuote?: () => void;
}

export default function QuoteDrawer({
  isOpen,
  onClose,
  quote,
  booking,
  isClientView,
  isPaid,
  onAccept,
  onPayNow,
  onDecline,
  onOpenReceipt,
  eventSummary,
  topOffset = 0,
  onRequestNewQuote,
}: QuoteDrawerProps) {
  const hasExpiry = !!quote?.expires_at && isAfter(new Date(quote.expires_at), new Date());
  const expiryLabel = isPaid
    ? 'Paid — date secured'
    : hasExpiry
      ? `Expires in ${formatDistanceToNowStrict(new Date(quote!.expires_at!))}`
      : 'Valid until confirmed';
  const isExpired = !!quote && ((quote.expires_at && !isAfter(new Date(quote.expires_at), new Date())) || quote.status === 'expired');

  // Best-effort catch for tax fields without requiring backend schema changes.
  const taxes = useMemo(() => {
    const q: any = quote || {};
    // Support various possible shapes: { taxes: [{label, amount}] } or { vat, tax }
    if (Array.isArray(q.taxes)) return q.taxes as { label?: string; amount: number }[];
    const list: { label?: string; amount: number }[] = [];
    if (typeof q.vat === 'number') list.push({ label: 'VAT', amount: q.vat });
    if (typeof q.tax === 'number') list.push({ label: 'Tax', amount: q.tax });
    return list;
  }, [quote]);

  return (
    <div
      className={clsx(
        'fixed inset-0 z-[10000] pointer-events-none',
        isOpen && 'pointer-events-auto',
      )}
      aria-hidden={!isOpen}
    >
      {/* Overlay (respects topOffset so header remains clickable) */}
      <div
        className={clsx(
          'absolute left-0 right-0 bg-black/40 transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0',
        )}
        style={{ top: topOffset, bottom: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'absolute right-0 w-full sm:w-[420px] bg-white shadow-xl transition-transform',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ top: topOffset, height: `calc(100% - ${topOffset}px)` }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-700">📋</span>
            <h3 className="text-sm font-semibold text-gray-800">
              {quote ? `Quote #${quote.id}` : 'Quote'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-48px)] px-4 py-3">
          {/* Expiry + status */}
          <div className="flex items-center justify-between text-[11px] text-gray-600">
            <span>{expiryLabel}</span>
            {quote && (
              <StatusBadge
                status={
                  isPaid
                    ? 'Paid'
                    : (quote.status === 'pending'
                        ? 'Pending'
                        : quote.status === 'accepted'
                          ? 'Accepted'
                          : quote.status === 'rejected' || quote.status === 'expired'
                            ? 'Rejected'
                            : 'Pending') as any
                }
              />
            )}
          </div>

          {/* Event summary */}
          {eventSummary && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-700">
              {eventSummary}
            </div>
          )}

          {/* Line items */}
          {quote && (
            <div className="mt-3 text-[13px]">
              <div className="mb-2 text-xs font-semibold text-gray-700">Items</div>
              <ul className="space-y-1">
                {quote.services?.map((s, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span className="text-gray-700">{s.description}</span>
                    <span className="font-medium">{formatCurrency(Number(s.price))}</span>
                  </li>
                ))}
                {typeof quote.travel_fee === 'number' && (
                  <li className="flex justify-between">
                    <span className="text-gray-700">Travel</span>
                    <span className="font-medium">{formatCurrency(Number(quote.travel_fee))}</span>
                  </li>
                )}
                {typeof quote.sound_fee === 'number' && (
                  <li className="flex justify-between">
                    <span className="text-gray-700">Sound</span>
                    <span className="font-medium">{formatCurrency(Number(quote.sound_fee))}</span>
                  </li>
                )}
                {quote.accommodation && (
                  <li className="flex justify-between">
                    <span className="text-gray-700">Accommodation</span>
                    <span className="font-medium">
                      {Number.isNaN(Number(quote.accommodation))
                        ? quote.accommodation
                        : formatCurrency(Number(quote.accommodation))}
                    </span>
                  </li>
                )}
                {typeof quote.discount === 'number' && (
                  <li className="flex justify-between">
                    <span className="text-gray-700">Discount</span>
                    <span className="font-medium">-{formatCurrency(Number(quote.discount))}</span>
                  </li>
                )}
                {taxes.length > 0 && taxes.map((t, idx) => (
                  <li key={`tax-${idx}`} className="flex justify-between">
                    <span className="text-gray-700">{t.label || 'Tax'}</span>
                    <span className="font-medium">{formatCurrency(Number(t.amount))}</span>
                  </li>
                ))}
              </ul>
              <div className="my-2 h-px w-full bg-gray-200" />
              <div className="flex justify-between text-[12px]">
                <span>Subtotal</span>
                <span className="font-medium">{formatCurrency(Number(quote.subtotal))}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[12px]">Total</span>
                <span className="text-base font-semibold">{formatCurrency(Number(quote.total))}</span>
              </div>
            </div>
          )}

          {/* Payment / Receipt */}
          {booking && booking.payment_id && (
            <div className="mt-3">
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                onClick={onOpenReceipt}
              >
                View Receipt
              </button>
            </div>
          )}

          {/* Actions */}
          {quote?.status === 'pending' && !isExpired && !isPaid && (
            <div className="mt-4 flex flex-wrap gap-2">
              {isClientView && onAccept && (
                <button
                  type="button"
                  onClick={() => { onClose(); onAccept?.(); onPayNow?.(); }}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                >
                  {onPayNow ? 'Accept & Pay' : 'Accept'}
                </button>
              )}
              {isClientView && onDecline && (
                <button
                  type="button"
                  onClick={onDecline}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Decline
                </button>
              )}
            </div>
          )}

          {quote?.status === 'accepted' && isClientView && onPayNow && !isPaid && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => { onClose(); onPayNow?.(); }}
                className="rounded bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800"
              >
                Pay now
              </button>
            </div>
          )}

          {/* Expired UI */}
          {isExpired && (
            <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 px-3 py-2">
              <div className="text-[12px] text-yellow-800 font-medium">This quote has expired.</div>
              {isClientView && onRequestNewQuote && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={onRequestNewQuote}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Request New Quote
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Payout timing guidance */}
          <div className="mt-4 text-[11px] text-gray-600">
            Booka pays the service provider after the event — next business day (Mon for weekend events).
          </div>
        </div>
      </div>
    </div>
  );
}
