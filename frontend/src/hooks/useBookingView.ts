'use client';

import { useMemo } from 'react';

type UserLike = { user_type?: 'service_provider' | 'client' } | null | undefined;
type PaymentInfoLike = { status: string | null } | null | undefined;
type BookingLike = { payment_id?: string | null } | null | undefined;

export default function useBookingView(
  user: UserLike,
  bookingDetails: BookingLike,
  paymentInfo: PaymentInfoLike,
  bookingConfirmed: boolean,
) {
  const isClientView = user?.user_type === 'client';
  const isProviderView = user?.user_type === 'service_provider';
  const isPaid = useMemo(
    () => Boolean(bookingDetails?.payment_id) || paymentInfo?.status === 'paid' || bookingConfirmed,
    [bookingDetails?.payment_id, paymentInfo?.status, bookingConfirmed],
  );
  return { isClientView, isProviderView, isPaid };
}

