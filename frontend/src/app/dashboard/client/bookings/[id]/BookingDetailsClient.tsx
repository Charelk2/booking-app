'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import PaymentModal from "@/components/booking/PaymentModal";
import toast from "@/components/ui/Toast";
import { downloadBookingIcs } from "@/lib/api";
import type { Booking, BookingFull, BookingPaymentSummary, InvoiceByBooking } from "@/types";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { statusChipStyles } from "@/components/ui/status";

const SidebarLink = ({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) => (
  <Link
    href={href}
    className={`block w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
      active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`}
  >
    {label}
  </Link>
);

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
  const providerName =
    (booking.service?.artist ?? (booking as any).service_provider)?.business_name || "Service Provider";

  const orderedAtLabel = useMemo(() => {
    const raw = (booking as any)?.created_at;
    if (!raw) return "—";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "—";
    return format(dt, "d MMM yyyy");
  }, [booking]);

  const paidAtLabel = useMemo(() => {
    const raw = (booking as any)?.paid_at_utc;
    if (!raw) return paymentStatus === "paid" ? "Paid" : "—";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "Paid";
    return format(dt, "d MMM yyyy");
  }, [booking, paymentStatus]);

  const startLabel = useMemo(() => {
    const dt = new Date(booking.start_time);
    if (Number.isNaN(dt.getTime())) return "—";
    return format(dt, "d MMM yyyy, h:mm a");
  }, [booking.start_time]);

  const endLabel = useMemo(() => {
    const dt = new Date(booking.end_time);
    if (Number.isNaN(dt.getTime())) return "—";
    return format(dt, "d MMM yyyy, h:mm a");
  }, [booking.end_time]);

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <aside className="hidden w-64 shrink-0 md:block md:sticky md:top-[var(--sp-sticky-top)] md:self-start">
            <div className="space-y-6">
              <div className="px-1">
                <p className="text-xs font-semibold text-gray-500">My Account</p>
              </div>
              <nav className="space-y-1">
                <SidebarLink href="/dashboard/client?tab=orders" label="Orders" active />
                <SidebarLink href="/dashboard/client?tab=requests" label="Requests" />
                <SidebarLink href="/dashboard/client?tab=invoices" label="Invoices" />
                <SidebarLink href="/dashboard/client?tab=disputes" label="Disputes" />
                <SidebarLink href="/dashboard/client?tab=reviews" label="Reviews" />
                <SidebarLink href="/dashboard/client?tab=my_list" label="My List" />
              </nav>
            </div>
          </aside>

          <main className="min-w-0 flex-1 space-y-4">
            <nav className="text-sm text-gray-500">
              <Link href="/dashboard/client?tab=orders" className="hover:underline">
                My Account
              </Link>{" "}
              /{" "}
              <Link href="/dashboard/client?tab=orders" className="hover:underline">
                Orders
              </Link>{" "}
              / <span className="text-gray-700">Order Detail</span>
            </nav>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900">Order Detail</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">Order #{booking.id}</span> • Ordered{" "}
                    {orderedAtLabel} • Paid {paidAtLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link
                    href="/dashboard/client?tab=orders"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    View all orders
                  </Link>
                  {invoiceHref ? (
                    <a
                      href={invoiceHref}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                      data-testid="booking-invoice-link"
                    >
                      View invoices
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">Booking</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {booking.service.title} - {providerName}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {startLabel} → {endLabel}
                  </p>
                  <p className="mt-3 text-xs text-gray-500">
                    Status:{" "}
                    <span
                      className="inline-flex items-center font-medium"
                      style={statusChipStyles(booking.status)}
                    >
                      {formatStatus(booking.status)}
                    </span>
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">Service Provider</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link
                      href={`/${providerSlug}`}
                      className="text-sm font-semibold text-gray-900 hover:underline"
                      data-testid="view-artist-link"
                    >
                      View profile
                    </Link>
                    {booking.booking_request_id ? (
                      <Link
                        href={`/booking-requests/${booking.booking_request_id}`}
                        className="text-sm font-semibold text-gray-900 hover:underline"
                        data-testid="message-artist-link"
                      >
                        Message Service Provider
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">Order Summary</p>
                  <div className="mt-3 flex items-center justify-between text-sm text-gray-700">
                    <span>Total</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(Number(booking.total_price || 0))}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Payment status:{" "}
                    <span className="font-semibold text-gray-900">
                      {String(paymentStatus || "—")}
                    </span>
                  </div>
                  {/* No deposit flow; full upfront payment only */}
                  {receiptHref ? (
                    <a
                      href={receiptHref}
                      target="_blank"
                      rel="noopener"
                      className="mt-3 inline-flex text-sm font-semibold text-gray-900 hover:underline"
                      data-testid="booking-receipt-link"
                    >
                      View receipt
                    </a>
                  ) : null}
                  {paymentStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() => setShowPayment(true)}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                      data-testid="pay-now-button"
                    >
                      Pay now
                    </button>
                  ) : null}
                </div>
              </div>

              {booking.notes ? (
                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">Notes</p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    {booking.notes}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {booking.status === "confirmed" ? (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    data-testid="add-calendar-button"
                  >
                    Add to calendar
                  </button>
                ) : null}
                <Link
                  href="/dashboard/client?tab=orders"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Back to orders
                </Link>
              </div>
            </div>
          </main>
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
