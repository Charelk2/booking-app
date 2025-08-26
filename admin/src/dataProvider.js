import simpleRest from 'ra-data-simple-rest';
import { fetchUtils } from 'react-admin';
const inferApiUrl = () => {
    const env = import.meta.env.VITE_API_URL;
    if (env)
        return env;
    const host = window.location.hostname;
    if (host.endsWith('booka.co.za'))
        return 'https://api.booka.co.za/admin';
    return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};
const API_URL = inferApiUrl();
// Inject JWT + JSON headers; map HTTP errors for RA
const httpClient = (url, options = {}) => {
    const token = localStorage.getItem('booka_admin_token');
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
    }
    if (token)
        headers.set('Authorization', `Bearer ${token}`);
    return fetchUtils.fetchJson(url, { ...options, headers });
};
const baseProvider = simpleRest(API_URL, httpClient);
// Extend with a couple of custom actions
export const dataProvider = {
    ...baseProvider,
    API_URL,
    // Helper to normalize provider_id on listing records coming from various backends
    _normalizeListing(record) {
        if (!record || typeof record !== 'object')
            return record;
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
    approveListing: async (id) => {
        const { json } = await httpClient(`${API_URL}/listings/${id}/approve`, { method: 'POST' });
        return json;
    },
    rejectListing: async (id, reason) => {
        const { json } = await httpClient(`${API_URL}/listings/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        });
        return json;
    },
    // Payout batch creation
    createPayoutBatch: async (payload) => {
        const { json } = await httpClient(`${API_URL}/payout_batches`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return json;
    },
    // Booking lifecycle actions
    markCompleted: async (bookingId) => {
        const { json } = await httpClient(`${API_URL}/bookings/${bookingId}/complete`, { method: 'POST' });
        return json;
    },
    refundBooking: async (bookingId, amountCents) => {
        const { json } = await httpClient(`${API_URL}/bookings/${bookingId}/refund`, {
            method: 'POST',
            body: JSON.stringify({ amount: amountCents }),
        });
        return json;
    },
    // Providers management
    deactivateProvider: async (userId) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/deactivate`, { method: 'POST' });
        return json;
    },
    activateProvider: async (userId) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/activate`, { method: 'POST' });
        return json;
    },
    messageProvider: async (userId, content) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/message`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
        return json;
    },
    getProviderThread: async (userId) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/thread`, { method: 'GET' });
        return json;
    },
    unlistProvider: async (userId) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/unlist`, { method: 'POST' });
        return json;
    },
    purgeProvider: async (userId, confirm, force) => {
        const { json } = await httpClient(`${API_URL}/providers/${userId}/purge`, {
            method: 'POST',
            body: JSON.stringify({ confirm, force: !!force }),
        });
        return json;
    },
    getConversation: async (threadId) => {
        const { json } = await httpClient(`${API_URL}/conversations/${threadId}`, { method: 'GET' });
        return json;
    },
    replyConversation: async (threadId, content) => {
        const { json } = await httpClient(`${API_URL}/conversations/${threadId}/message`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
        return json;
    },
    // Override getList to normalize listings and hide purged/deactivated providers
    getList: async (resource, params) => {
        const res = await baseProvider.getList(resource, params);
        if (resource !== 'listings')
            return res;
        try {
            // Normalize provider_id in results
            const raw = Array.isArray(res?.data) ? res.data : [];
            const records = raw.map((r) => dataProvider._normalizeListing(r));
            // Source of truth: whatever appears on the Providers page
            const providersList = await baseProvider.getList('providers', {
                pagination: { page: 1, perPage: 10000 },
                sort: { field: 'id', order: 'ASC' },
                filter: {},
            });
            const allowed = new Set((providersList?.data || []).map((p) => String(p.id)));
            if (allowed.size === 0)
                return { ...res, data: [], total: 0 };
            const filtered = records.filter((r) => {
                const pid = r?.provider_id;
                if (!pid)
                    return false;
                return allowed.has(String(pid));
            });
            return { ...res, data: filtered, total: filtered.length };
        }
        catch {
            return res;
        }
    },
    // Override getOne for listings to normalize provider_id so detail views work
    getOne: async (resource, params) => {
        const res = await baseProvider.getOne(resource, params);
        if (resource !== 'listings')
            return res;
        const rec = res?.data;
        return { ...res, data: dataProvider._normalizeListing(rec) };
    },
};
