import { useEffect, useRef, useState } from "react";
import type { LiveBookingEngine, LiveBookingEngineParams } from "./types";
import {
  createLiveBookingEngineCore,
  type LiveEnv,
} from "./core";

export function useLiveBookingEngine(
  env: LiveEnv,
  params: LiveBookingEngineParams,
): LiveBookingEngine {
  const coreRef = useRef<ReturnType<typeof createLiveBookingEngineCore> | null>(
    null,
  );

  if (!coreRef.current) {
    coreRef.current = createLiveBookingEngineCore(env, params);
  }

  const core = coreRef.current;
  const [state, setState] = useState(core.getState());

  useEffect(() => {
    const unsub = core.subscribe(setState);
    return unsub;
  }, [core]);

  return { state, actions: core.actions };
}
