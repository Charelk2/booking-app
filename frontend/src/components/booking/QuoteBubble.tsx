import React from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import StatusBadge from '../ui/StatusBadge';

export interface EventDetails {
  from?: string;
  receivedAt?: string;
  event?: string;
  date?: string;
  guests?: string;
  venue?: string;
  notes?: string;
}

export interface QuoteBubbleProps {
  description: string;
  price: number;
  soundFee?: number;
  travelFee?: number;
  accommodation?: string;
  discount?: number;
  subtotal: number;
  total: number;
  status: 'Pending' | 'Accepted' | 'Rejected';
  expiresAt?: string | null;
  eventDetails?: EventDetails;
  onAccept?: () => void;
  onDecline?: () => void;
  className?: string;
}

export default function QuoteBubble({
  description,
  price,
  soundFee,
  travelFee,
  accommodation,
  discount,
  subtotal,
  total,
  status,
  expiresAt,
  eventDetails,
  onAccept,
  onDecline,
  className,
}: QuoteBubbleProps) {
  const handleAccept = () => onAccept?.();
  const handleDecline = () => onDecline?.();

  return (
    <div
      className={clsx(
        'w-full bg-brand/10 dark:bg-brand-dark/30 rounded-xl p-4',
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">New Booking Request</h4>
          <p className="mb-2 text-xs">
            From: {eventDetails?.from ?? 'N/A'} | Received: {eventDetails?.receivedAt ?? 'N/A'}
          </p>
          <div className="text-xs">
            <p className="mb-1 font-semibold">Event Details</p>
            <ul className="space-y-1">
              {eventDetails?.event && <li>Event: {eventDetails.event}</li>}
              {eventDetails?.date && <li>Date: {eventDetails.date}</li>}
              {eventDetails?.guests && <li>Guests: {eventDetails.guests}</li>}
              {eventDetails?.venue && <li>Venue: {eventDetails.venue}</li>}
              {eventDetails?.notes && <li>Notes: "{eventDetails.notes}"</li>}
            </ul>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Review &amp; Adjust Quote</h4>
          <ul className="space-y-1 text-xs">
            <li className="flex justify-between">
              <span>{description}</span>
              <span className="font-semibold">{formatCurrency(Number(price))}</span>
            </li>
            {travelFee !== undefined && (
              <li className="flex justify-between">
                <span>Travel</span>
                <span className="font-semibold">{formatCurrency(Number(travelFee))}</span>
              </li>
            )}
            {soundFee !== undefined && (
              <li className="flex justify-between">
                <span>Sound</span>
                <span className="font-semibold">{formatCurrency(Number(soundFee))}</span>
              </li>
            )}
            {accommodation && (
              <li className="flex justify-between">
                <span>Accommodation</span>
                <span className="font-semibold">
                  {Number.isNaN(Number(accommodation))
                    ? accommodation
                    : formatCurrency(Number(accommodation))}
                </span>
              </li>
            )}
            {discount !== undefined && (
              <li className="flex justify-between">
                <span>Discount</span>
                <span className="font-semibold">-{formatCurrency(Number(discount))}</span>
              </li>
            )}
            <li className="mt-2 flex justify-between border-t pt-2 font-medium">
              <span>Total</span>
              <span className="font-semibold">{formatCurrency(Number(total))}</span>
            </li>
            {expiresAt && (
              <li className="text-xs text-gray-600">
                Expires: {format(new Date(expiresAt), 'PPP')}
              </li>
            )}
          </ul>
          {status !== 'Pending' ? (
            <div className="mt-2">
              <StatusBadge status={status} />
            </div>
          ) : (
            (onAccept || onDecline) && (
              <div className="mt-3 flex gap-2">
                {onAccept && (
                  <button
                    type="button"
                    onClick={handleAccept}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                  >
                    Accept Quote
                  </button>
                )}
                {onDecline && (
                  <button
                    type="button"
                    onClick={handleDecline}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    Reject Quote
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
