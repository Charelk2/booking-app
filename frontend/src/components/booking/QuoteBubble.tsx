'use client';
import React from 'react';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import { QuoteV2 } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  quote: QuoteV2;
  isClient: boolean;
  onAccept: () => void;
  onDecline: () => void;
  bookingConfirmed: boolean;
}

const QuoteBubble: React.FC<Props> = ({ quote, isClient, onAccept, onDecline, bookingConfirmed }) => {
  const showActions = quote.status === 'pending' && isClient && !bookingConfirmed;
  return (
    <div data-testid="quote-bubble" className="rounded-lg bg-brand/10 text-brand-dark p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">Quote</span>
        <StatusBadge status={quote.status} />
      </div>
      <ul className="list-disc list-inside mb-2">
        {quote.services.map((s, i) => (
          <li key={i}>{s.description} – {formatCurrency(Number(s.price))}</li>
        ))}
      </ul>
      <p>Sound fee: {formatCurrency(Number(quote.sound_fee))}</p>
      <p>Travel fee: {formatCurrency(Number(quote.travel_fee))}</p>
      {quote.accommodation && <p>Accommodation: {quote.accommodation}</p>}
      <p className="font-medium">Subtotal: {formatCurrency(Number(quote.subtotal))}</p>
      {quote.discount && <p>Discount: {formatCurrency(Number(quote.discount))}</p>}
      <p className="font-semibold">Total: {formatCurrency(Number(quote.total))}</p>
      {quote.expires_at && (
        <p className="text-xs text-gray-500">Expires {new Date(quote.expires_at).toLocaleString()}</p>
      )}
      {showActions && (
        <div className="mt-2 flex gap-2">
          <Button type="button" onClick={onAccept} size="sm" className="mr-2">Accept</Button>
          <Button type="button" onClick={onDecline} variant="secondary" size="sm">Decline</Button>
        </div>
      )}
    </div>
  );
};

export default QuoteBubble;
