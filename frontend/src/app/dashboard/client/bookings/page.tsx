"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getMyClientBookings, getBookingDetails } from "@/lib/api";
import type { Booking, Review } from "@/types";
import ReviewFormModal from "@/components/review/ReviewFormModal";
import usePaymentModal from "@/hooks/usePaymentModal";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import Link from "next/link";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui";
import BookingCard, { BookingCardAction } from "@/components/booking/BookingCard";

interface BookingWithReview extends Booking {
  review?: Review | null;
}

function BookingList({
  items,
  onReview,
  onPayNow,
}: {
  items: BookingWithReview[];
  onReview: (id: number, providerName?: string | null) => void;
  onPayNow: (id: number) => void;
}) {
  const getInvoiceHref = (b: BookingWithReview | Booking) => {
    const anyBooking: any = b as any;
    const vis = Array.isArray(anyBooking.visible_invoices)
      ? (anyBooking.visible_invoices as Array<{ type: string; id: number }>)
      : [];
    const providerInv = vis.find(
      (iv) => iv.type === "provider_tax" || iv.type === "provider_invoice",
    );
    const fallbackInv = vis.length ? vis[vis.length - 1] : undefined;
    const target = providerInv || fallbackInv;
    if (target && typeof target.id === "number") return `/invoices/${target.id}`;
    if (b.invoice_id) return `/invoices/${b.invoice_id}`;
    return `/invoices/by-booking/${b.id}?type=provider`;
  };
  return (
    <div>
      {items.map((b) => {
        const actions: BookingCardAction[] = [];
        if (b.payment_status === "pending") {
          actions.push({
            label: "Pay now",
            onClick: () => onPayNow(b.id),
            primary: true,
            ariaLabel: `Pay now for ${b.service.title} – ${(b.service.artist ?? b.service.service_provider).business_name}`,
            dataTestId: "pay-now-button",
          });
        }
        if (b.booking_request_id) {
          actions.push({
            label: "Message Service Provider",
            href: `/booking-requests/${b.booking_request_id}`,
            ariaLabel: `Message artist about ${b.service.title} – ${(b.service.artist ?? b.service.service_provider).business_name}`,
            dataTestId: "message-artist-link",
          });
        }
        actions.push({
          label: "View Service Provider",
          href: `/service-providers/${(b.service_provider as any)?.slug || b.service_provider_id}`,
          ariaLabel: `View ${(b.service.artist ?? b.service.service_provider).business_name} profile`,
          dataTestId: "view-artist-link",
        });

        return (
          <BookingCard
            key={b.id}
            title={`${b.service.title} - ${(b.service.artist ?? b.service.service_provider).business_name}`}
            date={format(new Date(b.start_time), "MMM d, yyyy h:mm a")}
            status={formatStatus(b.status)}
            price={formatCurrency(Number(b.total_price))}
            actions={actions}
          >
            <Link
              href={`/dashboard/client/bookings/${b.id}`}
              data-booking-id={b.id}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
            >
              <div className="font-medium text-gray-900">
                {b.service.title} - {(b.service.artist ?? b.service.service_provider).business_name}
              </div>
              <div className="text-sm text-gray-500">
                {format(new Date(b.start_time), "MMM d, yyyy h:mm a")}
              </div>
            </Link>
            {/* No deposit flow; full upfront payment only */}
            {b.payment_id && (
              <a
                href={`/receipts/${b.payment_id}`}
                target="_blank"
                rel="noopener"
                className="mt-2 text-brand-dark hover:underline text-sm"
                data-testid="booking-receipt-link"
              >
                View receipt
              </a>
            )}
            {(() => {
              const href = getInvoiceHref(b);
              if (!href) return null;
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener"
                  className="ml-3 mt-2 text-brand-dark hover:underline text-sm"
                  data-testid="booking-invoice-link"
                >
                  View invoice
                </a>
              );
            })()}
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              {["Requested", "Confirmed", b.status === "cancelled" ? "Cancelled" : "Completed"].map((step, idx) => {
                const activeIdx =
                  b.status === "pending"
                    ? 0
                    : b.status === "confirmed" ? 1 : 2;
                return (
                  <span
                    key={step}
                    className={
                      idx <= activeIdx
                        ? "font-semibold text-brand-dark flex-1 text-center"
                        : "flex-1 text-center"
                    }
                  >
                    {step}
                  </span>
                );
              })}
            </div>
            {b.status === "completed" && !b.review && (
              <button
                type="button"
                onClick={() =>
                  onReview(
                    b.id,
                    (b.service.artist ?? b.service.service_provider)
                      .business_name,
                  )
                }
                className="mt-2 text-brand-dark hover:underline text-sm"
              >
                Leave review
              </button>
            )}
            {b.review && (
              <p className="mt-2 text-sm text-gray-600">
                You rated {b.review.rating}/5
              </p>
            )}
          </BookingCard>
        );
      })}
    </div>
  );
}

export default function ClientBookingsPage() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<BookingWithReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentBookingId, setPaymentBookingId] = useState<number | null>(null);
  const { openPaymentModal, paymentModal } = usePaymentModal(
    (result) => {
      setUpcoming((prev) =>
        prev.map((b) =>
          b.id === paymentBookingId ? { ...b, payment_status: result.status } : b,
        ),
      );
      setPast((prev) =>
        prev.map((b) =>
          b.id === paymentBookingId ? { ...b, payment_status: result.status } : b,
        ),
      );
    },
    () => {},
  );
  const [showPendingAlert, setShowPendingAlert] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [upRes, pastRes] = await Promise.all([
          getMyClientBookings({ status: "upcoming" }),
          getMyClientBookings({ status: "past" }),
        ]);
        setUpcoming(upRes.data);
        setPast(pastRes.data);
      } catch (err) {
        console.error("Failed to load client bookings", err);
        setError("Failed to load bookings");
      } finally {
        setLoading(false);
      }
    };

    if (user.user_type === "client") {
      fetchData();
    } else {
      setLoading(false);
      setError("Access denied");
    }
  }, [user]);


  const [reviewProviderName, setReviewProviderName] = useState<string | null>(null);

  const handleOpenReview = (bookingId: number, providerName?: string | null) => {
    setReviewId(bookingId);
    setReviewProviderName(providerName ?? null);
  };

  const handleOpenPayment = async (id: number) => {
    try {
      const res = await getBookingDetails(id);
      setPaymentBookingId(id);
      openPaymentModal({
        bookingRequestId: res.data.booking_request_id ?? 0,
        amount: Number(res.data.total_price || 0),
        customerEmail: (user as any)?.email || undefined,
      } as any);
    } catch (err) {
      console.error("Failed to load booking details for payment", err);
      setError("Failed to load payment details");
    }
  };

  const handleReviewSubmitted = (review: Review) => {
    setPast((prev) =>
      prev.map((b) => (b.id === review.booking_id ? { ...b, review } : b)),
    );
  };

  const pendingBookings = [...upcoming, ...past].filter(
    (b) => b.payment_status === "pending",
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
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
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
                You have {pendingBookings.length} pending payment
                {pendingBookings.length > 1 ? "s" : ""}.{" "}
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
              onPayNow={handleOpenPayment}
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
              onPayNow={handleOpenPayment}
            />
          )}
        </section>
      </div>
      {reviewId && (
        <ReviewFormModal
          isOpen={reviewId !== null}
          bookingId={reviewId}
          providerName={reviewProviderName}
          onClose={() => setReviewId(null)}
          onSubmitted={handleReviewSubmitted}
        />
      )}
      {paymentModal}
    </MainLayout>
  );
}
