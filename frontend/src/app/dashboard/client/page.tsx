"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Booking, BookingRequest } from "@/types";
import { getMyClientBookingsCached, getMyBookingRequestsCached, peekClientDashboardCache } from "@/lib/api";
import {
  SectionList,
  BookingRequestCard,
  DashboardTabs,
} from "@/components/dashboard";
import { Spinner } from "@/components/ui";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { statusChipClass } from "@/components/ui/status";
import Link from "next/link";

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState("");
  const [fetchedBookings, setFetchedBookings] = useState(false);
  const [fetchedRequests, setFetchedRequests] = useState(false);
  const bookingsInflightRef = React.useRef<Promise<Booking[] | null> | null>(null);
  const requestsInflightRef = React.useRef<Promise<BookingRequest[] | null> | null>(null);

  const initialTab = params.get("tab") === "bookings" ? "bookings" : "requests";
  const [activeTab, setActiveTab] = useState<"requests" | "bookings" | "services">(initialTab);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, router, pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/auth?intent=login&next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== "client") {
      router.push("/dashboard/artist");
      return;
    }

    // Hydrate immediately from cache to avoid empty-state flash
    try {
      const cached = peekClientDashboardCache();
      if (cached.bookings) setBookings(cached.bookings);
      if (cached.requests) setBookingRequests(cached.requests);
      if (cached.bookings || cached.requests) setLoading(false);
    } catch {}

    const fetchData = async () => {
      // Lazy fetch by tab to reduce upfront latency
      if (!fetchedBookings && activeTab === 'bookings') {
        setLoadingBookings(true);
        try {
          if (!bookingsInflightRef.current) {
            bookingsInflightRef.current = getMyClientBookingsCached().catch(() => null);
          }
          const bookingsData = await bookingsInflightRef.current;
          bookingsInflightRef.current = null;
          if (bookingsData) {
            setBookings(bookingsData);
            setFetchedBookings(true);
          }
        } catch (err) {
          console.error("Client dashboard bookings fetch error:", err);
          setError("Failed to load bookings. Please try again.");
        } finally {
          setLoadingBookings(false);
        }
      }
      if (!fetchedRequests && activeTab === 'requests') {
        setLoadingRequests(true);
        try {
          if (!requestsInflightRef.current) {
            requestsInflightRef.current = getMyBookingRequestsCached().catch(() => null);
          }
          const requestsData = await requestsInflightRef.current;
          requestsInflightRef.current = null;
          if (requestsData) {
            setBookingRequests(requestsData);
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

    fetchData();
  }, [user, authLoading, router, pathname, activeTab, fetchedBookings, fetchedRequests]);

  // Preload the opposite tab in the background after initial fetch
  useEffect(() => {
    if (!user || user.user_type !== "client") return;
    if (!fetchedBookings) {
      (async () => {
        try {
          const bookingsData = await getMyClientBookingsCached();
          setBookings(bookingsData);
          setFetchedBookings(true);
        } catch {}
      })();
    }
    if (!fetchedRequests) {
      (async () => {
        try {
          const requestsData = await getMyBookingRequestsCached();
          setBookingRequests(requestsData);
          setFetchedRequests(true);
        } catch {}
      })();
    }
  }, [user, fetchedBookings, fetchedRequests]);

  const upcomingBookings = useMemo(() => {
    const now = new Date().getTime();
    return bookings
      .filter((b) => new Date(b.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 5);
  }, [bookings]);

  const getInvoiceHref = (booking: Booking): string | null => {
    const anyBooking: any = booking as any;
    const vis = Array.isArray(anyBooking.visible_invoices)
      ? (anyBooking.visible_invoices as Array<{ type: string; id: number }>)
      : [];
    const providerInv = vis.find(
      (iv) => iv.type === 'provider_tax' || iv.type === 'provider_invoice',
    );
    const fallbackInv = vis.length ? vis[vis.length - 1] : undefined;
    const target = providerInv || fallbackInv;
    if (target && typeof target.id === 'number') return `/invoices/${target.id}`;
    if (booking.invoice_id) return `/invoices/${booking.invoice_id}`;
    return `/invoices/by-booking/${booking.id}?type=provider`;
  };

  const loadingCurrent = activeTab === 'bookings' ? loadingBookings : loadingRequests;

  if (loadingCurrent) {
    return (
      <MainLayout>
        <div className="p-8 flex justify-center"><Spinner /></div>
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <DashboardTabs
          tabs={[
            { id: 'requests', label: 'Requests' },
            { id: 'bookings', label: 'Bookings' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id === 'requests' ? 'requests' : 'bookings')}
          variant="segmented"
        />
        <div className="mt-6">
          {activeTab === "requests" && (
            <section>
              <SectionList
                title="Booking Requests"
                data={bookingRequests}
                renderItem={(r) => <BookingRequestCard req={r} />}
                emptyState={<span>No requests yet</span>}
              />
            </section>
          )}
          {activeTab === "bookings" && (
            <section>
              <SectionList
                title="Upcoming Bookings"
                data={upcomingBookings}
                emptyState={<span>No bookings yet</span>}
                renderItem={(booking) => (
                  <div key={booking.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {booking.service?.service_provider?.business_name ||
                           (booking.service as any)?.artist?.business_name ||
                           booking.service_provider?.business_name ||
                           (booking as any)?.artist?.business_name ||
                           'Unknown Service Provider'}
                        </div>
                        <div className="mt-0.5 text-sm text-gray-600 truncate">{booking.service?.title || "—"}</div>
                    <div className="mt-1 text-xs text-gray-500">{format(new Date(booking.start_time), "MMM d, yyyy h:mm a")}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusChipClass(booking.status)}`}>{formatStatus(booking.status)}</span>
                    <div className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(Number(booking.total_price))}</div>
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
                  <Link href="/dashboard/client/bookings" className="text-brand-dark hover:underline text-sm">
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
