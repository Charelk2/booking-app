"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import PaymentModal from "@/components/booking/PaymentModal";
import toast from "@/components/ui/Toast";
import { getBookingDetails, downloadBookingIcs } from "@/lib/api";
import type { Booking } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Spinner } from "@/components/ui";

export default function BookingDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pay = searchParams.get("pay");
  const id = Number(params.id);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchBooking = async () => {
      try {
        const res = await getBookingDetails(id);
        setBooking(res.data);
        if (pay === "1" && res.data.payment_status === "pending") {
          setShowPayment(true);
        }
      } catch (err) {
        console.error("Failed to load booking", err);
        setError("Failed to load booking");
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [id, pay]);

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
        err instanceof Error ? err.message : "Failed to download calendar",
      );
    }
  }, [booking]);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error || !booking) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error || "Booking not found"}</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-xl mx-auto p-4 space-y-3">
        <h1 className="text-xl font-semibold">{booking.service.title}</h1>
        <p className="text-sm text-gray-700">
          {new Date(booking.start_time).toLocaleString()}
        </p>
        <Link
          href={`/artists/${booking.artist_id}`}
          className="text-brand-dark underline text-sm"
          data-testid="view-artist-link"
        >
          View Artist
        </Link>
        {booking.deposit_amount !== undefined && (
          <p className="text-sm text-gray-700">
            Deposit: {formatCurrency(Number(booking.deposit_amount || 0))} (
            {booking.payment_status})
          </p>
        )}
        {booking.payment_status === "pending" && booking.deposit_due_by && (
          <p className="text-sm text-gray-700">
            Deposit due by{" "}
            {new Date(booking.deposit_due_by).toLocaleDateString()}
          </p>
        )}
        {booking.payment_id && (
          <p>
            <a
              href={`/api/v1/payments/${booking.payment_id}/receipt`}
              target="_blank"
              rel="noopener"
              className="text-brand-dark underline text-sm"
              data-testid="booking-receipt-link"
            >
              View receipt
            </a>
          </p>
        )}
        <div className="mt-2 space-x-4">
          {booking.payment_status === "pending" && (
            <button
              type="button"
              onClick={() => setShowPayment(true)}
              className="text-brand-dark underline text-sm"
              data-testid="pay-deposit-button"
            >
              Pay deposit
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
          {booking.source_quote?.booking_request_id && (
            <Link
              href={`/booking-requests/${booking.source_quote.booking_request_id}`}
              className="text-brand-dark underline text-sm"
              data-testid="message-artist-link"
            >
              Message Artist
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
        bookingRequestId={
          booking.source_quote?.booking_request_id || booking.id
        }
        depositAmount={booking.deposit_amount}
        depositDueBy={booking.deposit_due_by ?? undefined}
        onSuccess={({ paymentId }) => {
          setBooking({
            ...booking,
            payment_status: "deposit_paid",
            payment_id: paymentId ?? booking.payment_id,
          });
          setShowPayment(false);
        }}
        onError={() => {}}
      />
    </MainLayout>
  );
}
