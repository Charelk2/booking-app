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
  API_URL,

  // Helper to normalize provider_id on listing records coming from various backends
  _normalizeListing(record: any) {
    if (!record || typeof record !== 'object') return record;
    // Try a wide set of keys and nested objects
    const nestedProviderId = (record.provider && (record.provider.id || record.provider.provider_id || record.provider.user_id))
      || (record.owner && (record.owner.id || record.owner.provider_id));
    const pid = nestedProviderId
      ?? record.provider_id
      ?? record.providerId
      ?? record.user_id
      ?? record.userId
      ?? record.service_provider_id
      ?? record.serviceProviderId
      ?? record.owner_id
      ?? record.ownerId;
    if (pid && record.provider_id !== pid) {
      return { ...record, provider_id: pid };
    }
    return record;
  },

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

  // Providers management
  deactivateProvider: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/deactivate`, { method: 'POST' });
    return json;
  },
  activateProvider: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/activate`, { method: 'POST' });
    return json;
  },
  messageProvider: async (userId: string, content: string) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return json;
  },
  getProviderThread: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/thread`, { method: 'GET' });
    return json as { booking_request_id: string; messages: Array<{ id: string; sender_id: string|null; sender_type: string; content: string; created_at: string }>; };
  },
  unlistProvider: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/unlist`, { method: 'POST' });
    return json;
  },
  purgeProvider: async (userId: string, confirm: string, force?: boolean) => {
    const { json } = await httpClient(`${API_URL}/providers/${userId}/purge`, {
      method: 'POST',
      body: JSON.stringify({ confirm, force: !!force }),
    });
    return json;
  },
  getConversation: async (threadId: string) => {
    const { json } = await httpClient(`${API_URL}/conversations/${threadId}`, { method: 'GET' });
    return json as { id: string; messages: Array<{ id: string; sender_id: string|null; sender_type: string; content: string; created_at: string }>; };
  },
  replyConversation: async (threadId: string, content: string) => {
    const { json } = await httpClient(`${API_URL}/conversations/${threadId}/message`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return json;
  },

  // Override getList to normalize listings and hide purged/deactivated providers
  getList: async (resource: string, params: any) => {
    const res = await (baseProvider as any).getList(resource, params);
    if (resource !== 'listings') return res;

    try {
      // Normalize provider_id in results
      const raw: any[] = Array.isArray(res?.data) ? res.data : [];
      const records: any[] = raw.map((r) => (dataProvider as any)._normalizeListing(r));

      // Source of truth: whatever appears on the Providers page
      const providersList = await (baseProvider as any).getList('providers', {
        pagination: { page: 1, perPage: 10000 },
        sort: { field: 'id', order: 'ASC' },
        filter: {},
      });
      const allowed = new Set<string>((providersList?.data || []).map((p: any) => String(p.id)));
      if (allowed.size === 0) return { ...res, data: [], total: 0 };

      const filtered = records.filter((r) => {
        const pid = r?.provider_id;
        if (!pid) return false;
        return allowed.has(String(pid));
      });
      return { ...res, data: filtered, total: filtered.length };
    } catch {
      return res;
    }
  },

  // Override getOne for listings to normalize provider_id so detail views work
  getOne: async (resource: string, params: any) => {
    const res = await (baseProvider as any).getOne(resource, params);
    if (resource !== 'listings') return res;
    const rec = (res as any)?.data;
    return { ...(res as any), data: (dataProvider as any)._normalizeListing(rec) } as any;
  },
};

export type ExtendedDataProvider = typeof dataProvider;
