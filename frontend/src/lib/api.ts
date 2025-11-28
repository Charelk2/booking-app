// frontend/src/lib/api.ts

import axios, { AxiosProgressEvent, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { ensureFreshAccess } from '@/lib/refreshCoordinator';
import { setTransportErrorMeta, runWithTransport, noteTransportOnline, noteTransportOffline } from '@/lib/transportState';
import logger from './logger';
import { format } from 'date-fns';
import { extractErrorMessage, normalizeQuoteTemplate } from './utils';
import { decodeMsgpack } from './msgpackDecode';
import {
  User,
  ServiceProviderProfile,
  Service,
  Booking,
  EventPrep,
  EventPrepPayload,
  Review,
  BookingRequestCreate,
  BookingRequest,
  QuoteV2Create,
  QuoteV2,
  BookingSimple,
  Message,
  MessageCreate,
  AttachmentMeta,
  QuoteCalculationResponse,
  QuoteTemplate,
  Notification,
  ThreadNotification,
  ThreadPreview,
  ParsedBookingDetails,
  ServiceCategory,
  BookingAgentState,
} from '@/types';

export const getApiOrigin = () =>
  (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '') ||
  // Use same-origin relative API in SSR to avoid cross-origin cookies on Vercel edge/Node
  (typeof window === 'undefined' ? '' : 'https://api.booka.co.za');

// Internal/backend origin for server-side calls (SSR). Falls back to public API if not set.
const SERVER_API_ORIGIN =
  (process.env.SERVER_API_ORIGIN || '').replace(/\/+$/, '') ||
  (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '') ||
  'https://api.booka.co.za';

// Public constants/helpers so all callers can build absolute API URLs
export const API_ORIGIN = getApiOrigin();
export const apiUrl = (path: string) => {
  if (!path) return API_ORIGIN;
  // If already absolute, return as-is
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
};

// ─── Device Cookie (did) — avoid preflights by not using custom headers ───────
function _randId(): string {
  // 128-bit random id, base36 for compactness
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    let hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    // base36 from hex chunk
    const part1 = parseInt(hex.slice(0, 13), 16).toString(36);
    const part2 = parseInt(hex.slice(13, 26), 16).toString(36);
    const part3 = parseInt(hex.slice(26), 16).toString(36);
    return `${part1}${part2}${part3}`.slice(0, 26);
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}

function _readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

function _setCookie(name: string, value: string, maxAgeSec: number) {
  try {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host && /(^|\.)booka\.co\.za$/i.test(host)) parts.push('Domain=.booka.co.za');
    document.cookie = parts.join('; ');
  } catch {}
}

function ensureDeviceCookie() {
  if (typeof window === 'undefined') return;
  try {
    let did = _readCookie('did');
    if (!did) {
      // try localStorage for continuity
      did = localStorage.getItem('booka.trusted_device_id') || '';
    }
    if (!did) did = _randId();
    // Persist both cookie and localStorage copy
    _setCookie('did', did, 31536000); // 1 year
    try { localStorage.setItem('booka.trusted_device_id', did); } catch {}
  } catch {}
}

function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let did = _readCookie('did');
    if (!did) {
      try {
        did = window.localStorage.getItem('booka.trusted_device_id') || '';
      } catch {
        did = '';
      }
    }
    return did || null;
  } catch {
    return null;
  }
}

try { if (typeof window !== 'undefined') ensureDeviceCookie(); } catch {}

// Create a single axios instance for all requests.
// On the server, prefer the internal origin (empty baseURL) to avoid extra network/TLS hops.
// On the client, use the public API origin.
const api = axios.create({
  baseURL: typeof window === 'undefined' ? SERVER_API_ORIGIN : API_ORIGIN,
  withCredentials: true,
  headers: {
    // Do not force a global Content-Type. Let axios infer JSON for plain objects
    // and let the browser set multipart boundaries for FormData uploads.
  },
});

// One-shot after-write flag: when true, the next preview/threads/unread GETs
// will include X-After-Write: 1 to force a fresh compute (skip premature 304).
let _afterWriteBudget = 0; // number of subsequent GETs to tag
export function noteAfterWrite(count: number = 2) {
  try {
    _afterWriteBudget = Math.max(_afterWriteBudget, Math.max(1, Math.floor(count)));
  } catch { _afterWriteBudget = 1; }
}
function _maybeAfterWriteHeaders(extra?: Record<string, string> | undefined) {
  const headers: Record<string, string> = { ...(extra || {}) };
  try {
    if (_afterWriteBudget > 0) {
      headers['X-After-Write'] = '1';
      _afterWriteBudget = Math.max(0, _afterWriteBudget - 1);
    }
  } catch {}
  return headers;
}

const STATIC_API_ORIGIN = getApiOrigin();
const withApiOrigin = (path: string) => {
  if (!path || /^https?:/i.test(path)) return path;
  // In SSR, use relative paths so Next.js rewrites proxy to the backend and cookies flow correctly
  return path;
};

// Allow sending/receiving HttpOnly cookies

// Automatically attach the bearer token (if present) to every request
// Disable per-instance pinning entirely. Keep variables for backward compatibility,
// but do not use or set them. Also clear any stored pins on startup.
let preferredMachineId: string | null = null;
let preferredMachineIdTs: number | null = null; // epoch ms
const DISABLE_INSTANCE_PIN = true;
try {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem('fly.preferred_instance');
      window.sessionStorage.removeItem('fly.preferred_instance_ts');
    } catch {}
  }
} catch {}

const rememberMachineFromResponse = (headers?: Record<string, unknown>) => {
  try {
    if (DISABLE_INSTANCE_PIN) {
      // Purge any server-provided machine hints
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('fly.preferred_instance');
          window.sessionStorage.removeItem('fly.preferred_instance_ts');
        }
      } catch {}
      return;
    }
    if (!headers) return;
  } catch {}
};

api.interceptors.request.use(
  (config) => {
    // Ensure uploads work: when sending FormData, remove any Content-Type so the
    // browser can set the proper multipart boundary header.
    try {
      const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
      if (isFormData && config.headers) {
        // Remove any preset content type that could break multipart parsing
        delete (config.headers as any)['Content-Type'];
      }
    } catch {}
    if (process.env.NODE_ENV === 'development') {
      // Keep logs useful but quiet in dev
      // eslint-disable-next-line no-console
      console.debug('API request', {
        method: config.method,
        url: config.url,
        params: config.params,
        data: config.data,
      });
    }
    // Cookie-only: do not attach Authorization headers from JS
    if (config.headers && 'Authorization' in config.headers) {
      delete config.headers.Authorization;
    }
    // Do NOT attach any custom device headers (preflight killer): device id lives in a cookie ('did')
    // Do not attach per-instance preference headers
    if (config.headers) {
      try { delete (config.headers as any)['Fly-Prefer-Instance']; } catch {}
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Provide consistent error messages across the app
let isRefreshing = false;
let pendingQueue: Array<() => void> = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Allow strong typing of our ad-hoc retry flags while keeping standard config fields
type RetryableRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _retryCount?: number;
  _skipRefresh?: boolean;
  _unpinnedRetry?: boolean;
};

api.interceptors.response.use(
  (response) => {
    rememberMachineFromResponse(response?.headers as any);
    try { noteTransportOnline('success'); } catch {}
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      // Silently ignore AbortController cancellations (quick thread switches)
      if ((error as any).code === 'ERR_CANCELED') {
        return Promise.reject(error);
      }
      rememberMachineFromResponse(error.response?.headers as any);
      const originalRequest = (error.config || {}) as RetryableRequest;
      const req = originalRequest as any; // permissive accessor for url/method/headers
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      let message = extractErrorMessage(detail);
      const originalMessage = error.message;

      // On transient upstream errors, ensure we are not pinned and retry once immediately.
      const method = (req?.method || 'get').toLowerCase();
      const transient = status === 502 || status === 503 || status === 504 || (error.code === 'ECONNABORTED');
      const canUnpinRetry = transient && !((originalRequest as any)?._unpinnedRetry);
      if (canUnpinRetry) {
        try {
          if (req?.headers) delete (req.headers as any)['Fly-Prefer-Instance'];
          (originalRequest as any)._unpinnedRetry = true;
          // Clear stored pin so subsequent requests won't reuse a dead machine
          preferredMachineId = null;
          preferredMachineIdTs = null;
          try {
            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem('fly.preferred_instance');
              window.sessionStorage.removeItem('fly.preferred_instance_ts');
            }
          } catch {}
        } catch {}
        return api(originalRequest!);
      }

      // Lightweight retry for idempotent requests on transient upstream errors
      const isIdempotent = method === 'get' || method === 'head' || method === 'options';
      const retryCount = originalRequest?._retryCount || 0;
      if (isIdempotent && transient && retryCount < 2) {
        const backoff = Math.min(1500, 200 * 2 ** retryCount) + Math.floor(Math.random() * 150);
        originalRequest._retryCount = retryCount + 1;
        return sleep(backoff).then(() => api(originalRequest!));
      }

      // Attempt silent refresh once on 401, then retry original request
      const rawUrl = typeof req?.url === 'string' ? req.url : '';
      let normalizedPath = rawUrl;
      try {
        if (/^https?:\/\//i.test(rawUrl)) {
          normalizedPath = new URL(rawUrl).pathname || rawUrl;
        }
      } catch {}
      if (normalizedPath && !normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
      }
      const isAuthEndpoint = normalizedPath.startsWith('/auth/');
      const detailText = Array.isArray(detail)
        ? detail.map((d: any) => extractErrorMessage(d) ?? '').join(' ')
        : extractErrorMessage(detail) ?? '';
      const shouldSkipRefresh =
        isAuthEndpoint ||
        originalRequest?._skipRefresh ||
        ['Missing refresh token', 'Incorrect email or password', 'Session expired'].some(
          (msg) => detailText.includes(msg),
        );

      if (status === 401 && originalRequest && !originalRequest._retry && !shouldSkipRefresh) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            pendingQueue.push(() => resolve(api(originalRequest)));
          });
        }
        originalRequest._retry = true;
        isRefreshing = true;
        return ensureFreshAccess()
          .then(() => {
            // Access cookie is updated by server; proceed to retry
            pendingQueue.forEach((cb) => cb());
            pendingQueue = [];
            return api(originalRequest);
          })
          .catch((refreshErr) => {
            // Refresh failed. If we're offline, treat this as transient and
            // defer refresh until connectivity returns, avoiding a forced logout.
            // When back online, a queued refresh will run once.
            pendingQueue = [];
            const offline = typeof window !== 'undefined' ? window.navigator.onLine === false : false;
            if (offline) {
              try {
                runWithTransport('auth.refresh.deferred', async () => {
                  await ensureFreshAccess();
                }, { initialDelayMs: 0, jitterMs: 150, maxAttempts: 1, immediateOnReconnect: true });
              } catch {}
              return Promise.reject(refreshErr);
            }
            const statusRefresh = (refreshErr as any)?.status as number | undefined;
            const detailRefresh = String((refreshErr as any)?.detail || '');
            const hardExpire =
              typeof statusRefresh === 'number' &&
              statusRefresh === 401 &&
              ['session expired', 'missing refresh token', 'invalid or expired token'].some((msg) =>
                detailRefresh.toLowerCase().includes(msg),
              );
            if (hardExpire) {
              try {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('user');
                  sessionStorage.removeItem('user');
                  window.dispatchEvent(new Event('app:session-expired'));
                }
              } catch {}
            }
            return Promise.reject(refreshErr);
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      if (status) {
        const map: Record<number, string> = {
          400: 'Bad request. Please verify your input.',
          401: 'Authentication required. Please log in.',
          403: 'You do not have permission to perform this action.',
          404: 'Resource not found.',
          422: 'Validation failed. Please check your input.',
          500: 'Server error. Please try again later.',
        };
        if (status in map && !(status === 422 && message !== 'An unexpected error occurred.')) {
          message = map[status];
        } else if (message === 'An unexpected error occurred.') {
          message = map[status] || message;
        }
      } else {
        message = 'Network error. Please check your connection.';
      }

      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('API error', {
          status,
          url: req?.url,
          detail,
        });
      }

      try {
        if (originalMessage && message && originalMessage !== message) {
          (error as any).__originalMessage = originalMessage;
        }
        error.message = message;
      } catch {}

      const offline = typeof window !== 'undefined' ? window.navigator.onLine === false : false;
      const code = error.code;
      const networkCodes = new Set([
        'ECONNABORTED',
        'ERR_NETWORK',
        'ERR_NETWORK_CHANGED',
        'ERR_NETWORK_IO_SUSPENDED',
        'ERR_INTERNET_DISCONNECTED',
        'ERR_NAME_NOT_RESOLVED',
        'ERR_CONNECTION_RESET',
        'ERR_CONNECTION_REFUSED',
        'ENETDOWN',
        'ENETUNREACH',
        'ETIMEDOUT',
      ]);

      const normalizedMessage = (message || '').toLowerCase();
      const isNetworkError =
        (!status && offline) ||
        (typeof code === 'string' && networkCodes.has(code)) ||
        normalizedMessage.includes('network error') ||
        normalizedMessage.includes('failed to fetch');

      let isTransient = isNetworkError;
      if (status) {
        if (status === 408 || status === 425 || status === 429) isTransient = true;
        if (status >= 500) isTransient = true;
      }
      if (code === 'ECONNABORTED') isTransient = true;

      setTransportErrorMeta(error, {
        isNetworkError,
        isOffline: offline || code === 'ERR_NETWORK_IO_SUSPENDED',
        isTransient,
        status,
        code: typeof code === 'string' ? code : null,
      });

      if (offline || (isNetworkError && !status)) {
        try { noteTransportOffline('network'); } catch {}
      }

      return Promise.reject(error);
    }

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Unexpected API error', error);
    }
    return Promise.reject(
      error instanceof Error ? error : new Error('An unexpected error occurred.'),
    );
  },
);

// ─── AUTH (no /api/v1 prefix) ───────────────────────────────────────────────────

export const register = (data: Partial<User>) =>
  api.post('/auth/register', data);

export const login = (email: string, password: string) => {
  const params = new URLSearchParams();
  params.append('username', email);
  params.append('password', password);

  return api.post('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

export const verifyMfa = (
  token: string,
  code: string,
  trustedDevice?: boolean,
  deviceId?: string,
) => api.post('/auth/verify-mfa', { token, code, trustedDevice, deviceId });

export const setupMfa = () => api.post('/auth/setup-mfa');
export const confirmMfa = (code: string) =>
  api.post('/auth/confirm-mfa', { code });
export const generateRecoveryCodes = () => api.post('/auth/recovery-codes');
export const disableMfa = (code: string) =>
  api.post('/auth/disable-mfa', { code });

export const confirmEmail = (token: string) =>
  api.post('/auth/confirm-email', { token });

type RequestConfig = AxiosRequestConfig & { _skipRefresh?: boolean };

export const getCurrentUser = (config?: RequestConfig) => api.get<User>('/auth/me', config);

export const logout = () => api.post('/auth/logout');

export const forgotPassword = (email: string) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password });

// Upgrade client → service provider
export const becomeServiceProvider = (payload: {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  dob?: string;
}) => api.post('/api/v1/users/me/become-service-provider', payload);

// Magic link
export const requestMagicLink = (email: string, next?: string) =>
  api.post('/auth/magic-link/request', { email, next });
export const consumeMagicLink = (token: string) =>
  api.post('/auth/magic-link/consume', { token });

// Email-first helper: check if an email already has an account and which
// providers are available for sign-in (password, google, apple), plus lock state.
export const getEmailStatus = (email: string) =>
  api.get('/auth/email-status', { params: { email } });

// WebAuthn (Passkeys)
export const webauthnGetRegistrationOptions = () => api.get('/auth/webauthn/registration/options');
export const webauthnVerifyRegistration = (payload: unknown) => api.post('/auth/webauthn/registration/verify', payload);
export const webauthnGetAuthenticationOptions = () => api.get('/auth/webauthn/authentication/options');
export const webauthnVerifyAuthentication = (payload: unknown) => api.post('/auth/webauthn/authentication/verify', payload);

// ─── All other resources live under /api/v1 ────────────────────────────────────

const API_V1 = '/api/v1';

// Helper to ensure API responses always include `user_id` and `id`
const normalizeServiceProviderProfile = (
  profile: Partial<ServiceProviderProfile> | ServiceProviderProfile
): ServiceProviderProfile => {
  // Ensure 'id' is always a number. Assuming 'profile.id' or 'profile.user_id' can serve as it.
  const id = (profile.id ?? profile.user_id) as number; // Use user_id as fallback for id
  const user_id = (profile.user_id ?? profile.id) as number; // Ensure user_id is number

  return {
    ...profile,
    id: id, // Explicitly set id to ensure it's number
    user_id: user_id, // Explicitly set user_id
    service_categories: (profile.service_categories as string[] | undefined) || [],
    service_price:
      profile.service_price != null
        ? parseFloat(profile.service_price as unknown as string)
        : undefined,
  } as ServiceProviderProfile; // Cast to ServiceProviderProfile to satisfy the return type, if confident
};

// ─── ARTISTS ───────────────────────────────────────────────────────────────────

export interface PriceBucket {
  min: number;
  max: number;
  count: number;
}

export interface GetServiceProvidersResponse {
  data: ServiceProviderProfile[];
  total: number;
  price_distribution: PriceBucket[];
}

export const getServiceProviders = async (params?: {
  category?: string;
  location?: string;
  when?: string | Date;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  artist?: string;
  includePriceDistribution?: boolean;
  fields?: string[];
}): Promise<GetServiceProvidersResponse> => {
  const { includePriceDistribution, ...rest } = params || {};
  const query = { ...rest } as Record<string, unknown>;
  if (query.when instanceof Date) {
    query.when = format(query.when, 'yyyy-MM-dd');
  }
  if (includePriceDistribution) {
    query.include_price_distribution = true;
  }
  if (Array.isArray((params as any)?.fields) && (params as any).fields!.length > 0) {
    (query as any).fields = (params as any).fields!.join(',');
  }

  const res = await api.get<GetServiceProvidersResponse>(`${API_V1}/service-provider-profiles/`, {
    params: query,
  });
  return {
    ...res.data,
    data: res.data.data.map(normalizeServiceProviderProfile),
  };
};

// ─── SERVICE PROVIDERS LIST CACHE + PREFETCH ───────────────────────────────────
type ProvidersKey = string;
interface ProvidersCacheEntry {
  value: GetServiceProvidersResponse;
  timestamp: number;
}
const PROVIDERS_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const providersCache = new Map<ProvidersKey, ProvidersCacheEntry>();

const providersKey = (params: Record<string, unknown>): ProvidersKey => {
  // Only keys that affect list rendering
  const { category, location, when, sort, minPrice, maxPrice, page = 1, limit = 20, fields } = params as any;
  const k = { category, location, when, sort, minPrice, maxPrice, page, limit, fields };
  return JSON.stringify(k);
};

export const getCachedServiceProviders = (params: Parameters<typeof getServiceProviders>[0] = {}): GetServiceProvidersResponse | null => {
  const key = providersKey(params || {});
  const now = Date.now();
  const entry = providersCache.get(key);
  if (entry && now - entry.timestamp < PROVIDERS_CACHE_TTL_MS) {
    return entry.value;
  }
  return null;
};

export const prefetchServiceProviders = async (params: Parameters<typeof getServiceProviders>[0] = {}): Promise<void> => {
  const key = providersKey(params || {});
  try {
    const res = await getServiceProviders(params);
    providersCache.set(key, { value: res, timestamp: Date.now() });
  } catch {
    // Best-effort
  }
};

export const getServiceProvider = async (slugOrId: number | string) => {
  const isStringSlug = typeof slugOrId === 'string' && !/^\d+$/.test(slugOrId);
  const slugPath = `${API_V1}/service-provider-profiles/by-slug/${encodeURIComponent(String(slugOrId))}`;
  const idPath = withApiOrigin(`${API_V1}/service-provider-profiles/${Number(slugOrId)}`);

  // Try slug first when it looks like one; fall back to id on 404 or slug failure.
  const tryPaths = isStringSlug ? [slugPath, idPath] : [idPath];
  let lastErr: any = null;
  for (const path of tryPaths) {
    try {
      const res = await api.get<ServiceProviderProfile>(path);
      return { ...res, data: normalizeServiceProviderProfile(res.data) };
    } catch (err: any) {
      lastErr = err;
      // If slug lookup 404s, fall back; otherwise rethrow
      const status = err?.response?.status;
      if (!(status === 404 && path === slugPath)) {
        throw err;
      }
    }
  }
  throw lastErr;
};

export const getServiceProviderAvailability = (serviceProviderId: number) =>
  api.get<{ unavailable_dates: string[] }>(`${API_V1}/service-provider-profiles/${serviceProviderId}/availability`);

export const getServiceProviderProfileMe = async () => {
  const res = await api.get<ServiceProviderProfile>(`${API_V1}/service-provider-profiles/me`);
  return { ...res, data: normalizeServiceProviderProfile(res.data) };
};

export const updateMyServiceProviderProfile = (data: Partial<ServiceProviderProfile>) =>
  api.put(`${API_V1}/service-provider-profiles/me`, data);

// ─── SEARCH ANALYTICS & SUGGESTIONS ────────────────────────────────────────────

export type SearchEventPayload = {
  search_id: string;
  source: string;
  category_value?: string;
  location?: string;
  when?: string | null;
  results_count?: number;
  session_id?: string | null;
  meta?: Record<string, unknown>;
};

export const logSearchEvent = async (payload: SearchEventPayload): Promise<void> => {
  try {
    const sessionId = payload.session_id ?? getDeviceId();
    await api.post(
      `${API_V1}/search-events`,
      {
        ...payload,
        session_id: sessionId ?? undefined,
      },
      { timeout: 3000 },
    );
  } catch {
    // Best-effort only; never surface to UX
  }
};

export type SearchClickPayload = {
  search_id: string;
  artist_id: number;
  rank?: number | null;
};

export const logSearchClick = async (payload: SearchClickPayload): Promise<void> => {
  try {
    await api.post(`${API_V1}/search-events/click`, payload, { timeout: 3000 });
  } catch {
    // Best-effort only
  }
};

export interface PopularLocationSuggestion {
  name: string;
  count: number;
}

export const getPopularLocationSuggestions = async (limit = 6): Promise<PopularLocationSuggestion[]> => {
  try {
    const res = await api.get<PopularLocationSuggestion[]>(`${API_V1}/search/suggestions/locations`, {
      params: { limit },
      timeout: 3000,
    });
    return res.data || [];
  } catch {
    return [];
  }
};

// ─── AI PROVIDER SEARCH ──────────────────────────────────────────────────────

export type AiProvider = {
  artist_id: number;
  slug: string;
  name: string;
  location: string;
  categories?: string[];
  rating?: number;
  review_count?: number;
  starting_price?: number;
  client_total_preview?: number | null;
  profile_url: string;
  avatar_url?: string;
  relevance_score?: number | null;
};

export type AiProviderFilters = {
  category?: string | null;
  location?: string | null;
  when?: string | null; // 'YYYY-MM-DD'
  min_price?: number | null;
  max_price?: number | null;
};

export type AiProviderSearchResponse = {
  providers: AiProvider[];
  filters: AiProviderFilters;
  explanation: string;
  source?: string;
};

export type AiProviderSearchRequest = {
  query: string;
  category?: string | null;
  location?: string | null;
  when?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  limit?: number;
};

export const searchProvidersWithAi = async (
  payload: AiProviderSearchRequest
): Promise<AiProviderSearchResponse> => {
  try {
    const res = await api.post<AiProviderSearchResponse>(`${API_V1}/ai/providers/search`, payload);
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 503 && detail === 'ai_search_disabled') {
      // Allow callers to gracefully hide AI UI when disabled.
      throw Object.assign(new Error('AI search disabled'), {
        code: 'ai_search_disabled',
      });
    }
    if (detail === 'ai_search_error') {
      throw Object.assign(new Error('AI search error'), {
        code: 'ai_search_error',
      });
    }
    throw err;
  }
};

export type AiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiAssistantRequest = {
  messages: AiChatMessage[];
  category?: string | null;
  location?: string | null;
  when?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  limit?: number;
};

export type AiAssistantResponse = {
  messages: AiChatMessage[];
  providers: AiProvider[];
  filters: AiProviderFilters;
  source?: string;
};

export const sendAiAssistant = async (
  payload: AiAssistantRequest
): Promise<AiAssistantResponse> => {
  try {
    const res = await api.post<AiAssistantResponse>(`${API_V1}/ai/assistant`, payload);
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 503 && detail === 'ai_search_disabled') {
      throw Object.assign(new Error('AI search disabled'), {
        code: 'ai_search_disabled',
      });
    }
    if (detail === 'ai_search_error') {
      throw Object.assign(new Error('AI search error'), {
        code: 'ai_search_error',
      });
    }
    throw err;
  }
};

// ─── AI BOOKING AGENT ────────────────────────────────────────────────────────

export type BookingAgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type BookingAgentStateApi = BookingAgentState;

export type BookingAgentAction = {
  type: 'booking_created';
  booking_request_id: number;
  url: string;
};

export type BookingAgentRequest = {
  messages: BookingAgentMessage[];
  state?: BookingAgentStateApi | null;
};

export type BookingAgentResponse = {
  messages: BookingAgentMessage[];
  state: BookingAgentStateApi;
  providers: AiProvider[];
  actions: BookingAgentAction[];
};

export const callBookingAgent = async (
  payload: BookingAgentRequest
): Promise<BookingAgentResponse> => {
  try {
    const res = await api.post<BookingAgentResponse>(`${API_V1}/ai/booking-agent`, payload);
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 401) {
      throw Object.assign(new Error('AI agent requires login'), {
        code: 'ai_agent_unauthenticated',
      });
    }
    if (status === 503 && detail === 'ai_search_disabled') {
      throw Object.assign(new Error('AI agent disabled'), {
        code: 'ai_agent_disabled',
      });
    }
    if (detail === 'ai_agent_error') {
      throw Object.assign(new Error('AI agent error'), {
        code: 'ai_agent_error',
      });
    }
    throw err;
  }
};

export interface SearchHistoryItem {
  category_value?: string | null;
  location?: string | null;
  when?: string | null;
  created_at: string;
}

export const getSearchHistory = async (limit = 10): Promise<SearchHistoryItem[]> => {
  try {
    const res = await api.get<SearchHistoryItem[]>(`${API_V1}/search/history`, {
      params: { limit },
      timeout: 3000,
    });
    return res.data || [];
  } catch {
    // 401 or network error → treat as no server history; caller can fall back to local
    return [];
  }
};

export const uploadMyServiceProviderProfilePicture = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ServiceProviderProfile>(
    `${API_V1}/service-provider-profiles/me/profile-picture`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export const uploadMyServiceProviderCoverPhoto = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ServiceProviderProfile>(
    `${API_V1}/service-provider-profiles/me/cover-photo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export const uploadMyProfilePicture = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<User>(`${API_V1}/users/me/profile-picture`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadMyServiceProviderPortfolioImages = (files: File[]) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return api.post<ServiceProviderProfile>(
    `${API_V1}/service-provider-profiles/me/portfolio-images`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export const updateMyServiceProviderPortfolioImageOrder = (urls: string[]) =>
  api.put<ServiceProviderProfile>(`${API_V1}/service-provider-profiles/me/portfolio-images`, {
    portfolio_image_urls: urls,
  });

// Client billing snapshots for invoices
export const setClientBillingByBooking = (bookingId: number, payload: Record<string, any>) =>
  api.post(`${API_V1}/invoices/booking/${bookingId}/client-billing`, payload);

export const setClientBillingByBookingRequest = (bookingRequestId: number, payload: Record<string, any>) =>
  api.post(`${API_V1}/invoices/booking-request/${bookingRequestId}/client-billing`, payload);

// Presign direct R2 avatar upload for current user (Option A)
export const presignMyAvatar = (args: { filename?: string; content_type?: string }) =>
  api.post<{
    key: string;
    put_url: string | null;
    get_url: string | null;
    public_url: string | null;
    headers: Record<string, string>;
    upload_expires_in: number;
    download_expires_in: number;
  }>(`${API_V1}/service-provider-profiles/me/avatar/presign`, args);

// Presign cover photo upload
export const presignMyCoverPhoto = (args: { filename?: string; content_type?: string }) =>
  api.post<{
    key: string;
    put_url: string | null;
    public_url: string | null;
    headers: Record<string, string>;
    upload_expires_in: number;
  }>(`${API_V1}/service-provider-profiles/me/cover-photo/presign`, args);

// Presign a single portfolio image upload
export const presignMyPortfolioImage = (args: { filename?: string; content_type?: string }) =>
  api.post<{
    key: string;
    put_url: string | null;
    public_url: string | null;
    headers: Record<string, string>;
    upload_expires_in: number;
  }>(`${API_V1}/service-provider-profiles/me/portfolio-images/presign`, args);

// Presign service media upload for Add Service wizard
export const presignServiceMedia = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<{
    key: string;
    put_url: string | null;
    public_url: string | null;
    headers: Record<string, string>;
    upload_expires_in: number;
  }>(`${API_V1}/services/media/presign`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
};

// Generic image upload used by service wizard to avoid base64 payloads
export const uploadImage = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<{ url: string }>(`${API_V1}/uploads/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ─── SERVICES ──────────────────────────────────────────────────────────────────

// “services by service provider” is GET /api/v1/services/artist/{artist_user_id}
export const getServiceProviderServices = (serviceProviderUserId: number | string) => {
  const id = Number(serviceProviderUserId);
  return api.get<Service[]>(withApiOrigin(`${API_V1}/services/artist/${id}`));
};

export const getAllServices = () =>
  api.get<Service[]>(`${API_V1}/services/`);

export const getService = (serviceId: number) =>
  api.get<Service>(`${API_V1}/services/${serviceId}`);

// create / update / delete a service: POST /api/v1/services, PUT /api/v1/services/{id}, DELETE /api/v1/services/{id}
export const createService = (data: Partial<Service>) =>
  api.post(`${API_V1}/services/`, data);

export const updateService = (id: number, data: Partial<Service>) =>
  api.put(`${API_V1}/services/${id}`, data);

export const deleteService = (id: number) =>
  api.delete(`${API_V1}/services/${id}`);

// List my services (includes unapproved for dashboard visibility)
export const getMyServices = () =>
  api.get<Service[]>(`${API_V1}/services/mine`);

// ─── BOOKINGS ──────────────────────────────────────────────────────────────────

// create booking: POST /api/v1/bookings
export const createBooking = (data: Partial<Booking>) =>
  api.post(`${API_V1}/bookings`, data);

// client’s bookings: GET /api/v1/bookings/my-bookings
export const getMyClientBookings = (params: { status?: string } = {}) =>
  getDeduped<Booking[]>(`${API_V1}/bookings/my-bookings`, params);

// artist’s bookings: GET /api/v1/bookings/artist-bookings
export const getMyArtistBookings = () =>
  getDeduped<Booking[]>(`${API_V1}/bookings/artist-bookings`);

// read a single booking: GET /api/v1/bookings/{bookingId}
export const getBookingDetails = (bookingId: number) =>
  getDeduped<Booking>(`${API_V1}/bookings/${bookingId}`);

// update status: PATCH /api/v1/bookings/{booking_id}/status
export const updateBookingStatus = (id: number, status: Booking['status']) =>
  api.patch<Booking>(`${API_V1}/bookings/${id}/status`, { status });

// download a confirmed booking's ICS file
export const downloadBookingIcs = (id: number) =>
  api.get<Blob>(`${API_V1}/bookings/${id}/calendar.ics`, {
    responseType: 'blob',
  });

export const downloadQuotePdf = (id: number) =>
  api.get<Blob>(`${API_V1}/quotes/${id}/pdf`, {
    responseType: 'blob',
  });

// Resolve a booking id for a given booking request (QuoteV2)
export const getBookingIdForRequest = (bookingRequestId: number) =>
  getDeduped<{ booking_id: number | null }>(`${API_V1}/booking-requests/${bookingRequestId}/booking-id`);

// ─── REVIEWS ───────────────────────────────────────────────────────────────────

// create review for a booking: POST /api/v1/reviews/bookings/{booking_id}/reviews
export const createReviewForBooking = (
  bookingId: number,
  data: Partial<Omit<Review, 'booking_id' | 'id'>>
) =>
  api.post(
    `${API_V1}/reviews/bookings/${bookingId}/reviews`,
    data
  );

// read a single review by booking id: GET /api/v1/reviews/{booking_id}
export const getReview = (bookingId: number) =>
  api.get<Review>(`${API_V1}/reviews/${bookingId}`);

// list reviews for a service: GET /api/v1/services/{service_id}/reviews
export const getServiceReviews = (serviceId: number) =>
  api.get<Review[]>(`${API_V1}/services/${serviceId}/reviews`);

// list reviews for a service provider: GET /api/v1/reviews/service-provider-profiles/{service_provider_id}/reviews
export const getServiceProviderReviews = (serviceProviderUserId: number) =>
  api.get<Review[]>(withApiOrigin(`${API_V1}/reviews/service-provider-profiles/${serviceProviderUserId}/reviews`));

// ─── BOOKING REQUESTS & QUOTES ─────────────────────────────────────────────────

// Create a new booking request (client → artist):
//    POST /api/v1/booking-requests/
// Body must match BookingRequestCreate interface.
export const createBookingRequest = (data: BookingRequestCreate) =>
  api.post<BookingRequest>(`${API_V1}/booking-requests/`, data);

// Optionally, if you want to get a list of booking requests (e.g., for a client dashboard):
export const getMyBookingRequests = (params?: { lite?: boolean }) =>
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/client`, { params });

// If the artist needs to fetch requests addressed to them:
export const getBookingRequestsForArtist = () =>
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/artist`);

export const getDashboardStats = () =>
  api.get<{
    monthly_new_inquiries: number;
    profile_views: number;
    response_rate: number;
  }>(`${API_V1}/booking-requests/stats`);

// ─── DASHBOARD CACHED FETCH HELPERS (ETag + sessionStorage) ────────────────
type CacheEntry<T> = { ts: number; etag?: string | null; data: T };
const DASH_CACHE_KEYS = {
  clientBookings: 'dash:client:bookings:v1',
  clientRequests: 'dash:client:requests:v1',
  artistBookings: 'dash:artist:bookings:v1',
  artistRequests: 'dash:artist:requests:v1',
  artistStats: 'dash:artist:stats:v1',
};

const canUseSessionStorage = typeof window !== 'undefined' && (() => {
  try { return typeof window.sessionStorage !== 'undefined'; } catch { return false; }
})();

// In-memory fallback cache when sessionStorage is unavailable (SSR or restricted environments).
const memoryCache = new Map<string, CacheEntry<any>>();
// In-flight dedupe to avoid duplicate network hits for the same key.
const inflightCache = new Map<string, Promise<any>>();

function readCacheEntry<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  if (canUseSessionStorage) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw) as CacheEntry<T>;
      if (!obj || typeof obj.ts !== 'number') return null;
      if (Date.now() - obj.ts > ttlMs) return null;
      if (!obj.data) return null;
      return obj;
    } catch {
      return null;
    }
  }
  const mem = memoryCache.get(key);
  if (!mem) return null;
  if (Date.now() - mem.ts > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return mem as CacheEntry<T>;
}
function writeCacheEntry<T>(key: string, entry: CacheEntry<T>): void {
  if (canUseSessionStorage) {
    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
      return;
    } catch {
      // fall through to memory cache
    }
  }
  memoryCache.set(key, entry);
}
const etagFrom = (res: any): string | undefined =>
  (res?.headers?.etag as string) || (res?.headers?.ETag as string) || undefined;

async function getWithCache<T>(
  key: string,
  request: (etag?: string) => Promise<any>,
  ttlMs = 60_000,
): Promise<T> {
  const cached = readCacheEntry<T>(key, ttlMs);
  const etag = cached?.etag || undefined;
  const existing = inflightCache.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      const res = await request(etag);
      if (res?.status === 304 && cached) return cached.data;
      if (res?.status === 304 && !cached) {
        // Fallback: re-fetch without ETag if we somehow got a 304 and have no body cached
        const res2 = await request(undefined);
        const data2 = res2?.data as T;
        const newEtag2 = etagFrom(res2) || etagFrom(res) || undefined;
        writeCacheEntry<T>(key, { ts: Date.now(), etag: newEtag2 ?? null, data: data2 });
        return data2;
      }
      const data = res?.data as T;
      const newEtag = etagFrom(res) || etag;
      writeCacheEntry<T>(key, { ts: Date.now(), etag: newEtag ?? null, data });
      return data;
    } catch (err) {
      if (cached) return cached.data;
      throw err;
    } finally {
      inflightCache.delete(key);
    }
  })();

  inflightCache.set(key, p);
  return p;
}

// Client dashboard: bookings + requests (lite)
export const getMyClientBookingsCached = (ttlMs = 60_000, limit = 10) =>
  getWithCache<Booking[]>(
    DASH_CACHE_KEYS.clientBookings,
    (etag?: string) =>
      api.get<Booking[]>(`${API_V1}/bookings/my-bookings`, {
        params: { limit },
        headers: etag ? { 'If-None-Match': etag } : undefined,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      }),
    ttlMs,
  );

export const getMyBookingRequestsCached = (ttlMs = 60_000, limit = 10) =>
  getWithCache<BookingRequest[]>(
    DASH_CACHE_KEYS.clientRequests,
    (etag?: string) =>
      api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/client`, {
        params: { lite: true, limit },
        headers: etag ? { 'If-None-Match': etag } : undefined,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      }),
    ttlMs,
  );

export const peekClientDashboardCache = () => {
  return {
    bookings: readCacheEntry<Booking[]>(DASH_CACHE_KEYS.clientBookings, 24 * 60 * 60 * 1000)?.data ?? null,
    requests: readCacheEntry<BookingRequest[]>(DASH_CACHE_KEYS.clientRequests, 24 * 60 * 60 * 1000)?.data ?? null,
  };
};

// Artist dashboard: bookings, requests, stats
export const getMyArtistBookingsCached = (ttlMs = 60_000) =>
  getWithCache<Booking[]>(
    DASH_CACHE_KEYS.artistBookings,
    (etag?: string) =>
      api.get<Booking[]>(`${API_V1}/bookings/artist-bookings`, {
        headers: etag ? { 'If-None-Match': etag } : undefined,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      }),
    ttlMs,
  );

export const getBookingRequestsForArtistCached = (ttlMs = 60_000) =>
  getWithCache<BookingRequest[]>(
    DASH_CACHE_KEYS.artistRequests,
    (etag?: string) =>
      api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/artist`, {
        headers: etag ? { 'If-None-Match': etag } : undefined,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      }),
    ttlMs,
  );

export const getDashboardStatsCached = (ttlMs = 60_000) =>
  getWithCache<{ monthly_new_inquiries: number; profile_views: number; response_rate: number }>(
    DASH_CACHE_KEYS.artistStats,
    (etag?: string) =>
      api.get(`${API_V1}/booking-requests/stats`, {
        headers: etag ? { 'If-None-Match': etag } : undefined,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      }),
    ttlMs,
  );

export const peekArtistDashboardCache = () => {
  const ttl = 24 * 60 * 60 * 1000;
  return {
    bookings: readCacheEntry<Booking[]>(DASH_CACHE_KEYS.artistBookings, ttl)?.data ?? null,
    requests: readCacheEntry<BookingRequest[]>(DASH_CACHE_KEYS.artistRequests, ttl)?.data ?? null,
    stats: readCacheEntry<{ monthly_new_inquiries: number; profile_views: number; response_rate: number }>(
      DASH_CACHE_KEYS.artistStats,
      ttl,
    )?.data ?? null,
  };
};

// If you want to fetch a single booking request by ID:
export const getBookingRequestById = (id: number, etag?: string) =>
  api.get<BookingRequest>(`${API_V1}/booking-requests/${id}` , {
    headers: etag ? { 'If-None-Match': etag } : undefined,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
  });

// Single-flight + TTL cache for booking requests (to avoid repeated 200s)
type BrCacheEntry = { ts: number; etag?: string | null; data: BookingRequest };
const brInflight = new Map<number, Promise<BookingRequest>>();

export async function getBookingRequestCached(id: number, ttlMs = 60_000): Promise<BookingRequest> {
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id');
  const sKey = `br:etag:${id}`;
  const cKey = `br:cache:${id}`;
  // TTL memory via sessionStorage (persists across tabs for the session lifetime)
  try {
    const raw = sessionStorage.getItem(cKey);
    if (raw) {
      const obj = JSON.parse(raw) as BrCacheEntry;
      if (obj && typeof obj.ts === 'number' && Date.now() - obj.ts < ttlMs && obj.data) {
        return obj.data;
      }
    }
  } catch {}
  const existing = brInflight.get(id);
  if (existing) return existing;
  const p = (async () => {
    let etag: string | null = null;
    try { etag = sessionStorage.getItem(sKey); } catch {}
    const res = await getBookingRequestById(id, etag || undefined);
    const status = Number((res as any)?.status ?? 200);
    if (status === 304) {
      // Use cached body on 304
      try {
        const raw = sessionStorage.getItem(cKey);
        if (raw) {
          const obj = JSON.parse(raw) as BrCacheEntry;
          if (obj?.data) return obj.data;
        }
      } catch {}
      // No cache: fall back to a fresh GET without ETag
      const res2 = await getBookingRequestById(id, undefined);
      const body2 = res2.data as BookingRequest;
      try {
        const newTag = (res2 as any)?.headers?.etag || (res2 as any)?.headers?.ETag;
        if (newTag) sessionStorage.setItem(sKey, String(newTag));
        sessionStorage.setItem(cKey, JSON.stringify({ ts: Date.now(), etag: newTag || null, data: body2 }));
      } catch {}
      return body2;
    }
    const body = res.data as BookingRequest;
    try {
      const newTag = (res as any)?.headers?.etag || (res as any)?.headers?.ETag;
      if (newTag) sessionStorage.setItem(sKey, String(newTag));
      sessionStorage.setItem(cKey, JSON.stringify({ ts: Date.now(), etag: newTag || null, data: body }));
    } catch {}
    return body;
  })()
    .finally(() => { brInflight.delete(id); });
  brInflight.set(id, p);
  return p;
}

// Update an existing booking request as the client
export const updateBookingRequest = (
  id: number,
  data: Partial<BookingRequestCreate> & { status?: string }
) => api.put<BookingRequest>(`${API_V1}/booking-requests/${id}/client`, data);

// Update a booking request as the artist (e.g., decline)
export const updateBookingRequestArtist = (
  id: number,
  data: { status?: string }
) => api.put<BookingRequest>(`${API_V1}/booking-requests/${id}/artist`, data);

// Create a new quote (artist → client) for an existing booking request:
//    POST /api/v1/quotes/
export const createQuoteForRequest = async (
  requestId: number,
  data: {
    service_provider_id: number;
    artist_id?: number;
    quote_details: string;
    price: number;
    currency?: string;
    valid_until?: string | null;
  }
  // returns AxiosResponse<QuoteV2>
) => {
  const br = await getBookingRequestById(requestId);
  const clientId = (br.data as any)?.client_id ?? 0;
  return createQuoteV2({
    booking_request_id: requestId,
    service_provider_id: data.service_provider_id,
    artist_id: data.artist_id,
    client_id: clientId,
    services: [{ description: data.quote_details, price: data.price }],
    sound_fee: 0,
    travel_fee: 0,
    accommodation: null,
    discount: null,
    expires_at: data.valid_until ?? null,
  });
};

// Optionally, fetch all quotes for a given booking request:
export const getQuotesForBookingRequest = (bookingRequestId: number) =>
  getDeduped<QuoteV2[]>(`${API_V1}/booking-requests/${bookingRequestId}/quotes-v2`);

export const createQuoteV2 = (data: QuoteV2Create) =>
  api.post<QuoteV2>(`${API_V1}/quotes`, data);

export const getQuoteV2 = (quoteId: number) =>
  getDeduped<QuoteV2>(`${API_V1}/quotes/${quoteId}`);

export const acceptQuoteV2 = (quoteId: number, serviceId?: number) => {
  const url = serviceId
    ? `${API_V1}/quotes/${quoteId}/accept?service_id=${serviceId}`
    : `${API_V1}/quotes/${quoteId}/accept`;
  return api.post<BookingSimple>(url, {});
};

export const declineQuoteV2 = (quoteId: number) =>
  api.post<QuoteV2>(`${API_V1}/quotes/${quoteId}/decline`, {});

export const withdrawQuoteV2 = (id: number) =>
  api.post<QuoteV2>(`${API_V1}/quotes/${id}/withdraw`, {});

export const getMyArtistQuotes = (params: { skip?: number; limit?: number } = {}) =>
  api.get<QuoteV2[]>(`${API_V1}/quotes/v2/me/artist`, { params });

export const getMyClientQuotes = (
  params: { skip?: number; limit?: number; status?: string } = {},
) => api.get<QuoteV2[]>(`${API_V1}/quotes/v2/me/client`, { params });

// ─── MESSAGES ───────────────────────────────────────────────────────────
export interface MessageListResponseEnvelope {
  mode: 'full' | 'lite' | 'delta';
  items: Message[];
  has_more: boolean;
  next_cursor: string | null;
  delta_cursor: string | null;
  requested_after_id: number | null;
  requested_since: string | null;
  total_latency_ms: number;
  db_latency_ms: number;
  payload_bytes: number;
  /** Optional lightweight quote summaries keyed by quote_id */
  quotes?: Record<number, QuoteV2> | Record<number, any>;
}

export interface MessageListParams {
  limit?: number;
  /**
   * Cursor for incremental fetches. Matches backend `after_id` query param.
   * Keep the deprecated `after` alias around briefly so older callers still work.
   */
  after_id?: number;
  /** @deprecated use `after_id` */
  after?: number;
  /**
   * Cursor for loading older history. Matches backend `before_id` query param.
   */
  before_id?: number;
  since?: string;
  skip?: number;
  fields?: string;
  mode?: 'full' | 'lite' | 'delta';
  // Optional: comma-separated ids the client already has, so server can omit them
  known_quote_ids?: string | number[];
  include_quotes?: boolean;
}

export const getMessagesForBookingRequest = (
  bookingRequestId: number,
  params: MessageListParams = {},
  opts?: { signal?: AbortSignal }
) => {
  const qp: Record<string, unknown> = { ...params };
  const afterCandidate = params.after_id ?? params.after;
  if (afterCandidate != null) {
    const parsed = typeof afterCandidate === 'number' ? afterCandidate : Number(afterCandidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      qp.after_id = parsed;
    }
  }
  delete qp.after;
  const beforeCandidate = params.before_id as number | undefined;
  if (beforeCandidate != null) {
    const parsed = typeof beforeCandidate === 'number' ? beforeCandidate : Number(beforeCandidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      qp.before_id = parsed;
    }
  }
  if (!('mode' in qp) || qp.mode == null) {
    qp.mode = 'full';
  }
  // Do not include quotes by default; quote details are fetched on-demand when needed.
  // Normalize known_quote_ids param (array → csv string)
  if (Array.isArray(params.known_quote_ids)) {
    (qp as any).known_quote_ids = (params.known_quote_ids as number[])
      .filter((n) => Number.isFinite(n) && n > 0)
      .join(',');
  }
  const url = `${API_V1}/booking-requests/${bookingRequestId}/messages`;
  if (opts && opts.signal) {
    // When an AbortSignal is provided, bypass global dedupe so this request can be aborted.
    return api.get<MessageListResponseEnvelope>(url, { params: qp as any, signal: opts.signal, headers: _maybeAfterWriteHeaders(undefined) });
  }
  return getDeduped<MessageListResponseEnvelope>(url, qp as any, _maybeAfterWriteHeaders(undefined));
};

// Batch messages by thread ids (breadth-first warmup)
export interface MessagesBatchEnvelope {
  mode: 'full' | 'lite' | 'delta';
  threads: Record<number, Message[]>;
  payload_bytes: number;
  quotes?: Record<number, QuoteV2> | Record<number, any>;
}

export const getMessagesBatch = (
  ids: number[],
  per = 20,
  mode: 'lite' | 'full' = 'lite',
  etag?: string,
) =>
  getDeduped<MessagesBatchEnvelope>(
    `${API_V1}/booking-requests/messages-batch`,
    { ids: ids.join(','), per, mode },
    _maybeAfterWriteHeaders(etag ? { 'If-None-Match': etag } : undefined),
    (s) => (s >= 200 && s < 300) || s === 304,
  );

// Preview totals for wizard Review step (backend-only math)
export const getQuoteTotalsPreview = async (
  params: { subtotal?: number | null; total?: number | null; currency?: string | null },
) => {
  const url = `${API_V1}/quotes/preview`;
  const payload: any = {};
  if (typeof params.subtotal === 'number' && Number.isFinite(params.subtotal)) payload.subtotal = params.subtotal;
  if (typeof params.total === 'number' && Number.isFinite(params.total)) payload.total = params.total;
  if (typeof params.currency === 'string' && params.currency.trim()) payload.currency = params.currency.trim();
  const res = await api.post<{ provider_subtotal?: number; platform_fee_ex_vat?: number; platform_fee_vat?: number; client_total_incl_vat?: number }>(url, payload);
  return res.data;
};

export const postMessageToBookingRequest = (
  bookingRequestId: number,
  data: MessageCreate,
  opts?: { idempotencyKey?: string; clientRequestId?: string }
) => {
  const headers: Record<string, string> = {};
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts?.clientRequestId) headers['X-Client-Request-Id'] = opts.clientRequestId;
  const config = Object.keys(headers).length ? { headers } : undefined;
  const p = api.post<Message>(
    `${API_V1}/booking-requests/${bookingRequestId}/messages`,
    data,
    config,
  );
  try { noteAfterWrite(2); } catch {}
  return p;
};

// Attempt to delete a message. If the backend doesn't support it, callers should handle errors gracefully.
export const deleteMessageForBookingRequest = (
  bookingRequestId: number,
  messageId: number,
) => api.delete(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}`);

export const markMessagesRead = (bookingRequestId: number) =>
  (function(){ const p = api.put<{ updated: number }>(
    `${API_V1}/booking-requests/${bookingRequestId}/messages/read`
  ); try { noteAfterWrite(2); } catch {} return p; })();

export const uploadMessageAttachment = async (
  bookingRequestId: number,
  file: File,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
  signal?: AbortSignal,
) => {
  if (!file || file.size === 0) {
    return Promise.reject(new Error('Attachment file is required'));
  }
  // Direct-to-R2 path; if presign fails, fallback to backend form upload below
  // 1) Try presigned R2 upload
  try {
    const kind = file.type.startsWith('audio/')
      ? 'voice'
      : file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('image/')
      ? 'image'
      : 'file';

    const presign = await api.post<{
      key: string;
      put_url: string;
      get_url?: string;
      public_url?: string;
      headers?: Record<string, string>;
      upload_expires_in: number;
      download_expires_in: number;
    }>(`${API_V1}/booking-requests/${bookingRequestId}/attachments/presign`, {
      kind,
      filename: file.name || undefined,
      content_type: file.type || undefined,
      size: Number.isFinite(file.size) ? file.size : undefined,
    });

    const { put_url, public_url, get_url, headers } = presign.data || {};
    if (!put_url) throw new Error('Failed to prepare upload');

    // 2) Upload direct to R2 with signed headers
    let signedHeaders = headers && Object.keys(headers).length > 0
      ? headers
      : (file.type ? { 'Content-Type': file.type } : {});
    // For audio, avoid Content-Type if not explicitly signed (iOS Safari quirk)
    if ((!headers || Object.keys(headers).length === 0) && typeof file.type === 'string' && file.type.startsWith('audio/')) {
      signedHeaders = {};
    }
    await axios.put(put_url, file, {
      headers: signedHeaders,
      withCredentials: false,
      onUploadProgress,
      signal,
    });

    const url = (public_url || get_url || '').toString();
    if (!url) throw new Error('Upload completed but no URL was returned');
    const metadata: AttachmentMeta = {
      original_filename: file.name || null,
      content_type: file.type || null,
      size: Number.isFinite(file.size) ? file.size : null,
    };
    return { data: { url, metadata } } as { data: { url: string; metadata?: AttachmentMeta } };
  } catch (e: any) {
    // 2b) Fallback for local/dev: upload via backend form endpoint
    // This path is useful when R2 is not configured and the API returns 500 on presign.
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ url: string; metadata?: AttachmentMeta }>(
      `${API_V1}/booking-requests/${bookingRequestId}/attachments`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
        signal,
      },
    );
    // API returns a relative URL (e.g., /static/attachments/..). Keep as-is; backend serves it.
    return { data: { url: res.data.url, metadata: res.data.metadata } } as { data: { url: string; metadata?: AttachmentMeta } };
  }
};

// New: Init → Finalize attachment message flow
export const initAttachmentMessage = (
  bookingRequestId: number,
  body: { kind?: string; filename?: string; content_type?: string; size?: number },
) => api.post<{ message: Message; presign: { key: string; put_url?: string; get_url?: string; public_url?: string; headers?: Record<string, string>; upload_expires_in?: number; download_expires_in?: number } }>(
  `${API_V1}/booking-requests/${bookingRequestId}/messages/attachments/init`,
  body,
);

export const finalizeAttachmentMessage = (
  bookingRequestId: number,
  messageId: number,
  url: string,
  metadata?: AttachmentMeta,
) => (function(){ const p = api.post<Message>(
  `${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}/attachments/finalize`,
  { url, metadata },
); try { noteAfterWrite(2); } catch {} return p; })();

// Delivered signal (ephemeral): flips sender bubbles to 'delivered'
export const putDeliveredUpTo = (
  bookingRequestId: number,
  upToId: number,
) => (function(){ const p = api.put<{ ok: boolean }>(
  `${API_V1}/booking-requests/${bookingRequestId}/messages/delivered`,
  { up_to_id: upToId },
); try { noteAfterWrite(1); } catch {} return p; })();

export const addMessageReaction = (
  bookingRequestId: number,
  messageId: number,
  emoji: string,
) => (function(){ const p = api.post(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}/reactions`, { emoji }); try { noteAfterWrite(1); } catch {} return p; })();

export const removeMessageReaction = (
  bookingRequestId: number,
  messageId: number,
  emoji: string,
) => (function(){ const p = api.delete(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}/reactions`, { data: { emoji } }); try { noteAfterWrite(1); } catch {} return p; })();

export const uploadBookingAttachment = (
  formData: FormData,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
) =>
  api.post<{ url: string }>(
    `${API_V1}/booking-requests/attachments`,
    formData,
    { onUploadProgress, headers: { 'Content-Type': undefined } }
  );

export const getParsedBooking = (taskId: string) =>
  api.get<ParsedBookingDetails>(`${API_V1}/booking-requests/parse/${taskId}`);

/**
 * Parse free-form booking text using the NLP service and wait for the result.
 *
 * The backend enqueues the parsing task and returns a `task_id`. This helper
 * handles the follow-up request to retrieve the parsed details so callers can
 * simply await a single promise for the structured data.
 */
export const parseBookingText = async (text: string) => {
  const res = await api.post<ParsedBookingDetails | { task_id: string }>(
    `${API_V1}/booking-requests/parse`,
    { text },
  );
  const payload: any = res.data;
  // If the backend returned parsed details directly, use them.
  if (payload && (payload.event_type || payload.date || payload.location || payload.guests !== undefined)) {
    return { data: payload as ParsedBookingDetails };
  }
  // Fallback to legacy task polling if present (should not normally happen now).
  if (payload && (payload as any).task_id) {
    return getParsedBooking((payload as any).task_id);
  }
  // No usable data
  return { data: {} as ParsedBookingDetails };
};

// ─── QUOTE TEMPLATES ─────────────────────────────────────────────────────────
export const getQuoteTemplates = async (artistId: number) => {
  const res = await api.get<QuoteTemplate[]>(
    `${API_V1}/quote-templates/artist/${artistId}`,
  );
  return { ...res, data: res.data.map(normalizeQuoteTemplate) };
};

export const createQuoteTemplate = async (data: Partial<QuoteTemplate>) => {
  const res = await api.post<QuoteTemplate>(`${API_V1}/quote-templates`, data);
  return { ...res, data: normalizeQuoteTemplate(res.data) };
};

export const updateQuoteTemplate = (
  id: number,
  data: Partial<QuoteTemplate>,
) =>
  api
    .put<QuoteTemplate>(`${API_V1}/quote-templates/${id}`, data)
    .then((res) => ({ ...res, data: normalizeQuoteTemplate(res.data) }));

export const deleteQuoteTemplate = (id: number) =>
  api.delete(`${API_V1}/quote-templates/${id}`);

// ─── QUOTE CALCULATOR ─────────────────────────────────────────────────────────
export const calculateQuoteBreakdown = (data: {
  base_fee: number;
  distance_km: number;
  service_id: number;
  event_city: string;
  accommodation_cost?: number;
}) => api.post<QuoteCalculationResponse>(`${API_V1}/quotes/estimate`, data);


// ─── SERVICE CATEGORIES ───────────────────────────────────────────────────────
export const getServiceCategories = () =>
  api.get<ServiceCategory[]>(`${API_V1}/service-categories/`);

// ─── QUOTE CALCULATOR ───────────────────────────────────────────────────────
// Cache quote calculation responses to avoid duplicate network requests during review.
// Entries expire after a TTL and the cache evicts the least recently used
// item when the maximum size is exceeded. Use `clearQuoteCache` to manually
// reset the cache (e.g., between tests or on logout).

interface QuoteCacheEntry {
  value: QuoteCalculationResponse;
  timestamp: number;
}

const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUOTE_CACHE_MAX_ENTRIES = 50;
const quoteCache = new Map<string, QuoteCacheEntry>();

export const clearQuoteCache = () => quoteCache.clear();

export const calculateQuote = async (params: {
  base_fee: number;
  distance_km: number;
  service_id: number;
  event_city: string;
  accommodation_cost?: number;
  // New optional sound-context inputs for better sizing/pricing
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
}): Promise<QuoteCalculationResponse> => {
  const cacheKey = JSON.stringify(params);
  const now = Date.now();
  const cached = quoteCache.get(cacheKey);

  if (cached && now - cached.timestamp < QUOTE_CACHE_TTL_MS) {
    // Refresh LRU order by re-inserting the entry.
    quoteCache.delete(cacheKey);
    quoteCache.set(cacheKey, { value: cached.value, timestamp: now });
    return cached.value;
  }

  const res = await api.post<QuoteCalculationResponse>(
    `${API_V1}/quotes/estimate`,
    params,
  );

  quoteCache.set(cacheKey, { value: res.data, timestamp: now });

  // Enforce max cache size with LRU eviction.
  if (quoteCache.size > QUOTE_CACHE_MAX_ENTRIES) {
    const oldestKey = quoteCache.keys().next().value as string | undefined;
    if (oldestKey) {
      quoteCache.delete(oldestKey);
    }
  }

  return res.data;
};

// ─── SOUND SERVICE ESTIMATE (audience packages + add-ons) ─────────────────────
export const calculateSoundServiceEstimate = (serviceId: number, payload: {
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
}) => api.post(`${API_V1}/services/${serviceId}/sound-estimate`, payload);

// ─── PAYMENTS ───────────────────────────────────────────────────────────────
export const createPayment =  (data: {
  booking_request_id: number;
  full?: boolean;
  inline?: boolean;
}) => api.post(`${API_V1}/payments`, data);

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
// Notifications endpoints live under /api/v1

// ─── SOUND OUTREACH ─────────────────────────────────────────────────────────
export const kickoffSoundOutreach = (
  bookingId: number,
  data: { event_city: string; request_timeout_hours?: number; mode?: 'sequential' | 'simultaneous'; selected_service_id?: number }
) => api.post(`${API_V1}/bookings/${bookingId}/sound/outreach`, data);

export const supplierRespondToOutreach = (
  bookingId: number,
  serviceId: number,
  data: { action: 'ACCEPT' | 'DECLINE'; price?: number; lock_token: string }
) => api.post(`${API_V1}/bookings/${bookingId}/service/${serviceId}/respond`, data);

export const getSoundOutreach = (bookingId: number) =>
  api.get<{
    id: number;
    supplier_service_id: number;
    supplier_public_name: string | null;
    status: string;
    expires_at: string | null;
    responded_at: string | null;
  }[]>(`${API_V1}/bookings/${bookingId}/sound/outreach`);

export const retrySoundOutreach = (
  bookingId: number,
  data?: { event_city?: string }
) => api.post(`${API_V1}/bookings/${bookingId}/sound/retry`, data || {});
const API_NOTIFICATIONS = API_V1;

export const getNotifications = (skip = 0, limit = 20, config?: AxiosRequestConfig) =>
  api.get<Notification[]>(
    `${API_NOTIFICATIONS}/notifications`,
    { params: { skip, limit }, ...(config || {}) },
  );
// Cached notifications to avoid duplicate fetches on mount
const NOTIF_CACHE_KEY = 'dash:notifs:v1';
export const getNotificationsCached = (skip = 0, limit = 20, ttlMs = 30_000) =>
  getWithCache<Notification[]>(
    NOTIF_CACHE_KEY,
    (etag?: string) =>
      api.get<Notification[]>(
        `${API_NOTIFICATIONS}/notifications`,
        {
          params: { skip, limit },
          headers: etag ? { 'If-None-Match': etag } : undefined,
          validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
        },
      ),
    ttlMs,
  );

export const markNotificationRead = (id: number) =>
  api.put<Notification>(`${API_NOTIFICATIONS}/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.put(`${API_NOTIFICATIONS}/notifications/read-all`);

export const deleteNotification = (id: number) =>
  api.delete(`${API_NOTIFICATIONS}/notifications/${id}`);

export const getMessageThreads = () =>
  api.get<ThreadNotification[]>(
    `${API_NOTIFICATIONS}/notifications/message-threads`,
  );

export const markThreadRead = (bookingRequestId: number) =>
  api.put(
    `${API_NOTIFICATIONS}/notifications/message-threads/${bookingRequestId}/read`,
  );

export const markThreadMessagesRead = (bookingRequestId: number) => (function(){
  const p = api.put(`${API_V1}/booking-requests/${bookingRequestId}/messages/read`);
  try { noteAfterWrite(2); } catch {}
  return p;
})();

// ─── INBOX UNREAD (aggregate) ───────────────────────────────────────────────
export const getInboxUnread = (config?: AxiosRequestConfig) => {
  const baseHeaders = (config && (config as any).headers) || undefined;
  const headers = _maybeAfterWriteHeaders(baseHeaders as any);
  return api.get<{ total?: number; count?: number }>(
    `${API_V1}/inbox/unread`,
    {
      validateStatus: (s) => s === 200 || s === 304,
      params: { _: Date.now() },
      ...(config || {}),
      headers,
    },
  );
};

// ─── MESSAGE THREADS PREVIEW (atomic previews + unread counts) ─────────────
export interface ThreadPreviewResponse {
  items: ThreadPreview[];
  next_cursor: string | null;
}

export const getMessageThreadsPreview = (
  role?: 'artist' | 'client',
  limit = 50,
  etag?: string,
) =>
  api.get<ThreadPreviewResponse>(
    `${API_V1}/message-threads/preview`,
    {
      params: { role, limit },
      headers: withMsgpackAccept(_maybeAfterWriteHeaders(etag ? { 'If-None-Match': etag } : undefined)),
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      ...(ENABLE_MSGPACK_THREADS ? { responseType: 'arraybuffer' as const } : {}),
    }
  ).then((res) => decodeMaybeMsgpack<ThreadPreviewResponse>(res));

export const ensureBookaThread = () =>
  api.post<{ booking_request_id: number | null }>(
    `${API_V1}/message-threads/ensure-booka-thread`,
    {}
  );

// ─── UNIFIED THREADS INDEX (server-composed) ────────────────────────────────
export interface ThreadsIndexItem {
  thread_id: number;
  booking_request_id: number;
  state: string;
  counterparty_name: string;
  counterparty_avatar_url?: string | null;
  last_message_snippet: string;
  last_message_at: string;
  unread_count: number;
  meta?: Record<string, any> | null;
}
export interface ThreadsIndexResponse {
  items: ThreadsIndexItem[];
  next_cursor?: string | null;
}
export const getThreadsIndex = (
  role?: 'artist' | 'client',
  limit = 50,
  etag?: string,
) =>
  getDedupedMaybeMsgpack<ThreadsIndexResponse>(
    `${API_V1}/threads`,
    { role, limit },
    withMsgpackAccept(_maybeAfterWriteHeaders(etag ? { 'If-None-Match': etag } : undefined)),
    (s) => (s >= 200 && s < 300) || s === 304,
  );

// ─── INBOX UNREAD TOTAL (tiny endpoint with optional ETag) ────────────────
// (removed duplicate getInboxUnread; use the axios-based variant above)

// ─── LIGHTWEIGHT SINGLE-FLIGHT FOR COMMON GETs ─────────────────────────────
const inflight = new Map<string, Promise<any>>();
const keyFor = (url: string, params?: Record<string, any>) => {
  const p = params ? Object.entries(params).sort(([a],[b]) => a.localeCompare(b)) : [];
  return `${url}?${p.map(([k,v]) => `${k}=${String(v)}`).join('&')}`;
};
function getDeduped<T>(url: string, params?: Record<string, any>, headers?: Record<string, string>, validateStatus?: (s: number) => boolean) {
  const key = keyFor(url, params);
  const existing = inflight.get(key);
  if (existing) return existing as Promise<{ data: T }>;
  const prom = api.get<T>(url, { params, headers, validateStatus }).finally(() => {
    // small delay to coalesce fast duplicates
    setTimeout(() => inflight.delete(key), 100);
  });
  inflight.set(key, prom as unknown as Promise<any>);
  return prom as Promise<{ data: T }>;
}

// ─── MessagePack (optional) helpers for inbox preview/index ───────────────
const ENABLE_MSGPACK_THREADS = (process.env.NEXT_PUBLIC_ENABLE_MSGPACK_THREADS ?? '1') !== '0';
const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : new (require('util').TextDecoder)('utf-8');
const toUint8 = (data: any): Uint8Array | null => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
};
const decodeMaybeMsgpack = <T,>(res: any): any => {
  if (!ENABLE_MSGPACK_THREADS) return res;
  if (!res || res.status === 304) return res;
  const ctype = String(res?.headers?.['content-type'] || '').toLowerCase();
  const u8 = toUint8(res.data);
  const isMsgpack = ctype.includes('msgpack');
  if (isMsgpack && u8) {
    try { return { ...res, data: decodeMsgpack(u8) as T }; } catch {}
  }
  if (u8 && ctype.includes('json')) {
    try {
      const text = utf8Decoder.decode(u8);
      return { ...res, data: JSON.parse(text) as T };
    } catch {}
  }
  // Fallback: if server sent msgpack but no content-type, still try decode
  if (u8 && isMsgpack) {
    try { return { ...res, data: decodeMsgpack(u8) as T }; } catch {}
  }
  return res;
};
const withMsgpackAccept = (base?: Record<string, string>) => {
  const headers: Record<string, string> = { ...(base || {}) };
  if (ENABLE_MSGPACK_THREADS && !headers['Accept']) {
    headers['Accept'] = 'application/msgpack, application/json';
  }
  return headers;
};
function getDedupedMaybeMsgpack<T>(url: string, params?: Record<string, any>, headers?: Record<string, string>, validateStatus?: (s: number) => boolean) {
  const key = keyFor(url, params);
  const existing = inflight.get(key);
  if (existing) return existing as Promise<{ data: T }>;
  const config: AxiosRequestConfig = { params, headers, validateStatus };
  if (ENABLE_MSGPACK_THREADS) (config as any).responseType = 'arraybuffer';
  const prom = api.get<T>(url, config)
    .then((res) => decodeMaybeMsgpack<T>(res))
    .finally(() => {
      setTimeout(() => inflight.delete(key), 100);
    });
  inflight.set(key, prom as unknown as Promise<any>);
  return prom as Promise<{ data: T }>;
}

// ─── QUOTES BATCH ──────────────────────────────────────────────────────────
export const getQuotesBatch = (ids: number[]) =>
  getDeduped<QuoteV2[]>(`${API_V1}/quotes/v2/batch`, { ids: ids.join(',') });

// Start a message-only thread to contact an artist, without needing a full booking request
export const startMessageThread = (payload: {
  artist_id: number;
  message?: string;
  proposed_date?: string; // YYYY-MM-DD or ISO datetime
  guests?: number;
  service_id?: number;
}) => (function(){ const p = api.post<{ booking_request_id: number }>(`${API_V1}/message-threads/start`, payload); try { noteAfterWrite(2); } catch {} return p; })();

// ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────
export const getGoogleCalendarStatus = () =>
  api.get<{ connected: boolean; email?: string }>(
    `${API_V1}/google-calendar/status`,
  );

export const connectGoogleCalendar = () =>
  api.get<{ auth_url: string }>(`${API_V1}/google-calendar/connect`);

export const disconnectGoogleCalendar = () =>
  api.delete(`${API_V1}/google-calendar`);

// ─── USER ACCOUNT ────────────────────────────────────────────────────────────
export const exportMyAccount = () =>
  api.get(`${API_V1}/users/me/export`);

export const deleteMyAccount = (password: string) =>
  api.delete(`${API_V1}/users/me`, { data: { password } });

// ─── EVENT PREP ───────────────────────────────────────────────────────────────
export async function getEventPrep(bookingId: number) {
  const res = await getDeduped<EventPrep>(`${API_V1}/bookings/${bookingId}/event-prep`);
  return res.data;
}

export async function updateEventPrep(
  bookingId: number,
  patch: Partial<EventPrepPayload>,
  opts?: { idempotencyKey?: string }
) {
  const res = await api.patch<EventPrep>(
    `${API_V1}/bookings/${bookingId}/event-prep`,
    patch,
    opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : undefined,
  );
  return res.data;
}

export async function completeEventPrepTask(
  bookingId: number,
  payload: { key: string; value?: any },
  opts?: { idempotencyKey?: string }
) {
  const res = await api.post<EventPrep>(
    `${API_V1}/bookings/${bookingId}/event-prep/complete-task`,
    payload,
    opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : undefined,
  );
  return res.data;
}

export default api; // Export the axios instance as default

// Explicit type re-export for convenience
export type { EventPrep } from '@/types';

// ─── RIDER ───────────────────────────────────────────────────────────────────
export interface Rider {
  id: number;
  service_id: number;
  spec?: Record<string, any> | null;
  pdf_url?: string | null;
}

export const getRider = (serviceId: number) =>
  api.get<Rider>(`${API_V1}/services/${serviceId}/rider`);

export const upsertRider = (serviceId: number, payload: { spec?: Record<string, any> | null; pdf_url?: string | null }) =>
  api.post<Rider>(`${API_V1}/services/${serviceId}/rider`, { service_id: serviceId, ...payload });
// ─── EVENT PREP ATTACHMENTS ────────────────────────────────────────────────
export interface EventPrepAttachment { id: number; file_url: string; created_at: string }
export const getEventPrepAttachments = (bookingId: number) =>
  api.get<EventPrepAttachment[]>(`${API_V1}/bookings/${bookingId}/event-prep/attachments`);
export const addEventPrepAttachment = (bookingId: number, url: string) =>
  api.post<EventPrepAttachment>(`${API_V1}/bookings/${bookingId}/event-prep/attachments`, { url });
export const deleteEventPrepAttachment = (bookingId: number, attachmentId: number) =>
  api.delete<void>(`${API_V1}/bookings/${bookingId}/event-prep/attachments/${attachmentId}`);

// ─── PRICEBOOK ESTIMATE (404-safe) ───────────────────────────────────────────
/**
 * Call the supplier pricebook estimator but treat missing pricebooks as a
 * soft result instead of a console-logging 404.
 *
 * Returns a structured object with `pricebook_missing: true` when the
 * pricebook does not exist for the given service. Callers can branch on the
 * flag without throwing or spamming the console.
 */
export async function estimatePriceSafe(
  serviceId: number,
  body: any,
): Promise<{
  estimate_min: number | null;
  estimate_max: number | null;
  breakdown?: Record<string, any>;
  pricebook_missing?: boolean;
}> {
  try {
    const resp = await api.post(
      `${API_V1}/services/${serviceId}/pricebook/estimate`,
      body ?? {},
    );
    return resp.data as any;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return { estimate_min: null, estimate_max: null, breakdown: {}, pricebook_missing: true };
    }
    return { estimate_min: null, estimate_max: null, breakdown: {}, pricebook_missing: true };
  }
}
