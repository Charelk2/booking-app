"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMyArtistBookingsCached,
  getMyServices,
  getServiceProviderProfileMe,
  getBookingRequestsForArtistCached,
  getDashboardStatsCached,
  getVideoOrders,
  updateService,
  peekArtistDashboardCache,
} from "@/lib/api";
import { normalizeService, applyDisplayOrder } from "@/lib/utils";
import type { Booking, BookingRequest, Service, ServiceProviderProfile } from "@/types";

type VideoOrderLite = {
  id: number;
  artist_id?: number;
  buyer_id?: number;
  service_id?: number | null;
  status?: string;
  delivery_by_utc?: string | null;
  delivery_url?: string | null;
};

export function useArtistDashboardData(userId?: number) {
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [videoOrdersLoading, setVideoOrdersLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [artistProfile, setArtistProfile] = useState<ServiceProviderProfile | null>(null);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [videoOrders, setVideoOrders] = useState<VideoOrderLite[]>([]);
  const [dashboardStats, setDashboardStats] = useState<{
    monthly_new_inquiries: number;
    profile_views: number;
    response_rate: number;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setServicesLoading(true);
    setVideoOrdersLoading(true);
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
          const raw = (servicesRes as any)?.data;
          const list: Service[] = Array.isArray(raw) ? (raw as Service[]) : [];
          const processedServices = list
            .map((s) => normalizeService(s))
            .sort((a, b) => a.display_order - b.display_order);
          setServices(processedServices);
        } catch (svcErr) {
          console.error("useArtistDashboardData services error:", svcErr);
        } finally {
          setServicesLoading(false);
        }
      })();

      // Fetch PV orders (booking_requests + service_extras.pv) in parallel.
      (async () => {
        try {
          const res = await getVideoOrders();
          const raw = (res as any)?.data;
          const list: VideoOrderLite[] = Array.isArray(raw) ? (raw as VideoOrderLite[]) : [];
          const mine = list.filter((o) => Number((o as any)?.artist_id || 0) === Number(userId));
          setVideoOrders(mine);
        } catch (voErr) {
          console.error("useArtistDashboardData video orders error:", voErr);
          setVideoOrders([]);
        } finally {
          setVideoOrdersLoading(false);
        }
      })();

      const [bookingsRes, profileRes, requestsRes, statsRes] = await corePromise;

      setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);
      setBookingRequests(Array.isArray(requestsRes) ? requestsRes : []);
      setArtistProfile((profileRes as any)?.data ?? null);
      setDashboardStats(statsRes && typeof statsRes === "object" && !Array.isArray(statsRes) ? (statsRes as any) : null);
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
    videoOrdersLoading,
    error,
    fetchAll,
    bookings,
    services,
    artistProfile,
    bookingRequests,
    videoOrders,
    dashboardStats,
    setBookingRequests,
    upsertService,
    removeService,
    reorderServices,
  };
}

export default useArtistDashboardData;
