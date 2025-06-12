import React from 'react';
import Button from '../ui/Button';
import { QuoteV2 } from '@/types';

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
      <h3 className="font-medium mb-1">Quote</h3>
      <ul className="list-disc list-inside text-sm mb-1">
        {quote.services.map((s, i) => (
          <li key={i}>{s.description} – {Number(s.price).toFixed(2)}</li>
        ))}
      </ul>
      <p className="text-sm">Sound fee: {Number(quote.sound_fee).toFixed(2)}</p>
      <p className="text-sm">Travel fee: {Number(quote.travel_fee).toFixed(2)}</p>
      {quote.accommodation && (
        <p className="text-sm">Accommodation: {quote.accommodation}</p>
      )}
      <p className="text-sm font-medium">Subtotal: {Number(quote.subtotal).toFixed(2)}</p>
      {quote.discount && (
        <p className="text-sm">Discount: {Number(quote.discount).toFixed(2)}</p>
      )}
      <p className="font-semibold">Total: {Number(quote.total).toFixed(2)}</p>
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
