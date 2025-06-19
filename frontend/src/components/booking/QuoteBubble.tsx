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
}: QuoteBubbleProps) {
  return (
    <div
      className={clsx(
        'bg-brand/10 text-brand-dark rounded-xl p-4 max-w-xs sm:max-w-md dark:bg-brand-dark/30 dark:text-brand-light',
        className,
      )}
    >
      <h4 className="text-sm font-semibold text-brand-dark dark:text-brand-light mb-1">
        Quote
      </h4>
      <ul className="space-y-1">
        <li className="text-sm text-gray-800 dark:text-gray-200">
          {description} –{' '}
          <span className="font-semibold">
            {formatCurrency(Number(price))}
          </span>
        </li>
        {soundFee !== undefined && (
          <li className="text-sm text-gray-800 dark:text-gray-200">
            Sound fee:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(soundFee))}
            </span>
          </li>
        )}
        {travelFee !== undefined && (
          <li className="text-sm text-gray-800 dark:text-gray-200">
            Travel fee:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(travelFee))}
            </span>
          </li>
        )}
        {accommodation && (
          <li className="text-sm text-gray-800 dark:text-gray-200">
            Accommodation: {accommodation}
          </li>
        )}
        {discount !== undefined && (
          <li className="text-sm text-gray-800 dark:text-gray-200">
            Discount:{' '}
            <span className="font-semibold">
              {formatCurrency(Number(discount))}
            </span>
          </li>
        )}
        <li className="text-sm text-gray-800 dark:text-gray-200">
          Subtotal:{' '}
          <span className="font-semibold">
            {formatCurrency(Number(subtotal))}
          </span>
        </li>
        <li className="text-sm text-gray-800 dark:text-gray-200">
          Total:{' '}
          <span className="font-semibold">
            {formatCurrency(Number(total))}
          </span>
        </li>
      </ul>
      <div className="mt-2">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
