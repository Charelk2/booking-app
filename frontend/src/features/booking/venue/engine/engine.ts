"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBookingRequest, postMessageToBookingRequest } from "@/lib/api";
import type { VenueBookingEngine, VenueBookingEngineParams } from "./types";
import {
  createVenueBookingEngineCore,
  type VenueBookingEnv,
} from "./core";

export function useVenueBookingEngine(
  params: VenueBookingEngineParams,
): VenueBookingEngine {
  const router = useRouter();
  const envRef = useRef<VenueBookingEnv | null>(null);

  if (!envRef.current) {
    envRef.current = {
      now: () => new Date(),
      bookingApi: {
        async createBookingRequest(payload: any) {
          const res = await createBookingRequest(payload as any);
          const id = Number((res as any)?.data?.id || 0);
          if (!id) throw new Error("Failed to create booking request");
          return { id };
        },
        async postSystemMessage(bookingRequestId, content, opts) {
          await postMessageToBookingRequest(
            bookingRequestId,
            { content, message_type: "SYSTEM" } as any,
            { clientRequestId: opts?.clientRequestId },
          );
        },
      },
      log: (evt, data) => {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.debug("venueEngine", evt, data);
        }
      },
    } satisfies VenueBookingEnv;
  }

  const env = envRef.current;
  const [core] = useState(() => createVenueBookingEngineCore(env, params));
  const [state, setState] = useState(core.getState());

  useEffect(() => core.subscribe(setState), [core]);

  useEffect(() => {
    if (state.booking.status === "submitted" && state.booking.requestId) {
      router.push(`/booking-requests/${state.booking.requestId}`);
    }
  }, [state.booking.status, state.booking.requestId, router]);

  return { state, actions: core.actions };
}

