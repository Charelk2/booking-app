"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ClipboardList, Send, Wallet, FileText } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Booking, BookingRequest } from "@/types";
import {
  getMyClientBookingsCached,
  getMyBookingRequestsCached,
  peekClientDashboardCache,
} from "@/lib/api";
import {
  SectionList,
  BookingRequestCard,
  DashboardTabs,
} from "@/components/dashboard";
import { Spinner } from "@/components/ui";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { statusChipStyles } from "@/components/ui/status";
import Link from "next/link";
import { videoOrderApiClient, type VideoOrder } from "@/features/booking/personalizedVideo/engine/apiClient";

type TabId = "requests" | "bookings";

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

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
      </div>
    </div>
  );
}

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTabParam = searchParams.get("tab");
  const initialTab: TabId =
    initialTabParam === "bookings" ? "bookings" : "requests";

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

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
    params.set("tab", activeTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, router, pathname, searchParams]);

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

  // Fetch data for the active tab (only when needed)
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== "client") return;

    const fetchActiveTab = async () => {
      if (!fetchedVideoOrders) {
        setLoadingVideoOrders(true);
        try {
          const orders = await videoOrderApiClient.listOrders();
          setVideoOrders(Array.isArray(orders) ? orders : []);
          setFetchedVideoOrders(true);
        } catch {
          setVideoOrders([]);
        } finally {
          setLoadingVideoOrders(false);
        }
      }

      // BOOKINGS
      if (
        activeTab === "bookings" &&
        !fetchedBookings &&
        !bookingsInflightRef.current
      ) {
        setLoadingBookings(true);
        setError(null);
        try {
          bookingsInflightRef.current = getMyClientBookingsCached().catch(
            () => null,
          );
          const data = await bookingsInflightRef.current;
          bookingsInflightRef.current = null;
          if (data) {
            setBookings(data);
            setFetchedBookings(true);
          }
        } catch (err) {
          console.error("Client dashboard bookings fetch error:", err);
          setError("Failed to load bookings. Please try again.");
        } finally {
          setLoadingBookings(false);
        }
      }

      // REQUESTS
      if (
        activeTab === "requests" &&
        !fetchedRequests &&
        !requestsInflightRef.current
      ) {
        setLoadingRequests(true);
        setError(null);
        try {
          requestsInflightRef.current = getMyBookingRequestsCached().catch(
            () => null,
          );
          const data = await requestsInflightRef.current;
          requestsInflightRef.current = null;
          if (data) {
            setBookingRequests(data);
            setFetchedRequests(true);
          }
        } catch (err) {
          console.error("Client dashboard requests fetch error:", err);
          setError("Failed to load requests. Please try again.");
        } finally {
          setLoadingRequests(false);
        }
      }
    };

    void fetchActiveTab();
  }, [
    authLoading,
    user,
    activeTab,
    fetchedBookings,
    fetchedRequests,
    fetchedVideoOrders,
  ]);

  // Background preload of the opposite tab (best-effort)
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.user_type !== "client") return;

    // Preload bookings
    if (!fetchedBookings && !bookingsInflightRef.current) {
      bookingsInflightRef.current = getMyClientBookingsCached()
        .then((data) => {
          if (data && !bookings.length) {
            setBookings(data);
          }
          setFetchedBookings(true);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          bookingsInflightRef.current = null;
        });
    }

    // Preload requests
    if (!fetchedRequests && !requestsInflightRef.current) {
      requestsInflightRef.current = getMyBookingRequestsCached()
        .then((data) => {
          if (data && !bookingRequests.length) {
            setBookingRequests(data);
          }
          setFetchedRequests(true);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          requestsInflightRef.current = null;
        });
    }

    // Preload video orders
    if (!fetchedVideoOrders && !loadingVideoOrders) {
      setLoadingVideoOrders(true);
      videoOrderApiClient
        .listOrders()
        .then((orders) => {
          setVideoOrders(Array.isArray(orders) ? orders : []);
          setFetchedVideoOrders(true);
          return orders;
        })
        .catch(() => null)
        .finally(() => setLoadingVideoOrders(false));
    }
  }, [
    authLoading,
    user,
    fetchedBookings,
    fetchedRequests,
    bookings.length,
    bookingRequests.length,
    fetchedVideoOrders,
    loadingVideoOrders,
  ]);

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => new Date(b.start_time).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      )
      .slice(0, 5);
  }, [bookings]);

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

  const totalSpend = useMemo(
    () =>
      bookings.reduce(
        (sum, b) => sum + (Number((b as any)?.total_price) || 0),
        0,
      ),
    [bookings],
  );

  const nextBooking = useMemo(
    () =>
      [...upcomingBookings].sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      )[0],
    [upcomingBookings],
  );

  const getInvoiceHref = (booking: Booking): string | null => {
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
  };

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
          {/* === DESKTOP SIDEBAR === */}
          <aside className="hidden w-64 shrink-0 md:block md:sticky md:top-[var(--sp-sticky-top)] md:self-start">
            <div className="space-y-6">
              {/* User snippet */}
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
                  <p className="truncate text-xs font-medium text-gray-500">Client Dashboard</p>
                </div>
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                <SidebarItem
                  active={activeTab === "requests"}
                  icon={ClipboardList}
                  label="Requests"
                  count={pendingRequestsCount}
                  onClick={() => setActiveTab("requests")}
                />
                <SidebarItem
                  active={activeTab === "bookings"}
                  icon={Calendar}
                  label="Bookings"
                  count={upcomingBookings.length}
                  onClick={() => setActiveTab("bookings")}
                />
              </nav>

              {/* Quick links */}
              <div className="space-y-2">
                <Link
                  href="/inbox"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Open inbox
                </Link>
                <Link
                  href="/dashboard/client/bookings"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  All bookings
                </Link>
                <Link
                  href="/dashboard/client/quotes"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Quotes & Requests
                </Link>
              </div>
            </div>
          </aside>

          {/* === MAIN CONTENT === */}
          <main className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
                <p className="mt-1 text-sm text-gray-500">{todayFormatted}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard/client/bookings"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  <Calendar size={16} className="mr-2" /> All bookings
                </Link>
                <Link
                  href="/dashboard/client/quotes"
                  className="inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                >
                  <Send size={16} className="mr-2" /> Quotes & Requests
                </Link>
              </div>
            </div>

            {/* Mobile tabs */}
            <div className="mt-4 md:hidden">
              <DashboardTabs
                tabs={[
                  { id: "requests", label: "Requests" },
                  { id: "bookings", label: "Bookings" },
                ]}
                active={activeTab}
                onChange={(id) => setActiveTab(id === "requests" ? "requests" : "bookings")}
                variant="segmented"
              />
            </div>

            <div className="mt-8 space-y-6">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={<Calendar size={18} />}
                  label="Upcoming bookings"
                  value={upcomingBookings.length}
                  hint={
                    nextBooking
                      ? format(new Date(nextBooking.start_time), "MMM d, h:mm a")
                      : "No upcoming dates"
                  }
                />
                <StatCard
                  icon={<ClipboardList size={18} />}
                  label="Active requests"
                  value={pendingRequestsCount}
                  hint={`${bookingRequests.length} total`}
                />
                <StatCard
                  icon={<Wallet size={18} />}
                  label="Total spend"
                  value={formatCurrency(totalSpend)}
                  hint={bookings.length ? `${bookings.length} bookings` : "No spend yet"}
                />
                <StatCard
                  icon={<Send size={18} />}
                  label="Drafts & quotes"
                  value={bookingRequests.length}
                  hint="Includes submitted requests"
                />
              </section>

              <div className="space-y-6">
                {(loadingVideoOrders || videoOrders.length > 0) && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Personalised Video
                        </h2>
                        <p className="text-sm text-gray-500">
                          Finish briefs, payments, and view deliveries.
                        </p>
                      </div>
                    </div>
                    {loadingVideoOrders ? (
                      <div className="py-6 flex justify-center">
                        <Spinner />
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {videoOrders.map((order) => {
                          const status = String(order.status || "").toLowerCase();
                          const needsPayment = status === "awaiting_payment";
                          const needsBrief = status === "paid" || status === "info_pending";
                          const delivered =
                            status === "delivered" ||
                            status === "completed" ||
                            status === "closed";
                          const inProd = status === "in_production";
                          let actionHref = `/video-orders/${order.id}`;
                          let actionLabel = "View order";
                          if (needsPayment) {
                            actionHref = `/video-orders/${order.id}/pay`;
                            actionLabel = "Complete payment";
                          } else if (needsBrief) {
                            actionHref = `/video-orders/${order.id}/brief`;
                            actionLabel = "Finish brief";
                          } else if (delivered) {
                            actionHref = `/video-orders/${order.id}`;
                            actionLabel = "View delivery";
                          } else if (inProd) {
                            actionLabel = "Track progress";
                          }
                          return (
                            <div
                              key={order.id}
                              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    Order #{order.id}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Delivery by{" "}
                                    {order.delivery_by_utc
                                      ? format(new Date(order.delivery_by_utc), "MMM d, yyyy")
                                      : "—"}
                                  </p>
                                </div>
                                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">
                                  {status.replace(/_/g, " ")}
                                </span>
                              </div>
                              <div className="mt-3 text-sm text-gray-700 flex items-center gap-2">
                                <FileText size={14} />
                                <span>
                                  {needsPayment
                                    ? "Payment pending"
                                    : needsBrief
                                    ? "Brief incomplete"
                                    : delivered
                                    ? "Delivered"
                                    : inProd
                                    ? "In production"
                                    : "In progress"}
                                </span>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <Link
                                  href={actionHref}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                                >
                                  {actionLabel}
                                </Link>
                                <Link
                                  href={`/video-orders/${order.id}`}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                >
                                  View details
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {activeTab === "requests" && (
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

                {activeTab === "bookings" && (
                  <section className="space-y-4">
                    <SectionList
                      title="Upcoming Bookings"
                      data={upcomingBookings}
                      emptyState={
                        loadingBookings ? (
                          <div className="py-8 flex justify-center">
                            <Spinner />
                          </div>
                        ) : (
                          <span>No bookings yet</span>
                        )
                      }
                      renderItem={(booking) => (
                        <div
                          key={booking.id}
                          className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {booking.service?.service_provider?.business_name ||
                                  (booking.service as any)?.artist?.business_name ||
                                  booking.service_provider?.business_name ||
                                  (booking as any)?.artist?.business_name ||
                                  "Unknown Service Provider"}
                              </div>
                              <div className="mt-0.5 text-sm text-gray-600 truncate">
                                {booking.service?.title || "—"}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {format(new Date(booking.start_time), "MMM d, yyyy h:mm a")}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span
                                className="inline-flex items-center font-medium"
                                style={statusChipStyles(booking.status)}
                              >
                                {formatStatus(booking.status)}
                              </span>
                              <div className="mt-2 text-sm font-semibold text-gray-900">
                                {formatCurrency(Number(booking.total_price))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                            <span className="truncate">Booking ID #{booking.id}</span>
                            {(() => {
                              const href = getInvoiceHref(booking);
                              if (!href) return null;
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener"
                                  className="text-brand-dark hover:underline text-sm"
                                >
                                  View invoice
                                </a>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    />

                    {bookings.length > upcomingBookings.length && (
                      <div className="mt-2">
                        <Link
                          href="/dashboard/client/bookings"
                          className="text-brand-dark hover:underline text-sm"
                        >
                          View All Bookings
                        </Link>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </MainLayout>
  );
}
