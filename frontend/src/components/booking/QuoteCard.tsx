import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import Button from '../ui/Button';
import { QuoteV2 } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { downloadQuotePdf } from '@/lib/api';

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
  const [remaining, setRemaining] = useState('');
  const [warning, setWarning] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      const res = await downloadQuotePdf(quote.id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Quote PDF download error', err);
    }
  };

  useEffect(() => {
    if (!quote.expires_at || quote.status !== 'pending') {
      setRemaining('');
      setWarning(false);
      return undefined;
    }
    const expires = new Date(quote.expires_at).getTime();
    function update() {
      const diff = expires - Date.now();
      setWarning(diff < 24 * 60 * 60 * 1000);
      if (diff <= 0) {
        setRemaining('0h');
        return;
      }
      const d = Math.floor(diff / (24 * 60 * 60 * 1000));
      const h = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const parts: string[] = [];
      if (d > 0) parts.push(`${d}d`);
      if (h > 0) parts.push(`${h}h`);
      else if (d === 0 && m > 0) parts.push(`${m}m`);
      setRemaining(parts.join(' '));
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [quote.expires_at, quote.status]);
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
      {/* Booka Service Fee (3%) — VAT included (informational; applied at checkout)
          Only clients see this line; providers' view hides client fees. */}
      {isClient && (() => {
        const ps = Number(quote.subtotal) || 0;
        const fee = ps * 0.03;
        const feeVat = fee * 0.15;
        const feeIncl = fee + feeVat;
        return (
          <p className="text-sm">
            Booka Service Fee (3% — VAT included): {formatCurrency(feeIncl)}{' '}
            <span className="text-xs text-gray-500">(added at checkout)</span>
          </p>
        );
      })()}
      {quote.discount && (
        <p className="text-sm">Discount: {formatCurrency(Number(quote.discount))}</p>
      )}
      <p className="font-semibold">Total: {formatCurrency(Number(quote.total))}</p>
      {quote.expires_at && quote.status === 'pending' ? (
        <span
          className={clsx('text-xs', warning ? 'text-orange-600' : 'text-gray-500')}
          data-testid="expires-countdown"
        >
          Expires in {remaining}
        </span>
      ) : (
        quote.expires_at && (
          <span className="text-xs text-gray-500">Expires {new Date(quote.expires_at).toLocaleString()}</span>
        )
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
        <Button
          type="button"
          onClick={handleDownloadPdf}
          variant="secondary"
          size="sm"
          data-testid="download-quote-pdf"
          className="ml-2"
        >
          Download PDF
        </Button>
      </div>
    </div>
  );
};

export default QuoteCard;
