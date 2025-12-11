import type { Service } from "@/types";

export type ServiceTypeSlug = "live_performance" | "personalized_video";

export interface AddServiceCommonFields {
  title: string;
  description: string;
  price: number;
  currency: string;
}

export interface AddServiceEngineParams {
  serviceCategorySlug: string;
  serviceType: ServiceTypeSlug;
  service?: Service;
}

export interface AddServiceEngineState {
  serviceType: ServiceTypeSlug;
  common: AddServiceCommonFields;
  typeFields: Record<string, any>;
  status: {
    saving: boolean;
    error: string | null;
    success: boolean;
  };
  resultService: Service | null;
}

export interface AddServiceEngineActions {
  setCommonField<K extends keyof AddServiceCommonFields>(
    key: K,
    value: AddServiceCommonFields[K],
  ): void;
  setTypeField(key: string, value: any): void;
  reset(): void;
  submit(): Promise<void>;
}

export interface AddServiceEngine {
  state: AddServiceEngineState;
  actions: AddServiceEngineActions;
}

