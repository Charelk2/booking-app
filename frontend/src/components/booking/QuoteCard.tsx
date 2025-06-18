import React from 'react';
import Button from '../ui/Button';
import { QuoteV2 } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  quote: QuoteV2;
  isClient: boolean;
  onAccept: () => void;
  onDecline: () => void;
  bookingConfirmed: boolean;
}

const QuoteCard: React.FC<Props> = ({ quote, isClient, onAccept, onDecline, bookingConfirmed }) => {
  const statusMap: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    expired: 'Expired',
  };
  return (
    <div className="border rounded-lg p-3 bg-gray-50 mt-2" data-testid="quote-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium">Quote</h3>
        {quote.status === 'accepted' && (
          <span className="ml-2 rounded bg-green-100 text-green-800 px-2 py-0.5 text-xs">Accepted</span>
        )}
      </div>
      <ul className="list-disc list-inside text-sm mb-1">
        {quote.services.map((s, i) => (
          <li key={i}>{s.description} – {formatCurrency(Number(s.price))}</li>
        ))}
      </ul>
      <p className="text-sm">Sound fee: {formatCurrency(Number(quote.sound_fee))}</p>
      <p className="text-sm">Travel fee: {formatCurrency(Number(quote.travel_fee))}</p>
      {quote.accommodation && (
        <p className="text-sm">Accommodation: {quote.accommodation}</p>
      )}
      <p className="text-sm font-medium">Subtotal: {formatCurrency(Number(quote.subtotal))}</p>
      {quote.discount && (
        <p className="text-sm">Discount: {formatCurrency(Number(quote.discount))}</p>
      )}
      <p className="font-semibold">Total: {formatCurrency(Number(quote.total))}</p>
      {quote.expires_at && (
        <span className="text-xs text-gray-500">Expires {new Date(quote.expires_at).toLocaleString()}</span>
      )}
      <div className="mt-2">
        <span className="text-xs mr-2">Status: {statusMap[quote.status]}</span>
        {quote.status === 'pending' && isClient && !bookingConfirmed && (
          <>
            <Button type="button" onClick={onAccept} className="mr-2" size="sm">Accept</Button>
            <Button type="button" onClick={onDecline} variant="secondary" size="sm">Decline</Button>
          </>
        )}
        {bookingConfirmed && <span className="ml-2 text-green-600">🎉 Booking Confirmed</span>}
      </div>
    </div>
  );
};

export default QuoteCard;
