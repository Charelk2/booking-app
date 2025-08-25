"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMyArtistBookings,
  getMyServices,
  getServiceProviderProfileMe,
  getBookingRequestsForArtist,
  getDashboardStats,
  updateService,
} from "@/lib/api";
import { normalizeService, applyDisplayOrder } from "@/lib/utils";
import type { Booking, BookingRequest, Service, ServiceProviderProfile } from "@/types";

export function useArtistDashboardData(userId?: number) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [artistProfile, setArtistProfile] = useState<ServiceProviderProfile | null>(null);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [dashboardStats, setDashboardStats] = useState<{
    monthly_new_inquiries: number;
    profile_views: number;
    response_rate: number;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const [bookingsRes, servicesRes, profileRes, requestsRes, statsRes] = await Promise.all([
        getMyArtistBookings(),
        getMyServices(),
        getServiceProviderProfileMe(),
        getBookingRequestsForArtist(),
        getDashboardStats(),
      ]);

      setBookings(bookingsRes.data);
      setBookingRequests(requestsRes.data);
      setArtistProfile(profileRes.data);
      setDashboardStats(statsRes.data);

      const processedServices = (servicesRes.data as Service[])
        .map((s) => normalizeService(s))
        .sort((a, b) => a.display_order - b.display_order);
      setServices(processedServices);
    } catch (err) {
      console.error("useArtistDashboardData error:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const upsertService = (svc: Service) => {
    const normalized = normalizeService(svc);
    setServices((prev) =>
      [...prev.filter((s) => s.id !== normalized.id), normalized].sort(
        (a, b) => a.display_order - b.display_order,
      ),
    );
  };

  const removeService = (id: number) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const reorderServices = async (ordered: Service[]) => {
    const updated = applyDisplayOrder(ordered);
    setServices(updated);
    try {
      await Promise.all(updated.map((s) => updateService(s.id, { display_order: s.display_order })));
    } catch (e) {
      console.error("Persist service order failed:", e);
    }
  };

  return {
    loading,
    error,
    fetchAll,
    bookings,
    services,
    artistProfile,
    bookingRequests,
    dashboardStats,
    setBookingRequests,
    upsertService,
    removeService,
    reorderServices,
  };
}

export default useArtistDashboardData;
