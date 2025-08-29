// frontend/src/lib/api.ts

import axios, { AxiosProgressEvent } from 'axios';
import logger from './logger';
import { format } from 'date-fns';
import { extractErrorMessage, normalizeQuoteTemplate } from './utils';
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
  QuoteCreate,
  Quote,
  QuoteV2Create,
  QuoteV2,
  BookingSimple,
  Message,
  MessageCreate,
  QuoteCalculationResponse,
  QuoteTemplate,
  Notification,
  ThreadNotification,
  ThreadPreview,
  ParsedBookingDetails,
  ServiceCategory,
} from '@/types';
import { useAuth as useContextAuth } from '@/contexts/AuthContext'; // Renamed to avoid conflict with default export 'api'

// Create a single axios instance for all requests
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Allow sending/receiving HttpOnly cookies
api.defaults.withCredentials = true;

// Automatically attach the bearer token (if present) to every request
api.interceptors.request.use(
  (config) => {
    logger.info({ method: config.method, url: config.url }, 'API request');
    // Cookie-only: do not attach Authorization headers from JS
    if (config.headers && 'Authorization' in config.headers) {
      delete config.headers.Authorization;
    }
    // Attach a non-sensitive device identifier to help trusted-device logic
    try {
      if (typeof window !== 'undefined') {
        const did = localStorage.getItem('booka.trusted_device_id');
        if (did) {
          (config.headers as any)['X-Device-Id'] = did;
        }
      }
    } catch {}
    return config;
  },
  (error) => Promise.reject(error)
);

// Provide consistent error messages across the app
let isRefreshing = false;
let pendingQueue: Array<() => void> = [];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const originalRequest = error.config;
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      let message = extractErrorMessage(detail);

      // Attempt silent refresh once on 401, then retry original request
      if (status === 401 && originalRequest && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            pendingQueue.push(() => resolve(api(originalRequest)));
          });
        }
        originalRequest._retry = true;
        isRefreshing = true;
        return api
          .post('/auth/refresh')
          .then(() => {
            // Access cookie is updated by server; proceed to retry
            // Retry queued requests
            pendingQueue.forEach((cb) => cb());
            pendingQueue = [];
            return api(originalRequest);
          })
          .catch((refreshErr) => {
            pendingQueue = [];
            if (typeof window !== 'undefined') {
              localStorage.removeItem('user');
              sessionStorage.removeItem('user');
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

      logger.error({ err: error, status, detail }, 'API error');
      return Promise.reject(new Error(message));
    }

    logger.error({ err: error }, 'Unexpected API error');
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

export const getCurrentUser = () => api.get<User>('/auth/me');

export const logout = () => api.post('/auth/logout');

export const forgotPassword = (email: string) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password });

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

export const getServiceProvider = async (userId: number) => {
  const res = await api.get<ServiceProviderProfile>(`${API_V1}/service-provider-profiles/${userId}`);
  return { ...res, data: normalizeServiceProviderProfile(res.data) };
};

export const getServiceProviderAvailability = (serviceProviderId: number) =>
  api.get<{ unavailable_dates: string[] }>(`${API_V1}/service-provider-profiles/${serviceProviderId}/availability`);

export const getServiceProviderProfileMe = async () => {
  const res = await api.get<ServiceProviderProfile>(`${API_V1}/service-provider-profiles/me`);
  return { ...res, data: normalizeServiceProviderProfile(res.data) };
};

export const updateMyServiceProviderProfile = (data: Partial<ServiceProviderProfile>) =>
  api.put(`${API_V1}/service-provider-profiles/me`, data);

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
  return api.get<Service[]>(`${API_V1}/services/artist/${id}`);
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
  api.get<Booking[]>(`${API_V1}/bookings/my-bookings`, { params });

// artist’s bookings: GET /api/v1/bookings/artist-bookings
export const getMyArtistBookings = () =>
  api.get<Booking[]>(`${API_V1}/bookings/artist-bookings`);

// read a single booking: GET /api/v1/bookings/{bookingId}
export const getBookingDetails = (bookingId: number) =>
  api.get<Booking>(`${API_V1}/bookings/${bookingId}`);

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
  api.get<Review[]>(
    `${API_V1}/reviews/service-provider-profiles/${serviceProviderUserId}/reviews`
  );

// ─── BOOKING REQUESTS & QUOTES ─────────────────────────────────────────────────

// Create a new booking request (client → artist):
//    POST /api/v1/booking-requests/
// Body must match BookingRequestCreate interface.
export const createBookingRequest = (data: BookingRequestCreate) =>
  api.post<BookingRequest>(`${API_V1}/booking-requests/`, data);

// Optionally, if you want to get a list of booking requests (e.g., for a client dashboard):
export const getMyBookingRequests = () =>
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/client`);

// If the artist needs to fetch requests addressed to them:
export const getBookingRequestsForArtist = () =>
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/me/artist`);

export const getDashboardStats = () =>
  api.get<{
    monthly_new_inquiries: number;
    profile_views: number;
    response_rate: number;
  }>(`${API_V1}/booking-requests/stats`);

// If you want to fetch a single booking request by ID:
export const getBookingRequestById = (id: number) =>
  api.get<BookingRequest>(`${API_V1}/booking-requests/${id}`);

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
// Body must match QuoteCreate interface.
export const createQuoteForRequest = (
  requestId: number,
  data: QuoteCreate
) => api.post<Quote>(`${API_V1}/booking-requests/${requestId}/quotes`, data);

// Optionally, fetch all quotes for a given booking request:
export const getQuotesForBookingRequest = (bookingRequestId: number) =>
  api.get<Quote[]>(
    `${API_V1}/booking-requests/${bookingRequestId}/quotes`
  );

export const createQuoteV2 = (data: QuoteV2Create) =>
  api.post<QuoteV2>(`${API_V1}/quotes`, data);

export const getQuoteV2 = (quoteId: number) =>
  api.get<QuoteV2>(`${API_V1}/quotes/${quoteId}`);

export const acceptQuoteV2 = (quoteId: number, serviceId?: number) => {
  const url = serviceId
    ? `${API_V1}/quotes/${quoteId}/accept?service_id=${serviceId}`
    : `${API_V1}/quotes/${quoteId}/accept`;
  return api.post<BookingSimple>(url, {});
};

export const declineQuoteV2 = (quoteId: number) =>
  api.post<QuoteV2>(`${API_V1}/quotes/${quoteId}/decline`, {});

export const getMyArtistQuotes = (params: { skip?: number; limit?: number } = {}) =>
  api.get<Quote[]>(`${API_V1}/quotes/me/artist`, { params });

export const getMyClientQuotes = (
  params: { skip?: number; limit?: number; status?: string } = {},
) => api.get<Quote[]>(`${API_V1}/quotes/me/client`, { params });

export const updateQuoteAsArtist = (id: number, data: Partial<Quote>) =>
  api.put<Quote>(`${API_V1}/quotes/${id}/artist`, data);

export const updateQuoteAsClient = (id: number, data: { status: string }) =>
  api.put<Quote>(`${API_V1}/quotes/${id}/client`, data);

export const confirmQuoteBooking = (id: number) =>
  api.post<Booking>(`${API_V1}/quotes/${id}/confirm-booking`, {});

// ─── MESSAGES ───────────────────────────────────────────────────────────
export const getMessagesForBookingRequest = (bookingRequestId: number) =>
  api.get<Message[]>(
    `${API_V1}/booking-requests/${bookingRequestId}/messages`
  );

export const postMessageToBookingRequest = (
  bookingRequestId: number,
  data: MessageCreate
) =>
  api.post<Message>(
    `${API_V1}/booking-requests/${bookingRequestId}/messages`,
    data
  );

// Attempt to delete a message. If the backend doesn't support it, callers should handle errors gracefully.
export const deleteMessageForBookingRequest = (
  bookingRequestId: number,
  messageId: number,
) => api.delete(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}`);

export const markMessagesRead = (bookingRequestId: number) =>
  api.put<{ updated: number }>(
    `${API_V1}/booking-requests/${bookingRequestId}/messages/read`
  );

export const uploadMessageAttachment = (
  bookingRequestId: number,
  file: File,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
) => {
  if (!file || file.size === 0) {
    return Promise.reject(new Error('Attachment file is required'));
  }
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{ url: string }>(
    `${API_V1}/booking-requests/${bookingRequestId}/attachments`,
    formData,
    { onUploadProgress, headers: { 'Content-Type': undefined } },
  );
};

export const addMessageReaction = (
  bookingRequestId: number,
  messageId: number,
  emoji: string,
) => api.post(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}/reactions`, { emoji });

export const removeMessageReaction = (
  bookingRequestId: number,
  messageId: number,
  emoji: string,
) => api.delete(`${API_V1}/booking-requests/${bookingRequestId}/messages/${messageId}/reactions`, { data: { emoji } });

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
  const { data } = await api.post<{ task_id: string }>(
    `${API_V1}/booking-requests/parse`,
    { text },
  );
  return getParsedBooking(data.task_id);
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
}) => api.post<QuoteCalculationResponse>(`${API_V1}/quotes/calculate`, data);


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
    `${API_V1}/quotes/calculate`,
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

// ─── PAYMENTS ───────────────────────────────────────────────────────────────
export const createPayment = (data: {
  booking_request_id: number;
  amount: number;
  full?: boolean;
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

export const getNotifications = (skip = 0, limit = 20) =>
  api.get<Notification[]>(
    `${API_NOTIFICATIONS}/notifications?skip=${skip}&limit=${limit}`,
  );

export const markNotificationRead = (id: number) =>
  api.put<Notification>(`${API_NOTIFICATIONS}/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.put(`${API_NOTIFICATIONS}/notifications/read-all`);

export const getMessageThreads = () =>
  api.get<ThreadNotification[]>(
    `${API_NOTIFICATIONS}/notifications/message-threads`,
  );

export const markThreadRead = (bookingRequestId: number) =>
  api.put(
    `${API_NOTIFICATIONS}/notifications/message-threads/${bookingRequestId}/read`,
  );

// ─── MESSAGE THREADS PREVIEW (atomic previews + unread counts) ─────────────
export interface ThreadPreviewResponse {
  items: ThreadPreview[];
  next_cursor: string | null;
}

export const getMessageThreadsPreview = (role?: 'artist' | 'client', limit = 50) =>
  api.get<ThreadPreviewResponse>(
    `${API_V1}/message-threads/preview`,
    { params: { role, limit } }
  );

export const ensureBookaThread = () =>
  api.post<{ booking_request_id: number | null }>(
    `${API_V1}/message-threads/ensure-booka-thread`,
    {}
  );

// Start a message-only thread to contact an artist, without needing a full booking request
export const startMessageThread = (payload: {
  artist_id: number;
  message?: string;
  proposed_date?: string; // YYYY-MM-DD or ISO datetime
  guests?: number;
  service_id?: number;
}) => api.post<{ booking_request_id: number }>(`${API_V1}/message-threads/start`, payload);

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
  const res = await api.get<EventPrep>(`${API_V1}/bookings/${bookingId}/event-prep`);
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

// Re-export useAuth from its original context file if it's there
// This fixes the 'Function not implemented' warning and potential import conflicts.
export { useContextAuth as useAuth }; // Re-export as 'useAuth'

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
