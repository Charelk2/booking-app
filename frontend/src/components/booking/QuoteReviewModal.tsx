import React, { useState } from 'react';
import { QuoteV2 } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  open: boolean;
  quote: QuoteV2 | null;
  onClose: () => void;
  onAccept: (quote: QuoteV2) => Promise<void> | void;
  onDecline: (quote: QuoteV2) => Promise<void> | void;
}

const QuoteReviewModal: React.FC<Props> = ({
  open,
  quote,
  onClose,
  onAccept,
  onDecline,
}) => {
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  if (!open || !quote) return null;

  const handleAccept = async () => {
    setLoading('accept');
    try {
      await onAccept(quote);
    } finally {
      setLoading(null);
      onClose();
    }
  };

  const handleDecline = async () => {
    if (!window.confirm('Are you sure?')) return;
    setLoading('decline');
    try {
      await onDecline(quote);
    } finally {
      setLoading(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Quote Review</h2>
          <ul className="space-y-2">
            {quote.services.map((s, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>{s.description}</span>
                <span>{formatCurrency(Number(s.price))}</span>
              </li>
            ))}
            <li className="flex justify-between text-sm">
              <span>Sound fee</span>
              <span>{formatCurrency(Number(quote.sound_fee))}</span>
            </li>
            <li className="flex justify-between text-sm">
              <span>Travel fee</span>
              <span>{formatCurrency(Number(quote.travel_fee))}</span>
            </li>
            {quote.discount !== undefined && quote.discount !== null && (
              <li className="flex justify-between text-sm">
                <span>Discount</span>
                <span>-{formatCurrency(Number(quote.discount))}</span>
              </li>
            )}
            <li className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
              <span>Subtotal</span>
              <span>{formatCurrency(Number(quote.subtotal))}</span>
            </li>
            <li className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(Number(quote.total))}</span>
            </li>
          </ul>
        </div>
        <div className="p-6 bg-gray-50 border-t flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
            disabled={loading !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDecline}
            className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center min-w-[80px]"
            disabled={loading !== null}
          >
            {loading === 'decline' ? (
              <div
                className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                data-testid="decline-spinner"
              />
            ) : (
              'Decline'
            )}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center min-w-[80px]"
            disabled={loading !== null}
          >
            {loading === 'accept' ? (
              <div
                className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                data-testid="accept-spinner"
              />
            ) : (
              'Accept'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteReviewModal;
