import { useEffect, useRef, useState } from "react";
import { Toast } from "@/components/ui";
import type { Service } from "@/types";
import type { AddServiceEngine, AddServiceEngineParams } from "./types";
import { createAddServiceEngineCore, type AddServiceEnv } from "./core";
import { addServiceApiClient } from "./apiClient";

export function useAddServiceEngine(
  params: AddServiceEngineParams & {
    onSaved?: (service: Service) => void;
  },
): AddServiceEngine {
  const instanceKey = `${params.serviceCategorySlug}:${params.serviceType}:${
    params.service?.id ? String(params.service.id) : "new"
  }`;
  const coreRef = useRef<{
    key: string;
    core: ReturnType<typeof createAddServiceEngineCore>;
  } | null>(null);

  if (!coreRef.current || coreRef.current.key !== instanceKey) {
    const env: AddServiceEnv = {
      now: () => new Date(),
      api: addServiceApiClient,
    };
    coreRef.current = {
      key: instanceKey,
      core: createAddServiceEngineCore(env, params),
    };
  }

  const core = coreRef.current.core;
  const [state, setState] = useState(core.getState());

  useEffect(() => {
    setState(core.getState());
    const unsubscribe = core.subscribe(setState);
    return unsubscribe;
  }, [core]);

  useEffect(() => {
    if (state.status.success && state.resultService) {
      if (params.onSaved) {
        params.onSaved(state.resultService);
      }
      Toast.success("Service saved.");
    } else if (state.status.error) {
      Toast(state.status.error);
    }
  }, [state.status.success, state.status.error, state.resultService, params]);

  return { state, actions: core.actions };
}
