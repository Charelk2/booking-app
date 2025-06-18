'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyClientBookings, getBookingDetails } from '@/lib/api';
import type { Booking, Review } from '@/types';
import ReviewFormModal from '@/components/review/ReviewFormModal';
import PaymentModal from '@/components/booking/PaymentModal';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { HelpPrompt } from '@/components/ui';

interface BookingWithReview extends Booking {
  review?: Review | null;
}

function BookingList({
  items,
  onReview,
  onPayDeposit,
}: {
  items: BookingWithReview[];
  onReview: (id: number) => void;
  onPayDeposit: (id: number) => void;
}) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.id}>
          <Link
            href={`/dashboard/client/bookings/${b.id}`}
            data-booking-id={b.id}
            className="block bg-white p-4 shadow rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <div className="font-medium text-gray-900">{b.service.title}</div>
            <div className="text-sm text-gray-500">
              {format(new Date(b.start_time), 'MMM d, yyyy h:mm a')}
            </div>
            <div className="mt-2 flex justify-between items-center">
              <span
                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                  b.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : b.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : b.status === 'confirmed'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {b.status}
              </span>
              <span className="text-sm text-gray-500">
                {formatCurrency(Number(b.total_price))}
              </span>
            </div>
            {b.deposit_amount !== undefined && (
              <div className="text-sm text-gray-500 mt-1">
                Deposit: {formatCurrency(Number(b.deposit_amount || 0))} (
                {b.payment_status})
              </div>
            )}
            {b.deposit_due_by && (
              <div className="text-sm text-gray-500 mt-1">
                Deposit due by {format(new Date(b.deposit_due_by), 'MMM d, yyyy')}
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              {['Requested', 'Confirmed', 'Deposit Paid',
                b.status === 'cancelled' ? 'Cancelled' : 'Completed'].map(
                (step, idx) => {
                  const activeIdx =
                    b.status === 'pending'
                      ? 0
                      : b.status === 'confirmed'
                        ? b.payment_status === 'deposit_paid' || b.payment_status === 'paid'
                          ? 2
                          : 1
                        : 3;
                  return (
                    <span
                      key={step}
                      className={
                        idx <= activeIdx ? 'font-semibold text-indigo-600 flex-1 text-center' : 'flex-1 text-center'
                      }
                    >
                      {step}
                    </span>
                  );
                },
              )}
            </div>
          </Link>
          {b.payment_status === 'pending' && (
            <button
              type="button"
              onClick={() => onPayDeposit(b.id)}
              className="mt-2 text-indigo-600 underline text-sm"
              data-testid="pay-deposit-button"
            >
              Pay deposit
            </button>
          )}
          {b.status === 'completed' && !b.review && (
            <button
              type="button"
              onClick={() => onReview(b.id)}
              className="mt-2 text-indigo-600 hover:underline text-sm"
            >
              Leave review
            </button>
          )}
          {b.review && (
            <p className="mt-2 text-sm text-gray-600">
              You rated {b.review.rating}/5
            </p>
          )}
          {b.source_quote?.booking_request_id && (
            <Link
              href={`/booking-requests/${b.source_quote.booking_request_id}`}
              className="mt-2 text-indigo-600 hover:underline text-sm"
              data-testid="message-artist-link"
            >
              Message Artist
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ClientBookingsPage() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<BookingWithReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentBookingRequestId, setPaymentBookingRequestId] =
    useState<number | null>(null);
  const [paymentDeposit, setPaymentDeposit] = useState<number | undefined>();
  const [paymentBookingId, setPaymentBookingId] = useState<number | null>(null);
  const [showPendingAlert, setShowPendingAlert] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [upRes, pastRes] = await Promise.all([
          getMyClientBookings({ status: 'upcoming' }),
          getMyClientBookings({ status: 'past' }),
        ]);
        setUpcoming(upRes.data);
        setPast(pastRes.data);
      } catch (err) {
        console.error('Failed to load client bookings', err);
        setError('Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    if (user.user_type === 'client') {
      fetchData();
    } else {
      setLoading(false);
      setError('Access denied');
    }
  }, [user]);

  const handleOpenReview = (id: number) => {
    setReviewId(id);
  };

  const handleOpenPayment = async (id: number) => {
    try {
      const res = await getBookingDetails(id);
      setPaymentDeposit(res.data.deposit_amount || undefined);
      setPaymentBookingRequestId(
        res.data.source_quote?.booking_request_id || res.data.id,
      );
      setPaymentBookingId(id);
      setShowPayment(true);
    } catch (err) {
      console.error('Failed to load booking details for payment', err);
      setError('Failed to load payment details');
    }
  };

  const handleReviewSubmitted = (review: Review) => {
    setPast((prev) =>
      prev.map((b) => (b.id === review.booking_id ? { ...b, review } : b)),
    );
  };

  const pendingBookings = [...upcoming, ...past].filter(
    (b) => b.payment_status === 'pending',
  );
  const oldestPending = pendingBookings
    .slice()
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )[0];

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view your bookings.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">Loading...</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {showPendingAlert && pendingBookings.length > 0 && oldestPending && (
          <div
            className="rounded-md bg-yellow-50 p-4"
            data-testid="pending-payment-alert"
            role="alert"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-yellow-700">
                You have {pendingBookings.length} pending deposit
                {pendingBookings.length > 1 ? 's' : ''}.{' '}
                <Link
                  href={`/dashboard/client/bookings/${oldestPending.id}`}
                  className="font-medium underline"
                >
                  Pay oldest
                </Link>
              </p>
              <button
                type="button"
                onClick={() => setShowPendingAlert(false)}
                aria-label="Dismiss"
                className="ml-4 text-yellow-700 hover:text-yellow-900"
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        <section>
          <h1 className="text-xl font-semibold mb-2">Upcoming Bookings</h1>
          {upcoming.length === 0 ? (
            <p>No upcoming bookings.</p>
          ) : (
            <BookingList
              items={upcoming}
              onReview={handleOpenReview}
              onPayDeposit={handleOpenPayment}
            />
          )}
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">Past Bookings</h2>
          {past.length === 0 ? (
            <p>No past bookings.</p>
          ) : (
            <BookingList
              items={past}
              onReview={handleOpenReview}
              onPayDeposit={handleOpenPayment}
            />
          )}
        </section>
        <HelpPrompt />
      </div>
      {reviewId && (
        <ReviewFormModal
          isOpen={reviewId !== null}
          bookingId={reviewId}
          onClose={() => setReviewId(null)}
          onSubmitted={handleReviewSubmitted}
        />
      )}
      {showPayment && paymentBookingRequestId !== null && (
        <PaymentModal
          open={showPayment}
          bookingRequestId={paymentBookingRequestId}
          depositAmount={
            paymentDeposit !== undefined
              ? paymentDeposit
              : [...upcoming, ...past].find((b) => b.id === paymentBookingId)?.deposit_amount
          }
          onClose={() => setShowPayment(false)}
          onSuccess={(result) => {
            setUpcoming((prev) =>
              prev.map((b) =>
                b.id === paymentBookingId
                  ? { ...b, payment_status: result.status }
                  : b,
              ),
            );
            setPast((prev) =>
              prev.map((b) =>
                b.id === paymentBookingId
                  ? { ...b, payment_status: result.status }
                  : b,
              ),
            );
            setShowPayment(false);
          }}
          onError={() => {}}
        />
      )}
    </MainLayout>
  );
}
