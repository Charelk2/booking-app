"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMyArtistBookingsCached,
  getMyServices,
  getServiceProviderProfileMe,
  getBookingRequestsForArtistCached,
  getDashboardStatsCached,
  updateService,
  peekArtistDashboardCache,
} from "@/lib/api";
import { normalizeService, applyDisplayOrder } from "@/lib/utils";
import type { Booking, BookingRequest, Service, ServiceProviderProfile } from "@/types";

export function useArtistDashboardData(userId?: number) {
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
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
    setServicesLoading(true);
    setError("");
    // Hydrate from cache first for instant paint
    try {
      const cached = peekArtistDashboardCache();
      if (cached.bookings) setBookings(cached.bookings);
      if (cached.requests) setBookingRequests(cached.requests);
      if (cached.stats) setDashboardStats(cached.stats);
      if (cached.bookings || cached.requests || cached.stats) setLoading(false);
    } catch {}

    try {
      // Fetch core dashboard data (bookings, profile, requests, stats)
      const corePromise = Promise.all([
        getMyArtistBookingsCached(),
        getServiceProviderProfileMe(),
        getBookingRequestsForArtistCached(),
        getDashboardStatsCached(),
      ]);

      // Fetch services in parallel so the Services tab can render as soon as
      // /services/mine completes, without waiting on heavier endpoints.
      (async () => {
        try {
          const servicesRes = await getMyServices();
          const processedServices = (servicesRes.data as Service[])
            .map((s) => normalizeService(s))
            .sort((a, b) => a.display_order - b.display_order);
          setServices(processedServices);
        } catch (svcErr) {
          console.error("useArtistDashboardData services error:", svcErr);
        } finally {
          setServicesLoading(false);
        }
      })();

      const [bookingsRes, profileRes, requestsRes, statsRes] = await corePromise;

      setBookings(bookingsRes);
      setBookingRequests(requestsRes);
      setArtistProfile(profileRes.data);
      setDashboardStats(statsRes);
    } catch (err) {
      console.error("useArtistDashboardData error:", err);
      const anyErr = err as any;
      const detail = anyErr?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : anyErr?.message;
      const normalized = (msg || "").toString().toLowerCase();
      if (normalized.includes("inactive user")) {
        setError("Your provider account is deactivated. Please contact support to reactivate it.");
      } else {
        setError("Failed to load dashboard data. Please try again.");
      }
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
    servicesLoading,
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
