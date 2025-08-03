"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Booking, BookingRequest } from "@/types";
import { getMyClientBookings, getMyBookingRequests } from "@/lib/api";
import SectionList from "@/components/dashboard/SectionList";
import BookingRequestCard from "@/components/dashboard/BookingRequestCard";
import { Spinner } from "@/components/ui";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import { format } from "date-fns";
import { formatCurrency, formatStatus } from "@/lib/utils";
import Link from "next/link";

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const initialTab = params.get("tab") === "bookings" ? "bookings" : "requests";
  const [activeTab, setActiveTab] = useState<"requests" | "bookings">(initialTab);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, router, pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== "client") {
      router.push("/dashboard/artist");
      return;
    }

    const fetchData = async () => {
      try {
        const [bookingsData, requestsData] = await Promise.all([
          getMyClientBookings(),
          getMyBookingRequests(),
        ]);
        setBookings(bookingsData.data);
        setBookingRequests(requestsData.data);
      } catch (err) {
        console.error("Client dashboard fetch error:", err);
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router, pathname]);

  const upcomingBookings = useMemo(() => {
    const now = new Date().getTime();
    return bookings
      .filter((b) => new Date(b.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 5);
  }, [bookings]);

  if (loading) {
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
        <DashboardTabs activeTab={activeTab} onChange={setActiveTab} showServices={false} />
        <div className="mt-6">
          {activeTab === "requests" && (
            <section>
              <SectionList
                title="Booking Requests"
                data={bookingRequests}
                renderItem={(r) => <BookingRequestCard key={r.id} request={r} onUpdate={() => {}} />}
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
                  <div key={booking.id} className="bg-white p-4 shadow rounded-lg">
                    <div className="font-medium text-gray-900">
                      {booking.artist?.first_name || "Unknown"} {booking.artist?.last_name || ""}
                    </div>
                    <div className="text-sm text-gray-500">{booking.service?.title || "—"}</div>
                    <div className="text-sm text-gray-500">
                      {format(new Date(booking.start_time), "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          booking.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : booking.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : booking.status === "confirmed"
                            ? "bg-brand-light text-brand-dark"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {formatStatus(booking.status)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatCurrency(Number(booking.total_price))}
                      </span>
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

