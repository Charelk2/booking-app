import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';
import { createPayment } from '@/lib/api';

interface PaymentSuccess {
  status: string;
  amount: number;
  receiptUrl?: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  bookingRequestId: number;
  onSuccess: (result: PaymentSuccess) => void;
  onError: (msg: string) => void;
  depositAmount?: number;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  bookingRequestId,
  onSuccess,
  onError,
  depositAmount,
}) => {
  const [amount, setAmount] = useState(
    depositAmount !== undefined ? depositAmount.toString() : '',
  );
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && depositAmount !== undefined) {
      setAmount(depositAmount.toString());
    }
  }, [depositAmount, open]);

  if (!open) return null;

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createPayment({
        booking_request_id: bookingRequestId,
        amount: Number(amount),
        full,
      });
      const paymentId = (res.data as { payment_id?: string }).payment_id;
      const receiptUrl = paymentId
        ? `/api/v1/payments/${paymentId}/receipt`
        : undefined;
      onSuccess({
        status: full ? 'paid' : 'deposit_paid',
        amount: Number(amount),
        receiptUrl,
      });
    } catch (err) {
      console.error('Failed to create payment', err);
      const msg = (err as Error).message;
      setError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4">
        <h2 className="text-lg font-medium mb-2">Pay Deposit</h2>
        <div className="space-y-2">
          <input
            type="number"
            className="w-full border rounded p-1"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
            />
            Pay full amount
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handlePay} isLoading={loading}>
            Pay
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
