"use client";
import React, { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { Booking } from "@/types";
import { formatCurrency, formatStatus } from "@/lib/utils";
import Section from "@/components/ui/Section";
import SoundOutreachSection from "./SoundOutreachSection";
import IllustratedEmpty from "@/components/ui/IllustratedEmpty";
import { statusChipStyles } from "@/components/ui/status";

type Props = {
  bookings: Booking[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";

const BookingsSection: React.FC<Props> = ({ bookings, loading, error, onRetry }) => {
  const now = Date.now();
  const upcoming = useMemo(() => {
    return bookings
      .filter((b) => new Date(b.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 5);
  }, [bookings, now]);

  // use shared status chip styles

  if (loading) return <Section title="Upcoming Bookings" subtitle="Your next confirmed gigs at a glance" className="mb-10"><LoadingSkeleton lines={6} /></Section>;

  if (error) return <Section title="Upcoming Bookings" subtitle="Your next confirmed gigs at a glance" className="mb-10"><ErrorState message={error} onRetry={onRetry} /></Section>;

  return (
    <Section title="Upcoming Bookings" subtitle="Your next confirmed gigs at a glance" className="mb-10">
      <div className="space-y-3">
        {upcoming.length === 0 && (
          <IllustratedEmpty variant="bookings" title="No upcoming bookings" description="When you confirm a booking, it'll show up here with date, status, and payout." />
        )}
        {upcoming.map((booking) => (
          <div key={booking.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {booking.client?.first_name || "Unknown"} {booking.client?.last_name || ""}
                </div>
                <div className="mt-0.5 text-sm text-gray-600 truncate">{booking.service?.title || "—"}</div>
                <div className="mt-1 text-xs text-gray-500">{format(new Date(booking.start_time), "MMM d, yyyy h:mm a")}</div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="inline-flex items-center font-medium"
                  style={statusChipStyles(booking.status)}
                >
                  {formatStatus(booking.status)}
                </span>
                <div className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(Number(booking.total_price))}</div>
              </div>
            </div>
            {/* Inline outreach block for quick status */}
            <div className="mt-3">
              <SoundOutreachSection bookingId={booking.id} eventCity={(booking as any).event_city || undefined} />
            </div>
            {/* Documents quick links */}
            <div className="mt-3">
              {(() => {
                const anyBooking: any = booking as any;
                const vis = Array.isArray(anyBooking.visible_invoices)
                  ? (anyBooking.visible_invoices as Array<{ type: string; id: number }>)
                  : [];
                const providerInv = vis.find(
                  (iv) => iv.type === "provider_tax" || iv.type === "provider_invoice",
                );
                const fallbackInv = vis.length ? vis[vis.length - 1] : undefined;
                const target = providerInv || fallbackInv;
                const href =
                  target && typeof target.id === "number"
                    ? `/invoices/${target.id}`
                    : booking.invoice_id
                    ? `/invoices/${booking.invoice_id}`
                    : `/invoices/by-booking/${booking.id}?type=provider`;
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener"
                    className="text-brand-dark hover:underline text-sm"
                    title="Download Provider Invoice"
                  >
                    Download Provider Invoice
                  </a>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
      {bookings.length > upcoming.length && (
        <div className="mt-3">
          <Link href="/dashboard/bookings" className="text-brand-dark hover:underline text-sm">View All Bookings</Link>
        </div>
      )}
    </Section>
  );
};

export default BookingsSection;
