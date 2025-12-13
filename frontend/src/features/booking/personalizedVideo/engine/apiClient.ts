import api from "@/lib/api";
import type { QuoteTotalsPreview } from "@/types";

const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

export interface VideoOrderDraftPayload {
  artist_id: number;
  service_id?: number;
  delivery_by_utc: string;
  length_sec: number;
  language: string;
  tone: string;
  recipient_name?: string;
  contact_email?: string;
  contact_whatsapp?: string;
  promo_code?: string;
  price_base: number;
  price_rush: number;
  price_addons: number;
  discount: number;
  total: number;
}

export interface VideoOrder {
  id: number;
  artist_id: number;
  buyer_id: number;
  status:
    | "draft"
    | "awaiting_payment"
    | "paid"
    | "in_production"
    | "delivered"
    | "completed"
    | "in_dispute"
    | "refunded"
    | "cancelled"
    // legacy aliases (normalized on read where possible)
    | "info_pending"
    | "closed";
  delivery_by_utc: string;
  delivery_url?: string | null;
  delivery_note?: string | null;
  delivery_attachment_url?: string | null;
  delivery_attachment_meta?: Record<string, any> | null;
  length_sec: number;
  language: string;
  tone: string;
  price_base: number;
  price_rush: number;
  price_addons: number;
  discount: number;
  total: number;
  totals_preview?: QuoteTotalsPreview | null;
  contact_email?: string;
  contact_whatsapp?: string;
  answers?: Record<string, any>;
}

export interface VideoOrderApiClient {
  createOrder(
    payload: VideoOrderDraftPayload,
    idempotencyKey: string,
  ): Promise<VideoOrder | null>;
  listOrders(): Promise<VideoOrder[]>;
  getOrder(orderId: number): Promise<VideoOrder | null>;
  updateStatus(orderId: number, status: VideoOrder["status"] | string): Promise<void>;
  verifyPaystack(orderId: number, reference: string): Promise<VideoOrder | null>;
  deliverOrder(
    orderId: number,
    payload: {
      delivery_url?: string | null;
      note?: string | null;
      auto_complete_hours?: number;
      attachment_url?: string | null;
      attachment_meta?: Record<string, any> | null;
    },
  ): Promise<VideoOrder | null>;
  postAnswer(orderId: number, key: string, value: any): Promise<boolean>;
  createThreadForOrder(
    artistId: number,
    serviceId: number | undefined,
    orderId: number,
    idempotencyKey: string,
  ): Promise<number | null>;
  postThreadMessage(threadId: number | string, content: string): Promise<void>;
}

async function safeGet<T>(url: string, params?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await api.get<T>(url, { params });
    return res.data as T;
  } catch {
    return null;
  }
}

async function safePost<T>(
  url: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T | null> {
  try {
    const res = await api.post<T>(url, data, { headers });
    return res.data as T;
  } catch {
    return null;
  }
}

export const videoOrderApiClient: VideoOrderApiClient = {
  async createOrder(payload, idempotencyKey) {
    return safePost<VideoOrder>("/api/v1/video-orders", payload, {
      "Idempotency-Key": idempotencyKey,
    });
  },
  async listOrders() {
    const res = await safeGet<VideoOrder[]>("/api/v1/video-orders");
    return Array.isArray(res) ? res : [];
  },
  async getOrder(orderId) {
    return safeGet<VideoOrder>(`/api/v1/video-orders/${orderId}`);
  },
  async updateStatus(orderId, status) {
    await safePost(`/api/v1/video-orders/${orderId}/status`, { status });
  },
  async verifyPaystack(orderId, reference) {
    return safePost<VideoOrder>(`/api/v1/video-orders/${orderId}/paystack/verify`, {
      reference,
    });
  },
  async deliverOrder(orderId, payload) {
    return safePost<VideoOrder>(`/api/v1/video-orders/${orderId}/deliver`, payload);
  },
  async postAnswer(orderId, key, value) {
    const ok = await safePost(`/api/v1/video-orders/${orderId}/answers`, {
      question_key: key,
      value,
    });
    return Boolean(ok);
  },
  async createThreadForOrder(artistId, serviceId, orderId, idempotencyKey) {
    if (ENABLE_PV_ORDERS) return orderId;
    if (!serviceId) return null;
    const res = await safePost<{ id: number }>(
      `/api/v1/booking-requests/`,
      { artist_id: artistId, service_id: serviceId },
      { "Idempotency-Key": idempotencyKey },
    );
    return res?.id ?? null;
  },
  async postThreadMessage(threadId, content) {
    await safePost(`/api/v1/booking-requests/${threadId}/messages`, {
      message_type: "SYSTEM",
      content,
    });
  },
};

export { safeGet, safePost };
