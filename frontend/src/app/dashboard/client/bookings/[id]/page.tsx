"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import PaymentModal from "@/components/booking/PaymentModal";
import toast from "@/components/ui/Toast";
import { getBookingDetails, downloadBookingIcs } from "@/lib/api";
import type { Booking } from "@/types";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrl } from "@/lib/api";


export default function BookingDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pay = searchParams.get("pay");
  const id = Number(params.id);
  const { user } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchBooking = async () => {
      try {
        const res = await getBookingDetails(id);
        setBooking(res.data);
        // Attempt to fetch invoice id for this formal booking
        try {
          const url = apiUrl(`/api/v1/invoices/by-booking/${id}?type=provider`);
          const resp = await fetch(url, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json();
            if (data && typeof data.id === 'number') setInvoiceId(data.id);
          }
        } catch {}
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
        <h1 className="text-xl font-semibold">
          {booking.service.title} - {(booking.service.artist ?? booking.service.service_provider).business_name}
        </h1>
        <p className="text-sm text-gray-700">
          {new Date(booking.start_time).toLocaleString()}
        </p>
        <Link
          href={`/service-providers/${booking.service_provider_id}`}
          className="text-brand-dark underline text-sm"
          data-testid="view-artist-link"
        >
          View Service Provider
        </Link>
        {/* No deposit flow; full upfront payment only */}
        {booking.payment_id && (
          <p>
            <a
              href={`/receipts/${booking.payment_id}`}
              target="_blank"
              rel="noopener"
              className="text-brand-dark underline text-sm"
              data-testid="booking-receipt-link"
            >
              View receipt
            </a>
          </p>
        )}
        {invoiceId && (
          <p>
            <a
              href={`/invoices/${invoiceId}`}
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
          {booking.payment_status === "pending" && (
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
          setBooking({
            ...booking,
            payment_status: "paid",
            payment_id: paymentId ?? booking.payment_id,
          });
          setShowPayment(false);
        }}
        onError={() => {}}
      />
    </MainLayout>
  );
}
