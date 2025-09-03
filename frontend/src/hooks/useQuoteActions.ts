import type { BookingStatus, Message, QuoteV2Create } from '@/types';

// Use relative API base to leverage Next.js rewrites and avoid CORS
const API_V1 = `/api/v1`;

interface StatusMessage extends Message {
  booking_status: BookingStatus;
}

async function jsonFetch<T>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSendQuote() {
  return async (data: QuoteV2Create): Promise<Message> =>
    jsonFetch<Message>(`${API_V1}/quotes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
}

export function useAcceptQuote() {
  return async (
    quoteId: number,
    serviceId?: number,
  ): Promise<StatusMessage> => {
    const url = serviceId
      ? `${API_V1}/quotes/${quoteId}/accept?service_id=${serviceId}`
      : `${API_V1}/quotes/${quoteId}/accept`;
    return jsonFetch<StatusMessage>(url, {
      method: 'POST',
      body: '{}',
    });
  };
}

export function useDeclineQuote() {
  return async (quoteId: number): Promise<StatusMessage> =>
    jsonFetch<StatusMessage>(`${API_V1}/quotes/${quoteId}/decline`, {
      method: 'POST',
      body: '{}',
    });
}
