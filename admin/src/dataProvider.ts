import simpleRest from 'ra-data-simple-rest';
import { fetchUtils } from 'react-admin';
import { getAdminToken, inferAdminApiUrl } from './env';

const API_URL = inferAdminApiUrl();

// Inject JWT + JSON headers; map HTTP errors for RA
const httpClient: typeof fetchUtils.fetchJson = (url, options = {}) => {
  const token = getAdminToken();
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
  httpClient, // expose for custom routes that call dp.httpClient

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
  bulkApproveListings: async (ids: Array<string | number>) => {
    const { json } = await httpClient(`${API_URL}/listings/bulk_approve`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return json;
  },
  bulkRejectListings: async (ids: Array<string | number>, reason?: string) => {
    const { json } = await httpClient(`${API_URL}/listings/bulk_reject`, {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    });
    return json;
  },
  getListingModerationLogs: async (id: string | number) => {
    const { json } = await httpClient(`${API_URL}/listings/${id}/moderation_logs`, { method: 'GET' });
    return json as Array<{ id: string; action: string; reason?: string | null; at: string; admin_id: string }>;
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

  // Disputes workflow actions
  assignDispute: async (id: string | number) => {
    const { json } = await httpClient(`${API_URL}/disputes/${id}/assign`, { method: 'POST', body: JSON.stringify({}) });
    return json;
  },
  requestDisputeInfo: async (id: string | number, note: string) => {
    const { json } = await httpClient(`${API_URL}/disputes/${id}/request_info`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
    return json;
  },
  resolveDispute: async (id: string | number, payload: { outcome: string; note?: string }) => {
    const { json } = await httpClient(`${API_URL}/disputes/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  // Clients management
  activateClient: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/clients/${userId}/activate`, { method: 'POST' });
    return json;
  },
  deactivateClient: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/clients/${userId}/deactivate`, { method: 'POST' });
    return json;
  },
  impersonateClient: async (userId: string) => {
    const { json } = await httpClient(`${API_URL}/clients/${userId}/impersonate`, { method: 'POST' });
    return json as { token: string; user: { id: string; email: string } };
  },
  searchUserByEmail: async (email: string) => {
    const { json } = await httpClient(`${API_URL}/users/search?email=${encodeURIComponent(email)}`, { method: 'GET' });
    return json as { exists: boolean; user?: { id: string; email: string; is_active: boolean; is_verified: boolean; user_type?: string } };
  },
  purgeUser: async (userId: string, confirm: string, force?: boolean) => {
    const { json } = await httpClient(`${API_URL}/users/${userId}/purge`, {
      method: 'POST',
      body: JSON.stringify({ confirm, force: !!force }),
    });
    return json;
  },

  // Override getList: custom logic for 'listings' and graceful 404 fallback for 'clients'
  getList: async (resource: string, params: any) => {
    if (resource === 'clients') {
      try {
        return await (baseProvider as any).getList(resource, params);
      } catch (e: any) {
        if (e && (e.status === 404 || e.httpStatus === 404)) {
          console.warn('clients endpoint not found on API; returning empty list');
          return { data: [], total: 0 };
        }
        throw e;
      }
    }

    const res = await (baseProvider as any).getList(resource, params);
    if (resource !== 'listings') return res;

    // Normalize provider_id in results (backend is the source of truth; no client-side filtering)
    const raw: any[] = Array.isArray(res?.data) ? res.data : [];
    const records: any[] = raw.map((r) => (dataProvider as any)._normalizeListing(r));
    return { ...res, data: records };
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
