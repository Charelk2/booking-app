import type { AxiosInstance } from 'axios';
import type { QuoteCalculationResponse } from '@/types';

export type QuoteEstimatePayload = {
  base_fee: number;
  distance_km: number;
  service_id: number;
  event_city: string;
  accommodation_cost?: number;
  // Optional sound-context inputs for better sizing/pricing
  guest_count?: number;
  venue_type?: 'indoor' | 'outdoor' | 'hybrid';
  stage_required?: boolean;
  stage_size?: 'S' | 'M' | 'L';
  lighting_evening?: boolean;
  backline_required?: boolean;
  upgrade_lighting_advanced?: boolean;
  selected_sound_service_id?: number;
  supplier_distance_km?: number;
  rider_units?: {
    vocal_mics?: number;
    speech_mics?: number;
    monitor_mixes?: number;
    iem_packs?: number;
    di_boxes?: number;
  };
  backline_requested?: Record<string, number>;
};

const QUOTE_ESTIMATE_PATH = '/api/v1/quotes/estimate';

export const livePerformanceEstimate = (
  apiClient: AxiosInstance,
  data: QuoteEstimatePayload
) => apiClient.post<QuoteCalculationResponse>(QUOTE_ESTIMATE_PATH, data);
