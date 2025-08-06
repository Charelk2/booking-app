import React from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@/lib/utils';
import StatusBadge from '../ui/StatusBadge';

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
  className?: string;
  /**
   * Optional label for a call-to-action link inside the bubble.
   * When provided along with `onAction`, a small link-styled
   * button appears below the quote details.
   */
  actionLabel?: string;
  /**
   * Callback fired when the action link is clicked.
   */
  onAction?: () => void;
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
  className,
  actionLabel,
  onAction,
}: QuoteBubbleProps) {
  return (
    <div
      className={clsx(
        'bg-brand/10 rounded-xl p-4 max-w-xs sm:max-w-md dark:bg-brand-dark/30',
        className,
      )}
    >
      <h4 className="text-sm font-semibold mb-1">
        Quote
      </h4>
      <ul className="space-y-1">
        <li className="text-sm">
          {description} –{' '}
          <span className="font-semibold">
            {formatCurrency(Number(price))}
          </span>
        </li>
        {soundFee !== undefined && (
          <li className="text-sm">
            Sound fee:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(soundFee))}
            </span>
          </li>
        )}
        {travelFee !== undefined && (
          <li className="text-sm">
            Travel fee:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(travelFee))}
            </span>
          </li>
        )}
        {accommodation && (
          <li className="text-sm">
            Accommodation: {accommodation}
          </li>
        )}
        {discount !== undefined && (
          <li className="text-sm">
            Discount:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(discount))}
            </span>
          </li>
        )}
        <li className="text-sm">
          Subtotal:{' '}
          <span className="font-semibold">
            {formatCurrency(Number(subtotal))}
          </span>
        </li>
        <li className="text-sm">
          Total:{' '}
          <span className="font-semibold">
            {formatCurrency(Number(total))}
          </span>
        </li>
      </ul>
      <div className="mt-2">
        <StatusBadge status={status} />
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
