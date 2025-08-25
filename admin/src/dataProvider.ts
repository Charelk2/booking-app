import simpleRest from 'ra-data-simple-rest';
import { fetchUtils } from 'react-admin';

const inferApiUrl = () => {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env;
  const host = window.location.hostname;
  if (host.endsWith('booka.co.za')) return 'https://api.booka.co.za/admin';
  return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};

const API_URL = inferApiUrl();

// Inject JWT + JSON headers; map HTTP errors for RA
const httpClient: typeof fetchUtils.fetchJson = (url, options = {}) => {
  const token = localStorage.getItem('booka_admin_token');
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const baseProvider = simpleRest(API_URL, httpClient);

// Extend with a couple of custom actions
export const dataProvider = {
  ...baseProvider,

  // Listings moderation actions
  approveListing: async (id: string) => {
    const { json } = await httpClient(`${API_URL}/listings/${id}/approve`, { method: 'POST' });
    return json;
  },
  rejectListing: async (id: string, reason?: string) => {
    const { json } = await httpClient(`${API_URL}/listings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return json;
  },

  // Payout batch creation
  createPayoutBatch: async (payload: { bookingIds: string[] }) => {
    const { json } = await httpClient(`${API_URL}/payout_batches`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return json;
  },

  // Booking lifecycle actions
  markCompleted: async (bookingId: string) => {
    const { json } = await httpClient(`${API_URL}/bookings/${bookingId}/complete`, { method: 'POST' });
    return json;
  },
  refundBooking: async (bookingId: string, amountCents: number) => {
    const { json } = await httpClient(`${API_URL}/bookings/${bookingId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount: amountCents }),
    });
    return json;
  },
};

export type ExtendedDataProvider = typeof dataProvider;
