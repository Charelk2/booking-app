"use client";
import React, { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { Booking, Service } from "@/types";
import { formatCurrency, formatStatus } from "@/lib/utils";
import Section from "@/components/ui/Section";
import IllustratedEmpty from "@/components/ui/IllustratedEmpty";
import { statusChipStyles } from "@/components/ui/status";

type Props = {
  bookings: Booking[];
  videoOrders?: VideoOrderLite[];
  services?: Service[];
  loading?: boolean;
  videoOrdersLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
  headerAction?: React.ReactNode;
};

import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";

type VideoOrderLite = {
  id: number;
  service_id?: number | null;
  status?: string;
  delivery_by_utc?: string | null;
  delivery_url?: string | null;
};

type WorkItem =
  | { kind: "event"; id: number; serviceId: number; ms: number | null; isFuture: boolean; booking: Booking }
  | { kind: "pv"; id: number; serviceId: number | null; ms: number | null; isFuture: boolean; order: VideoOrderLite };

const BookingsSection: React.FC<Props> = ({
  bookings,
  videoOrders,
  services,
  loading,
  videoOrdersLoading,
  error,
  onRetry,
  title,
  subtitle,
  hideHeader = false,
  headerAction,
}) => {
  const ENABLE_PV_ORDERS = (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";
  const [serviceFilter, setServiceFilter] = React.useState<string>("");
  const [visible, setVisible] = React.useState(8);

  const now = Date.now();
  const selectedServiceId = serviceFilter ? Number(serviceFilter) : null;

  const eligibleBookings = useMemo(() => {
    const out: Booking[] = [];
    for (const b of bookings || []) {
      const sid = Number((b as any)?.service_id ?? 0) || 0;
      if (selectedServiceId && sid !== selectedServiceId) continue;
      const s = String(b.status || "").toLowerCase();
      // Show confirmed/paid work only (exclude draft/pending/cancelled/quote states).
      if (s.includes("cancelled") || s.includes("pending") || s.includes("quote") || s === "draft") continue;
      if (!s.includes("confirmed") && !s.includes("completed") && !s.includes("accepted")) continue;
      out.push(b);
    }
    return out;
  }, [bookings, selectedServiceId]);

  const eligibleOrders = useMemo(() => {
    const out: VideoOrderLite[] = [];
    for (const o of videoOrders || []) {
      const sid = Number((o as any)?.service_id ?? 0) || 0;
      if (selectedServiceId && sid !== selectedServiceId) continue;
      const s = String((o as any)?.status || "").toLowerCase();
      if (!s) continue;
      // Paid work only (exclude drafts/unpaid/cancelled/refunded).
      if (s === "draft" || s === "awaiting_payment" || s === "cancelled" || s === "refunded") continue;
      out.push(o);
    }
    return out;
  }, [videoOrders, selectedServiceId]);

  const items = useMemo(() => {
    const out: WorkItem[] = [];
    for (const b of eligibleBookings) {
      const ms = Number.isFinite(new Date(b.start_time).getTime()) ? new Date(b.start_time).getTime() : null;
      const isFuture = ms != null ? ms >= now : false;
      out.push({
        kind: "event",
        id: b.id,
        serviceId: Number((b as any)?.service_id ?? 0) || 0,
        ms,
        isFuture,
        booking: b,
      });
    }
    for (const o of eligibleOrders) {
      const ms = Number.isFinite(new Date(String(o.delivery_by_utc || "")).getTime())
        ? new Date(String(o.delivery_by_utc || "")).getTime()
        : null;
      const isFuture = ms != null ? ms >= now : false;
      out.push({
        kind: "pv",
        id: Number(o.id),
        serviceId: Number((o as any)?.service_id ?? 0) || null,
        ms,
        isFuture,
        order: o,
      });
    }
    const sorted = out.sort((a, b) => {
      // Unknown dates last
      if (a.ms == null && b.ms == null) return 0;
      if (a.ms == null) return 1;
      if (b.ms == null) return -1;
      // Future work first
      if (a.isFuture !== b.isFuture) return a.isFuture ? -1 : 1;
      // Future: soonest first, Past: most recent first
      return a.isFuture ? a.ms - b.ms : b.ms - a.ms;
    });
    return sorted;
  }, [eligibleBookings, eligibleOrders, now]);

  const visibleItems = useMemo(() => items.slice(0, visible), [items, visible]);
  const hasMore = items.length > visible;

  // use shared status chip styles

  const sectionTitle = hideHeader ? undefined : (title ?? "Bookings");
  const sectionSubtitle = hideHeader ? undefined : (subtitle ?? "Your next confirmed gigs at a glance");

  const isBusy =
    (loading || videoOrdersLoading) && (bookings?.length ?? 0) === 0 && (videoOrders?.length ?? 0) === 0;

  if (isBusy) return <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10"><LoadingSkeleton lines={6} /></Section>;

  if (error) return <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10"><ErrorState message={error} onRetry={onRetry} /></Section>;

  return (
    <Section title={sectionTitle} subtitle={sectionSubtitle} action={headerAction} className="mb-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-gray-700">Service</div>
        <select
          aria-label="Filter bookings by service"
          className="h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)] sm:w-[320px]"
          value={serviceFilter}
          onChange={(e) => {
            setServiceFilter(e.target.value);
            setVisible(8);
          }}
        >
          <option value="">All services</option>
          {(services || []).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-3">
        {visibleItems.length === 0 && (
          <IllustratedEmpty variant="bookings" title="No upcoming bookings" description="When you confirm a booking, it'll show up here with date, status, and payout." />
        )}
        {visibleItems.map((item) => {
          if (item.kind === "event") {
            const booking = item.booking;
            return (
              <div key={`event-${booking.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
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
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Link
                    href={`/dashboard/events/${booking.id}`}
                    className="text-brand-dark hover:underline"
                  >
                    Event prep
                  </Link>
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
                        className="text-brand-dark hover:underline"
                        title="Download Provider Invoice"
                      >
                        Provider invoice
                      </a>
                    );
                  })()}
                </div>
              </div>
            );
          }

          const order = item.order;
          const statusRaw = String(order.status || "").toLowerCase();
          const isDelivered = statusRaw === "delivered" || statusRaw === "completed" || statusRaw === "closed";
          const canDeliver =
            ENABLE_PV_ORDERS && !isDelivered && statusRaw !== "awaiting_payment" && statusRaw !== "cancelled" && statusRaw !== "refunded";
          const serviceTitle =
            (services || []).find((s) => Number(s.id) === Number(order.service_id))?.title ||
            "Personalised Video";
          const dueText = (() => {
            const raw = String(order.delivery_by_utc || "").trim();
            const ms = new Date(raw).getTime();
            if (!raw || !Number.isFinite(ms)) return null;
            return format(new Date(ms), "MMM d, yyyy");
          })();

          return (
            <div key={`pv-${order.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{serviceTitle}</div>
                  <div className="mt-0.5 text-sm text-gray-600 truncate">Order #{order.id}</div>
                  {dueText && (
                    <div className="mt-1 text-xs text-gray-500">Deliver by {dueText}</div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center font-medium" style={statusChipStyles(statusRaw)}>
                    {statusRaw.replace(/_/g, " ") || "—"}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Link
                  href={`/video-orders/${order.id}`}
                  className="text-brand-dark hover:underline"
                >
                  View order
                </Link>
                {ENABLE_PV_ORDERS && isDelivered && (
                  <Link
                    href={`/video-orders/${order.id}/deliver`}
                    className="text-brand-dark hover:underline"
                  >
                    View video
                  </Link>
                )}
                {canDeliver && (
                  <Link
                    href={`/video-orders/${order.id}/deliver`}
                    className="text-brand-dark hover:underline"
                  >
                    Deliver video
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setVisible((c) => c + 8)}
            className="text-brand-primary hover:underline text-sm font-medium"
          >
            Load More
          </button>
        </div>
      )}
    </Section>
  );
};

export default BookingsSection;
