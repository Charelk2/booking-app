"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardList, FileText, Heart, Package, Star } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { Booking, BookingRequest, Review, Service } from "@/types";
import {
  getService,
  getMyClientBookingsCached,
  getMyBookingRequestsCached,
  peekClientDashboardCache,
} from "@/lib/api";
import {
  SectionList,
  BookingRequestCard,
} from "@/components/dashboard";
import { Spinner } from "@/components/ui";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { statusChipStyles } from "@/components/ui/status";
import Link from "next/link";
import { videoOrderApiClient, type VideoOrder } from "@/features/booking/personalizedVideo/engine/apiClient";
import ReviewFormModal from "@/components/review/ReviewFormModal";

type SectionId = "orders" | "requests" | "invoices" | "disputes" | "reviews" | "my_list";

const SidebarItem = ({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: any;
  label: string;
  count?: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
      active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon
        size={20}
        className={active ? "text-gray-900" : "text-gray-400 group-hover:text-gray-900"}
      />
      <span>{label}</span>
    </div>
    {count !== undefined && count > 0 && (
      <span
        className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
          active ? "bg-white text-gray-900 ring-1 ring-gray-200" : "bg-gray-100 text-gray-600"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTabParam = searchParams.get("tab");
  const initialSection: SectionId = useMemo(() => {
    const v = String(initialTabParam || "").toLowerCase();
    if (v === "orders" || v === "bookings") return "orders";
    if (v === "requests") return "requests";
    if (v === "invoices") return "invoices";
    if (v === "disputes") return "disputes";
    if (v === "reviews") return "reviews";
    if (v === "my_list" || v === "my-list" || v === "list") return "my_list";
    return "orders";
  }, [initialTabParam]);

  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);

  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [fetchedBookings, setFetchedBookings] = useState(false);
  const [fetchedRequests, setFetchedRequests] = useState(false);
  const [videoOrders, setVideoOrders] = useState<VideoOrder[]>([]);
  const [loadingVideoOrders, setLoadingVideoOrders] = useState(false);
  const [fetchedVideoOrders, setFetchedVideoOrders] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const todayFormatted = useMemo(() => format(new Date(), "EEEE, d MMM yyyy"), []);

  const bookingsInflightRef = useRef<Promise<Booking[] | null> | null>(null);
  const requestsInflightRef = useRef<Promise<BookingRequest[] | null> | null>(
    null,
  );

  // Keep tab in the URL, but don't rely on window directly
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", activeSection);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeSection, router, pathname, searchParams]);

  // Auth + initial cache hydration
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push(
        `/auth?intent=login&next=${encodeURIComponent(pathname || "/")}`,
      );
      return;
    }

    if (user.user_type !== "client") {
      router.push("/dashboard/artist");
      return;
    }

    // Hydrate from cache to avoid blank screen when we already have data
    try {
      const cached = peekClientDashboardCache();
      if (cached.bookings && !fetchedBookings) {
        setBookings(cached.bookings);
        setFetchedBookings(true);
      }
      if (cached.requests && !fetchedRequests) {
        setBookingRequests(cached.requests);
        setFetchedRequests(true);
      }
    } catch {
      // cache is best-effort
    }
  }, [authLoading, user, router, pathname, fetchedBookings, fetchedRequests]);

  // Fetch dashboard data (best-effort, cached). We load everything so each
  // section (orders/requests/invoices/...) can render instantly when selected.
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== "client") return;

    const fetchVideoOrders = async () => {
      if (fetchedVideoOrders || loadingVideoOrders) return;
      setLoadingVideoOrders(true);
      try {
        const orders = await videoOrderApiClient.listOrders();
        setVideoOrders(Array.isArray(orders) ? orders : []);
      } catch {
        setVideoOrders([]);
      } finally {
        setFetchedVideoOrders(true);
        setLoadingVideoOrders(false);
      }
    };

    const fetchBookings = async () => {
      if (fetchedBookings || bookingsInflightRef.current) return;
      setLoadingBookings(true);
      setError(null);
      try {
        bookingsInflightRef.current = getMyClientBookingsCached(60_000, 100).catch(() => null);
        const data = await bookingsInflightRef.current;
        if (data) setBookings(data);
      } catch (err) {
        console.error("Client dashboard bookings fetch error:", err);
        setError("Failed to load bookings. Please try again.");
      } finally {
        bookingsInflightRef.current = null;
        setFetchedBookings(true);
        setLoadingBookings(false);
      }
    };

    const fetchRequests = async () => {
      if (fetchedRequests || requestsInflightRef.current) return;
      setLoadingRequests(true);
      setError(null);
      try {
        requestsInflightRef.current = getMyBookingRequestsCached(60_000, 100).catch(() => null);
        const data = await requestsInflightRef.current;
        if (data) setBookingRequests(data);
      } catch (err) {
        console.error("Client dashboard requests fetch error:", err);
        setError("Failed to load requests. Please try again.");
      } finally {
        requestsInflightRef.current = null;
        setFetchedRequests(true);
        setLoadingRequests(false);
      }
    };

    void fetchVideoOrders();
    void fetchBookings();
    void fetchRequests();
  }, [
    authLoading,
    user,
    fetchedBookings,
    fetchedRequests,
    fetchedVideoOrders,
    loadingVideoOrders,
  ]);

  const toEpochMsOrNull = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const dt = new Date(value);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const formatDateSafe = (value: string | null | undefined, fmt: string): string => {
    const ms = toEpochMsOrNull(value);
    if (!ms) return "—";
    try {
      return format(new Date(ms), fmt);
    } catch {
      return "—";
    }
  };

  const resolveProviderName = (booking: Booking): string =>
    booking.service?.service_provider?.business_name ||
    (booking.service as any)?.artist?.business_name ||
    (booking.service_provider as any)?.business_name ||
    (booking as any)?.artist?.business_name ||
    "Unknown Service Provider";

  const pendingRequestsCount = useMemo(
    () =>
      bookingRequests.filter(
        (r) =>
          !["cancelled", "declined", "completed"].includes(
            String((r as any)?.status || "").toLowerCase(),
          ),
      ).length,
    [bookingRequests],
  );

  type OrderItem = {
    kind: "booking" | "video";
    id: number;
    title: string;
    subtitle: string;
    statusLabel: string;
    statusStyle?: React.CSSProperties;
    amount: number | null;
    orderedAt: string | null;
    paidAt: string | null;
    detailsHref: string;
    primaryActionHref: string;
    primaryActionLabel: string;
    primaryActionVariant: "primary" | "secondary";
    secondaryActionHref?: string | null;
    secondaryActionLabel?: string | null;
    invoiceHref?: string | null;
  };

  const orderItems: OrderItem[] = useMemo(() => {
    const resolveVideoOrderProviderName = (order: VideoOrder): string | null => {
      const anyOrder = order as any;
      const direct =
        anyOrder?.provider_name ||
        anyOrder?.providerName ||
        anyOrder?.artist_name ||
        anyOrder?.artistName ||
        null;
      if (typeof direct === "string" && direct.trim()) return direct.trim();

      const artist = anyOrder?.artist || anyOrder?.service_provider || anyOrder?.provider || null;
      const businessName = artist?.artist_profile?.business_name || artist?.business_name || null;
      if (typeof businessName === "string" && businessName.trim()) return businessName.trim();

      const fullName =
        typeof artist?.first_name === "string" || typeof artist?.last_name === "string"
          ? `${artist?.first_name || ""} ${artist?.last_name || ""}`.trim()
          : null;
      if (fullName) return fullName;

      return null;
    };

    const bookingOrders: OrderItem[] = bookings.map((b) => {
      const providerName = resolveProviderName(b);
      const serviceTitle = b.service?.title || "—";
      const orderedAt = b.created_at || null;
      const paidAt = b.paid_at_utc || null;
      const statusLabel = formatStatus(b.status);
      const paymentStatus = String(b.payment_status || "").toLowerCase();
      const invoiceHref = getInvoiceHref(b);
      const detailsHref = `/dashboard/client/bookings/${b.id}`;
      const payHref = `${detailsHref}?pay=1`;
      const hasPendingPayment = paymentStatus === "pending";
      return {
        kind: "booking",
        id: b.id,
        title: providerName,
        subtitle: `${serviceTitle} • ${formatDateSafe(b.start_time, "MMM d, yyyy h:mm a")}`,
        statusLabel,
        statusStyle: statusChipStyles(b.status),
        amount: Number.isFinite(Number(b.total_price)) ? Number(b.total_price) : null,
        orderedAt,
        paidAt,
        detailsHref,
        primaryActionHref: hasPendingPayment ? payHref : detailsHref,
        primaryActionLabel: hasPendingPayment ? "Pay now" : "Order details",
        primaryActionVariant: hasPendingPayment ? "primary" : "secondary",
        secondaryActionHref: hasPendingPayment ? detailsHref : null,
        secondaryActionLabel: hasPendingPayment ? "Order details" : null,
        invoiceHref,
      };
    });

    const videoOrdersItems: OrderItem[] = videoOrders.map((o) => {
      const status = String(o.status || "").toLowerCase();
      const statusLabel = status ? status.replace(/_/g, " ") : "—";
      const orderedAt = o.created_at_utc || null;
      const paidAt = o.paid_at_utc || null;
      const providerName = resolveVideoOrderProviderName(o);
      const delivered =
        status === "delivered" || status === "completed" || status === "closed";
      const deliveryDate =
        delivered && (o as any)?.delivered_at_utc ? (o as any).delivered_at_utc : o.delivery_by_utc;
      const deliveryLabel = delivered ? "Delivered" : "Delivery by";
      const subtitleBase = `${deliveryLabel} ${formatDateSafe(deliveryDate, "MMM d, yyyy")}`;
      const subtitle = providerName ? `${providerName} • ${subtitleBase}` : subtitleBase;
      const detailsHref = `/video-orders/${o.id}`;
      const needsPayment = status === "awaiting_payment";
      const needsBrief = status === "paid" || status === "info_pending";

      let primaryActionHref = detailsHref;
      let primaryActionLabel = "Order details";
      let primaryActionVariant: OrderItem["primaryActionVariant"] = "secondary";
      let secondaryActionHref: string | null = null;
      let secondaryActionLabel: string | null = null;
      if (needsPayment) {
        primaryActionHref = `/video-orders/${o.id}/pay`;
        primaryActionLabel = "Complete payment";
        primaryActionVariant = "primary";
        secondaryActionHref = detailsHref;
        secondaryActionLabel = "Order details";
      } else if (needsBrief) {
        primaryActionHref = `/video-orders/${o.id}/brief`;
        primaryActionLabel = "Finish brief";
        primaryActionVariant = "primary";
        secondaryActionHref = detailsHref;
        secondaryActionLabel = "Order details";
      } else if (delivered) {
        primaryActionLabel = "View delivery";
      }
      return {
        kind: "video",
        id: o.id,
        title: "Personalised Video",
        subtitle,
        statusLabel,
        amount: Number.isFinite(Number(o.total)) ? Number(o.total) : null,
        orderedAt,
        paidAt,
        detailsHref,
        primaryActionHref,
        primaryActionLabel,
        primaryActionVariant,
        secondaryActionHref,
        secondaryActionLabel,
      };
    });

    const all = [...bookingOrders, ...videoOrdersItems];
    all.sort((a, b) => {
      const aPaid = toEpochMsOrNull(a.paidAt);
      const bPaid = toEpochMsOrNull(b.paidAt);
      if (aPaid !== null || bPaid !== null) {
        return (bPaid ?? -Infinity) - (aPaid ?? -Infinity);
      }
      const aOrd = toEpochMsOrNull(a.orderedAt);
      const bOrd = toEpochMsOrNull(b.orderedAt);
      if (aOrd !== null || bOrd !== null) {
        return (bOrd ?? -Infinity) - (aOrd ?? -Infinity);
      }
      return (b.id || 0) - (a.id || 0);
    });
    return all;
  }, [bookings, videoOrders]);

  type InvoiceItem = {
    id: number;
    bookingId: number;
    type: string;
    createdAt: string | null;
    title: string;
    href: string;
  };

  const invoiceItems: InvoiceItem[] = useMemo(() => {
    const items: InvoiceItem[] = [];
    for (const b of bookings) {
      const providerName = resolveProviderName(b);
      const serviceTitle = b.service?.title || "—";
      const visible = Array.isArray((b as any)?.visible_invoices)
        ? ((b as any).visible_invoices as Array<{ id: number; type?: string; created_at?: string }>)
        : [];
      for (const iv of visible) {
        if (!iv || typeof iv.id !== "number") continue;
        items.push({
          id: iv.id,
          bookingId: b.id,
          type: String(iv.type || "invoice"),
          createdAt: (iv as any)?.created_at || null,
          title: `${providerName} • ${serviceTitle}`,
          href: `/invoices/${iv.id}`,
        });
      }
      if (!visible.length && typeof b.invoice_id === "number") {
        const id = Number(b.invoice_id);
        items.push({
          id,
          bookingId: b.id,
          type: "invoice",
          createdAt: b.updated_at || b.created_at || null,
          title: `${providerName} • ${serviceTitle}`,
          href: `/invoices/${id}`,
        });
      }
    }
    items.sort((a, b) => {
      const aMs = toEpochMsOrNull(a.createdAt);
      const bMs = toEpochMsOrNull(b.createdAt);
      if (aMs !== null || bMs !== null) return (bMs ?? -Infinity) - (aMs ?? -Infinity);
      return (b.id || 0) - (a.id || 0);
    });
    return items;
  }, [bookings]);

  const disputeOrders = useMemo(() => {
    return videoOrders.filter((o) => String(o.status || "").toLowerCase() === "in_dispute");
  }, [videoOrders]);

  const completedBookings = useMemo(() => {
    return bookings.filter((b) => String(b.status || "").toLowerCase() === "completed");
  }, [bookings]);

  function getInvoiceHref(booking: Booking): string | null {
    const anyBooking: any = booking as any;
    const vis = Array.isArray(anyBooking.visible_invoices)
      ? (anyBooking.visible_invoices as Array<{ type: string; id: number }>)
      : [];
    const providerInv = vis.find(
      (iv) => iv.type === "provider_tax" || iv.type === "provider_invoice",
    );
    const fallbackInv = vis.length ? vis[vis.length - 1] : undefined;
    const target = providerInv || fallbackInv;
    if (target && typeof target.id === "number") return `/invoices/${target.id}`;
    if (booking.invoice_id) return `/invoices/${booking.invoice_id}`;
    return `/invoices/by-booking/${booking.id}?type=provider`;
  }

  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewProviderName, setReviewProviderName] = useState<string | null>(null);
  const [submittedReviews, setSubmittedReviews] = useState<Record<number, Review>>({});

  const getServiceSavedStorageKey = (serviceId: number) => `saved:service:${serviceId}`;
  const readSavedServiceIds = (): number[] => {
    if (typeof window === "undefined") return [];
    try {
      const out: number[] = [];
      const prefix = "saved:service:";
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const v = window.localStorage.getItem(key);
        if (v !== "1") continue;
        const idStr = key.slice(prefix.length);
        const id = Number(idStr);
        if (!Number.isFinite(id) || id <= 0) continue;
        out.push(id);
      }
      return Array.from(new Set(out)).sort((a, b) => b - a);
    } catch {
      return [];
    }
  };

  const [savedServiceIds, setSavedServiceIds] = useState<number[]>([]);
  const [savedServices, setSavedServices] = useState<Service[]>([]);
  const [savedServicesLoading, setSavedServicesLoading] = useState(false);
  const [savedServicesLoaded, setSavedServicesLoaded] = useState(false);
  const [savedServicesError, setSavedServicesError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setSavedServiceIds(readSavedServiceIds());
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== "client") return;
    if (activeSection !== "my_list") return;
    if (savedServicesLoaded || savedServicesLoading) return;

    const ids = readSavedServiceIds();
    setSavedServiceIds(ids);
    setSavedServicesError(null);

    if (ids.length === 0) {
      setSavedServices([]);
      setSavedServicesLoaded(true);
      return;
    }

    let cancelled = false;
    setSavedServicesLoading(true);
    void (async () => {
      try {
        const max = 50;
        const subset = ids.slice(0, max);
        const results = await Promise.allSettled(subset.map((id) => getService(id)));
        const services: Service[] = [];
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const svc = r.value?.data;
          if (svc && typeof (svc as any)?.id === "number") services.push(svc);
        }
        if (cancelled) return;
        setSavedServices(services);
      } catch (e) {
        if (cancelled) return;
        setSavedServicesError("Failed to load saved items.");
        setSavedServices([]);
      } finally {
        if (cancelled) return;
        setSavedServicesLoaded(true);
        setSavedServicesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSection, authLoading, user, savedServicesLoaded, savedServicesLoading]);

  const ordersCount = orderItems.length;
  const invoicesCount = invoiceItems.length;
  const disputesCount = disputeOrders.length;
  const reviewsCount = completedBookings.length;
  const savedCount = savedServiceIds.length;

  const sectionTitle = (() => {
    switch (activeSection) {
      case "orders":
        return "Orders";
      case "requests":
        return "Requests";
      case "invoices":
        return "Invoices";
      case "disputes":
        return "Disputes";
      case "reviews":
        return "Reviews";
      case "my_list":
        return "My List";
      default:
        return "Dashboard";
    }
  })();

  // While auth is resolving, show a simple spinner
  if (authLoading) {
    return (
      <MainLayout>
        <div className="p-8 flex justify-center">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    // Still render layout; just show error message at top
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-red-600">{error}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <aside className="hidden w-64 shrink-0 md:block md:sticky md:top-[var(--sp-sticky-top)] md:self-start">
            <div className="space-y-6">
              <div className="px-1">
                <p className="text-xs font-semibold text-gray-500">My Account</p>
              </div>

              <div className="flex items-center gap-3 px-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-sm font-bold text-white shadow-sm">
                  {(user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                  {(user?.last_name?.[0] || "").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {user?.first_name
                      ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`
                      : user?.email || "Client"}
                  </p>
                  <p className="truncate text-xs font-medium text-gray-500">Client</p>
                </div>
              </div>

              <nav className="space-y-1">
                <SidebarItem
                  active={activeSection === "orders"}
                  icon={Package}
                  label="Orders"
                  count={ordersCount}
                  onClick={() => setActiveSection("orders")}
                />
                <SidebarItem
                  active={activeSection === "requests"}
                  icon={ClipboardList}
                  label="Requests"
                  count={pendingRequestsCount}
                  onClick={() => setActiveSection("requests")}
                />
                <SidebarItem
                  active={activeSection === "invoices"}
                  icon={FileText}
                  label="Invoices"
                  count={invoicesCount}
                  onClick={() => setActiveSection("invoices")}
                />
                <SidebarItem
                  active={activeSection === "disputes"}
                  icon={AlertTriangle}
                  label="Disputes"
                  count={disputesCount}
                  onClick={() => setActiveSection("disputes")}
                />
                <SidebarItem
                  active={activeSection === "reviews"}
                  icon={Star}
                  label="Reviews"
                  count={reviewsCount}
                  onClick={() => setActiveSection("reviews")}
                />
                <SidebarItem
                  active={activeSection === "my_list"}
                  icon={Heart}
                  label="My List"
                  count={savedCount}
                  onClick={() => setActiveSection("my_list")}
                />
              </nav>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">{sectionTitle}</h1>
                <p className="mt-1 text-sm text-gray-500">{todayFormatted}</p>
              </div>

              <div className="md:hidden">
                <label htmlFor="client-dashboard-section" className="sr-only">
                  Section
                </label>
                <select
                  id="client-dashboard-section"
                  value={activeSection}
                  onChange={(e) => setActiveSection(e.target.value as SectionId)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm"
                >
                  <option value="orders">Orders</option>
                  <option value="requests">Requests</option>
                  <option value="invoices">Invoices</option>
                  <option value="disputes">Disputes</option>
                  <option value="reviews">Reviews</option>
                  <option value="my_list">My List</option>
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {activeSection === "orders" && (
                <section className="space-y-3">
                  {(loadingBookings || loadingVideoOrders) && orderItems.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Spinner />
                    </div>
                  ) : orderItems.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      No orders yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orderItems.map((order) => (
                        <div
                          key={`${order.kind}:${order.id}`}
                          className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                                  {order.kind === "booking" ? "Booking" : "Video"}
                                </span>
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {order.title}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-gray-600 truncate">{order.subtitle}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {order.paidAt
                                  ? `Paid ${formatDateSafe(order.paidAt, "EEE, d MMM yyyy")}`
                                  : `Ordered ${formatDateSafe(order.orderedAt, "EEE, d MMM yyyy")}`}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {order.statusStyle ? (
                                  <span
                                    className="inline-flex items-center font-medium"
                                    style={order.statusStyle}
                                  >
                                    {order.statusLabel}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 capitalize">
                                    {order.statusLabel}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 text-sm font-semibold text-gray-900">
                                {order.amount !== null ? formatCurrency(order.amount) : "—"}
                              </div>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <Link
                                  href={order.primaryActionHref}
                                  className={
                                    order.primaryActionVariant === "primary"
                                      ? "inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                                      : "inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                  }
                                >
                                  {order.primaryActionLabel}
                                </Link>
                                {order.secondaryActionHref && order.secondaryActionLabel ? (
                                  <Link
                                    href={order.secondaryActionHref}
                                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                  >
                                    {order.secondaryActionLabel}
                                  </Link>
                                ) : null}
                                {order.invoiceHref ? (
                                  <a
                                    href={order.invoiceHref}
                                    target="_blank"
                                    rel="noopener"
                                    className={
                                      order.primaryActionVariant === "primary"
                                        ? "inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                        : "inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                                    }
                                  >
                                    View invoice
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeSection === "requests" && (
                <section className="space-y-3">
                  <SectionList
                    title="Booking Requests"
                    data={bookingRequests}
                    renderItem={(r) => <BookingRequestCard req={r} />}
                    emptyState={
                      loadingRequests ? (
                        <div className="py-8 flex justify-center">
                          <Spinner />
                        </div>
                      ) : (
                        <span>No requests yet</span>
                      )
                    }
                  />
                </section>
              )}

              {activeSection === "invoices" && (
                <section className="space-y-3">
                  {loadingBookings && invoiceItems.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Spinner />
                    </div>
                  ) : invoiceItems.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      No invoices yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {invoiceItems.map((iv) => (
                        <div
                          key={iv.id}
                          className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                Invoice #{iv.id}
                              </div>
                              <div className="mt-0.5 text-sm text-gray-600 truncate">{iv.title}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatDateSafe(iv.createdAt, "MMM d, yyyy")}
                              </div>
                            </div>
                            <a
                              href={iv.href}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                            >
                              View invoice
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeSection === "disputes" && (
                <section className="space-y-3">
                  {loadingVideoOrders && disputeOrders.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Spinner />
                    </div>
                  ) : disputeOrders.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      No disputes.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {disputeOrders.map((o) => (
                        <div
                          key={o.id}
                          className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900">
                                Personalised Video
                              </div>
                              <div className="mt-0.5 text-sm text-gray-600">Order #{o.id}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatDateSafe(
                                  o.paid_at_utc || o.created_at_utc,
                                  "MMM d, yyyy",
                                )}
                              </div>
                            </div>
                            <Link
                              href={`/video-orders/${o.id}`}
                              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                            >
                              View details
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeSection === "reviews" && (
                <section className="space-y-3">
                  {loadingBookings && completedBookings.length === 0 ? (
                    <div className="py-10 flex justify-center">
                      <Spinner />
                    </div>
                  ) : completedBookings.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      No completed bookings to review yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {completedBookings.map((b) => {
                        const providerName = resolveProviderName(b);
                        const serviceTitle = b.service?.title || "—";
                        const existing = submittedReviews[b.id];
                        return (
                          <div
                            key={b.id}
                            className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                  {providerName}
                                </div>
                                <div className="mt-0.5 text-sm text-gray-600 truncate">
                                  {serviceTitle}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                  {formatDateSafe(b.start_time, "MMM d, yyyy h:mm a")}
                                </div>
                              </div>

                              <div className="shrink-0 flex flex-col items-end gap-2">
                                {existing ? (
                                  <div className="text-sm font-semibold text-gray-900">
                                    Rated {existing.rating}/5
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReviewId(b.id);
                                      setReviewProviderName(providerName);
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                                  >
                                    Leave review
                                  </button>
                                )}
                                <Link
                                  href={`/dashboard/client/bookings/${b.id}`}
                                  className="text-sm font-semibold text-gray-900 hover:underline"
                                >
                                  View order
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeSection === "my_list" && (
                <section className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Saved</h2>
                      <p className="text-sm text-gray-500">
                        Favourite venues, services, and more.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                      onClick={() => {
                        setSavedServices([]);
                        setSavedServicesError(null);
                        setSavedServicesLoaded(false);
                        setSavedServiceIds(readSavedServiceIds());
                      }}
                    >
                      Refresh
                    </button>
                  </div>

                  {savedServicesError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      {savedServicesError}
                    </div>
                  ) : null}

                  {savedServicesLoading ? (
                    <div className="py-10 flex justify-center">
                      <Spinner />
                    </div>
                  ) : savedServiceIds.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      You haven&apos;t saved anything yet.
                    </div>
                  ) : savedServices.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      Saved items found, but details could not be loaded right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {savedServices.map((svc) => {
                        const providerName =
                          svc.service_provider?.business_name ||
                          (svc as any)?.artist?.business_name ||
                          "Service Provider";
                        return (
                          <div
                            key={svc.id}
                            className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                  {svc.title}
                                </div>
                                <div className="mt-0.5 text-sm text-gray-600 truncate">
                                  {providerName}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                  {Number.isFinite(Number(svc.price))
                                    ? formatCurrency(Number(svc.price))
                                    : "—"}
                                </div>
                              </div>
                              <div className="shrink-0 flex flex-col gap-2 items-end">
                                <Link
                                  href={`/services/${svc.id}`}
                                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                                >
                                  View
                                </Link>
                                <button
                                  type="button"
                                  className="text-sm font-semibold text-gray-700 hover:text-gray-900"
                                  onClick={() => {
                                    try {
                                      window.localStorage.setItem(
                                        getServiceSavedStorageKey(svc.id),
                                        "0",
                                      );
                                    } catch {}
                                    setSavedServiceIds((prev) =>
                                      prev.filter((id) => id !== svc.id),
                                    );
                                    setSavedServices((prev) =>
                                      prev.filter((s) => s.id !== svc.id),
                                    );
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          </main>
        </div>
      </div>

      {reviewId ? (
        <ReviewFormModal
          isOpen={reviewId !== null}
          bookingId={reviewId}
          providerName={reviewProviderName}
          onClose={() => setReviewId(null)}
          onSubmitted={(review: Review) => {
            setSubmittedReviews((prev) => ({ ...prev, [review.booking_id]: review }));
          }}
        />
      ) : null}
    </MainLayout>
  );
}
