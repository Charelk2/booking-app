'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import PaymentModal from "@/components/booking/PaymentModal";
import toast from "@/components/ui/Toast";
import { downloadBookingIcs } from "@/lib/api";
import type { Booking, BookingFull, BookingPaymentSummary, InvoiceByBooking } from "@/types";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

type BookingDetailsClientProps = {
  initial: BookingFull;
  payIntent?: boolean;
};

function resolveProviderSlug(booking: Booking): string {
  const providerSlug =
    ((booking as any).service_provider as any)?.slug ||
    (booking as any).service_provider_id ||
    (booking.service?.artist as any)?.slug ||
    booking.artist_id;
  return providerSlug ? String(providerSlug) : "#";
}

function pickInvoiceId(
  invoice: InvoiceByBooking | null | undefined,
  booking: Booking
): number | null {
  if (invoice?.id) return invoice.id;
  if (typeof booking.invoice_id === "number") return booking.invoice_id;
  const visible = booking.visible_invoices || [];
  const provider = visible.find((iv) =>
    (iv.type || "").toLowerCase().includes("provider")
  );
  return provider?.id ?? null;
}

export default function BookingDetailsClient({ initial, payIntent }: BookingDetailsClientProps) {
  const { user } = useAuth();
  const [booking, setBooking] = useState<Booking>(initial.booking);
  const invoice: InvoiceByBooking | null = initial.invoice ?? null;
  const [payment, setPayment] = useState<BookingPaymentSummary | null>(
    initial.payment ?? null
  );
  const [showPayment, setShowPayment] = useState(false);

  const paymentStatus = payment?.payment_status || booking.payment_status;
  const paymentId = payment?.payment_id || booking.payment_id || undefined;
  const invoiceId = pickInvoiceId(invoice, booking);

  useEffect(() => {
    if (payIntent && paymentStatus === "pending") {
      setShowPayment(true);
    }
  }, [payIntent, paymentStatus]);

  const handleDownload = useCallback(async () => {
    if (!booking) return;
    try {
      const res = await downloadBookingIcs(booking.id);
      const blob = new Blob([res.data], { type: "text/calendar" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `booking-${booking.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Calendar download error", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to download calendar"
      );
    }
  }, [booking]);

  if (!booking) {
    return (
      <MainLayout>
        <div className="p-8">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  const providerSlug = resolveProviderSlug(booking);
  const receiptHref = paymentId ? `/receipts/${paymentId}` : null;
  const invoiceHref = invoiceId ? `/invoices/${invoiceId}` : null;

  return (
    <MainLayout>
      <div className="max-w-xl mx-auto p-4 space-y-3">
        <h1 className="text-xl font-semibold">
          {booking.service.title} -{" "}
          {(booking.service.artist ?? (booking as any).service_provider)
            ?.business_name}
        </h1>
        <p className="text-sm text-gray-700">
          {new Date(booking.start_time).toLocaleString()}
        </p>
        <Link
          href={`/${providerSlug}`}
          className="text-brand-dark underline text-sm"
          data-testid="view-artist-link"
        >
          View Service Provider
        </Link>
        {/* No deposit flow; full upfront payment only */}
        {receiptHref && (
          <p>
            <a
              href={receiptHref}
              target="_blank"
              rel="noopener"
              className="text-brand-dark underline text-sm"
              data-testid="booking-receipt-link"
            >
              View receipt
            </a>
          </p>
        )}
        {invoiceHref && (
          <p>
            <a
              href={invoiceHref}
              target="_blank"
              rel="noopener"
              className="text-brand-dark underline text-sm"
              data-testid="booking-invoice-link"
            >
              View invoice
            </a>
          </p>
        )}
        {booking.notes && (
          <p className="border p-2 bg-white rounded-md whitespace-pre-wrap">
            {booking.notes}
          </p>
        )}
        <div className="mt-2 space-x-4">
          {paymentStatus === "pending" && (
            <button
              type="button"
              onClick={() => setShowPayment(true)}
              className="text-brand-dark underline text-sm"
              data-testid="pay-now-button"
            >
              Pay now
            </button>
          )}
          {booking.status === "confirmed" && (
            <button
              type="button"
              onClick={handleDownload}
              className="text-brand-dark underline text-sm"
              data-testid="add-calendar-button"
            >
              Add to calendar
            </button>
          )}
          {booking.booking_request_id && (
            <Link
              href={`/booking-requests/${booking.booking_request_id}`}
              className="text-brand-dark underline text-sm"
              data-testid="message-artist-link"
            >
              Message Service Provider
            </Link>
          )}
          <Link
            href="/dashboard/client/bookings"
            className="text-brand-dark underline text-sm"
          >
            Back to bookings
          </Link>
        </div>
      </div>
      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        bookingRequestId={booking.booking_request_id as number}
        amount={Number(booking.total_price || 0)}
        customerEmail={(user as any)?.email || undefined}
        onSuccess={({ paymentId }) => {
          const nextPaymentId = paymentId || payment?.payment_id || booking.payment_id || undefined;
          setBooking({
            ...booking,
            payment_status: "paid",
            payment_id: nextPaymentId,
          });
          setPayment((prev) => ({
            ...(prev || {}),
            payment_status: "paid",
            payment_id: nextPaymentId ?? null,
          }));
          setShowPayment(false);
        }}
        onError={() => {}}
      />
    </MainLayout>
  );
}
