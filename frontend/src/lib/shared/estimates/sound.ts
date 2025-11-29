import type { AxiosInstance } from 'axios';

export type SoundEstimatePayload = {
  guest_count: number;
  venue_type: 'indoor' | 'outdoor' | 'hybrid';
  stage_required?: boolean;
  stage_size?: 'S' | 'M' | 'L' | null;
  lighting_evening?: boolean;
  upgrade_lighting_advanced?: boolean;
  rider_units?: {
    vocal_mics?: number;
    speech_mics?: number;
    monitor_mixes?: number;
    iem_packs?: number;
    di_boxes?: number;
  };
  backline_requested?: Record<string, number>;
};

const SOUND_ESTIMATE_PATH = '/api/v1/quotes/estimate/sound';

export const soundEstimate = (
  apiClient: AxiosInstance,
  payload: SoundEstimatePayload & { service_id: number }
) => apiClient.post(SOUND_ESTIMATE_PATH, payload);

export const soundEstimateForService = (
  apiClient: AxiosInstance,
  serviceId: number,
  payload: SoundEstimatePayload
) => soundEstimate(apiClient, { ...payload, service_id: serviceId });
