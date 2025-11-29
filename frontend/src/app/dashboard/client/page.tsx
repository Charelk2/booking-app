"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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

type TabId = "requests" | "bookings";

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

  const [error, setError] = useState<string | null>(null);

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
  }, [
    authLoading,
    user,
    fetchedBookings,
    fetchedRequests,
    bookings.length,
    bookingRequests.length,
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <DashboardTabs
          tabs={[
            { id: "requests", label: "Requests" },
            { id: "bookings", label: "Bookings" },
          ]}
          active={activeTab}
          onChange={(id) =>
            setActiveTab(id === "requests" ? "requests" : "bookings")
          }
          variant="segmented"
        />

        <div className="mt-6">
          {activeTab === "requests" && (
            <section>
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
            <section>
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
                          {format(
                            new Date(booking.start_time),
                            "MMM d, yyyy h:mm a",
                          )}
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
                    <div className="mt-2">
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
    </MainLayout>
  );
}
