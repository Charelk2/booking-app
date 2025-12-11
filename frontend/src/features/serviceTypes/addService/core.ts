import type {
  AddServiceEngine,
  AddServiceEngineActions,
  AddServiceEngineParams,
  AddServiceEngineState,
  AddServiceCommonFields,
} from "./types";
import type { Service } from "@/types";
import type { AddServiceApiClient } from "./apiClient";
import { SERVICE_TYPE_REGISTRY } from "./serviceTypeRegistry";
import type { ServiceTypeSlug } from "./types";

export interface AddServiceEnv {
  now(): Date;
  api: AddServiceApiClient;
}

export interface AddServiceCore {
  getState(): AddServiceEngineState;
  subscribe(
    listener: (state: AddServiceEngineState) => void,
  ): () => void;
  actions: AddServiceEngineActions;
}

export function createAddServiceEngineCore(
  env: AddServiceEnv,
  params: AddServiceEngineParams,
): AddServiceCore {
  const config = SERVICE_TYPE_REGISTRY[params.serviceType];

  const initialCommon: AddServiceCommonFields = {
    title: params.service?.title ?? "",
    description: params.service?.description ?? "",
    price: params.service?.price ?? 0,
    currency: "ZAR",
  };

  const initialTypeFields: Record<string, any> = {};
  for (const field of config.fields) {
    const existingDetails = (params.service?.details ||
      {}) as Record<string, any>;
    if (field.key in existingDetails) {
      initialTypeFields[field.key] = existingDetails[field.key];
    } else if (field.defaultValue !== undefined) {
      initialTypeFields[field.key] = field.defaultValue;
    }
  }

  let state: AddServiceEngineState = {
    serviceType: params.serviceType,
    common: initialCommon,
    typeFields: initialTypeFields,
    status: {
      saving: false,
      error: null,
      success: false,
    },
    resultService: null,
  };

  const listeners = new Set<(s: AddServiceEngineState) => void>();

  const getState = () => state;

  const notify = () => {
    listeners.forEach((l) => l(state));
  };

  const setState = (partial: Partial<AddServiceEngineState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const actions: AddServiceEngineActions = {
    setCommonField(key, value) {
      const nextCommon = { ...state.common, [key]: value };
      setState({ common: nextCommon });
    },
    setTypeField(key, value) {
      const nextTypeFields = { ...state.typeFields, [key]: value };
      setState({ typeFields: nextTypeFields });
    },
    reset() {
      setState({
        serviceType: params.serviceType,
        common: initialCommon,
        typeFields: initialTypeFields,
        status: {
          saving: false,
          error: null,
          success: false,
        },
        resultService: null,
      });
    },
    async submit(extra?: Partial<Service>) {
      const current = getState();
      const cfg = SERVICE_TYPE_REGISTRY[
        current.serviceType as ServiceTypeSlug
      ];
      if (!cfg) return;

      setState({
        status: { saving: true, error: null, success: false },
      });

      try {
        const payload = cfg.buildPayload(
          current.common,
          current.typeFields,
          {
            serviceCategorySlug: params.serviceCategorySlug,
            existing: params.service ?? null,
          },
        );

        const service = params.service
          ? await env.api.update(params.service.id, { ...payload, ...(extra || {}) })
          : await env.api.create({ ...payload, ...(extra || {}) });

        setState({
          status: { saving: false, error: null, success: true },
          resultService: service,
        });
      } catch (e: any) {
        const message =
          e?.message || "Failed to save service. Please try again.";
        setState({
          status: { saving: false, error: message, success: false },
        });
      }
    },
  };

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    actions,
  };
}
