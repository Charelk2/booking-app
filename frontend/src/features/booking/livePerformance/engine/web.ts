import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getServiceProviderAvailability,
  calculateQuote,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
} from "@/lib/api";
import type { EventDetails } from "@/contexts/BookingContext";
import type { TravelResult } from "@/lib/travel";
import { getDrivingMetricsCached } from "@/lib/travel";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import type { LiveBookingEngine, LiveBookingEngineParams } from "./types";
import { createLiveBookingEngineCore, type LiveEnv } from "./core";
import { useLiveBookingEngine } from "./engine";

type StoredSnapshot = {
  details: EventDetails;
  requestId: number | null;
  travelResult?: TravelResult | null;
};

function makeStorage(key: string): LiveEnv["storage"] {
  return {
    async loadDraft(k) {
      try {
        const raw = localStorage.getItem(k || key);
        if (!raw) return null;
        return JSON.parse(raw) as StoredSnapshot;
      } catch {
        return null;
      }
    },
    async saveDraft(k, snapshot) {
      try {
        localStorage.setItem(k || key, JSON.stringify(snapshot));
      } catch {}
    },
    async clearDraft(k) {
      try {
        localStorage.removeItem(k || key);
      } catch {}
    },
  };
}

export function useLiveBookingEngineWeb(
  params: LiveBookingEngineParams,
): LiveBookingEngine {
  const router = useRouter();
  const offline = useOfflineQueue();
  const envRef = useRef<LiveEnv | null>(null);

  if (!envRef.current) {
    const storage = makeStorage(`live:${params.artistId}:${params.serviceId}`);
    const serviceCache = new Map<number, any | null>();
    const riderCache = new Map<number, any | null>();
    envRef.current = {
      now: () => new Date(),
      availability: {
        async getUnavailableDates(artistId: number) {
          const res = await getServiceProviderAvailability(artistId);
          return (res?.data?.unavailable_dates || []) as string[];
        },
      },
      service: {
        async getService(serviceId: number) {
          if (serviceCache.has(serviceId)) return serviceCache.get(serviceId) || null;
          try {
            const res = await fetch(`/api/v1/services/${serviceId}`, { cache: "force-cache" });
            if (!res.ok) throw new Error(`svc ${serviceId} ${res.status}`);
            const json = await res.json();
            serviceCache.set(serviceId, json);
            return json;
          } catch {
            serviceCache.set(serviceId, null);
            return null;
          }
        },
        async getRiderSpec(serviceId: number) {
          if (riderCache.has(serviceId)) return riderCache.get(serviceId) || null;
          try {
            const res = await fetch(`/api/v1/services/${serviceId}/rider`, { cache: "force-cache" });
            if (!res.ok) throw new Error(`rider ${serviceId} ${res.status}`);
            const json = await res.json();
            const spec = json?.spec ?? null;
            riderCache.set(serviceId, spec);
            return spec;
          } catch {
            riderCache.set(serviceId, null);
            return null;
          }
        },
      },
      travel: {
        async getDistanceKm(origin: string, destination: string) {
          try {
            const metrics = await getDrivingMetricsCached(origin, destination);
            const dist = metrics?.distanceKm;
            return typeof dist === "number" && Number.isFinite(dist) ? dist : null;
          } catch {
            return null;
          }
        },
      },
      quoteApi: {
        estimateQuote: async (payload: any) => calculateQuote(payload),
      },
      bookingApi: {
        async createDraft(payload: any) {
          const res = await createBookingRequest(payload as any);
          return { id: res?.data?.id } as { id: number };
        },
        async updateDraft(id: number, payload: any) {
          await updateBookingRequest(id, payload as any);
        },
        async submit(id: number, payload: any) {
          await updateBookingRequest(id, payload as any);
        },
        async postSystemMessage(bookingRequestId: number, content: string) {
          await postMessageToBookingRequest(bookingRequestId, {
            content,
            message_type: "SYSTEM",
          } as any);
        },
      },
      storage,
      offline: {
        isOffline: () => offline.isOffline,
        enqueue: (fn) => offline.enqueue(fn),
      },
      log: (evt, data) => {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.debug("liveEngine", evt, data);
        }
      },
    } satisfies LiveEnv;
  }

  const env = envRef.current!;
  const [engine] = useState(() =>
    createLiveBookingEngineCore(env, params),
  );
  const [state, setState] = useState(engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  // Example side-effect: redirect on submit
  useEffect(() => {
    if (state.booking.status === "submitted" && state.booking.requestId) {
      router.push(`/booking-requests/${state.booking.requestId}`);
    }
  }, [state.booking.status, state.booking.requestId, router]);

  return { state, actions: engine.actions };
}
