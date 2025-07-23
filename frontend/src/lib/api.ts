// frontend/src/lib/api.ts

import axios, { AxiosProgressEvent } from 'axios';
import { extractErrorMessage, normalizeQuoteTemplate } from './utils';
import {
  User,
  ArtistProfile,
  Service,
  Booking,
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
  SoundProvider,
  ArtistSoundPreference,
  QuoteCalculationResponse,
  QuoteTemplate,
  
  Notification,
  ThreadNotification,
} from '@/types';

// Create a single axios instance for all requests
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach the bearer token (if present) to every request
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token =
        localStorage.getItem('token') || sessionStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else if (config.headers && 'Authorization' in config.headers) {
        delete config.headers.Authorization;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Provide consistent error messages across the app
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      let message = extractErrorMessage(error.response?.data?.detail);

      if (status) {
        const map: Record<number, string> = {
          400: 'Bad request. Please verify your input.',
          401: 'Authentication required. Please log in.',
          403: 'You do not have permission to perform this action.',
          404: 'Resource not found.',
          422: 'Validation failed. Please check your input.',
          500: 'Server error. Please try again later.',
        };
        if (message === 'An unexpected error occurred.') {
          message = map[status] || message;
        }
      } else {
        message = 'Network error. Please check your connection.';
      }

      console.error('API error:', error);
      return Promise.reject(new Error(message));
    }

    console.error('Unexpected API error:', error);
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

export const verifyMfa = (token: string, code: string) =>
  api.post('/auth/verify-mfa', { token, code });

export const setupMfa = () => api.post('/auth/setup-mfa');
export const confirmMfa = (code: string) =>
  api.post('/auth/confirm-mfa', { code });
export const generateRecoveryCodes = () => api.post('/auth/recovery-codes');
export const disableMfa = (code: string) =>
  api.post('/auth/disable-mfa', { code });

export const confirmEmail = (token: string) =>
  api.post('/auth/confirm-email', { token });

export const getCurrentUser = () => api.get<User>('/auth/me');

// ─── All other resources live under /api/v1 ────────────────────────────────────

const API_V1 = '/api/v1';

// Helper to ensure API responses always include `user_id`
const normalizeArtistProfile = (
  profile: Partial<ArtistProfile> | ArtistProfile
): ArtistProfile => ({
  ...profile,
  user_id: (profile.user_id ?? profile.id) as number,
});

// ─── ARTISTS ───────────────────────────────────────────────────────────────────

export const getArtists = async (params?: {
  category?: string;
  location?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}) => {
  const res = await api.get<ArtistProfile[]>(`${API_V1}/artist-profiles/`, {
    params,
  });
  return { ...res, data: res.data.map(normalizeArtistProfile) };
};

export const getArtist = async (userId: number) => {
  const res = await api.get<ArtistProfile>(`${API_V1}/artist-profiles/${userId}`);
  return { ...res, data: normalizeArtistProfile(res.data) };
};

export const getArtistAvailability = (artistId: number) =>
  api.get<{ unavailable_dates: string[] }>(`${API_V1}/artist-profiles/${artistId}/availability`);

export const getArtistProfileMe = async () => {
  const res = await api.get<ArtistProfile>(`${API_V1}/artist-profiles/me`);
  return { ...res, data: normalizeArtistProfile(res.data) };
};

export const updateMyArtistProfile = (data: Partial<ArtistProfile>) =>
  api.put(`${API_V1}/artist-profiles/me`, data);

export const uploadMyArtistProfilePicture = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ArtistProfile>(
    `${API_V1}/artist-profiles/me/profile-picture`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export const uploadMyArtistCoverPhoto = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ArtistProfile>(
    `${API_V1}/artist-profiles/me/cover-photo`,
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

export const uploadMyArtistPortfolioImages = (files: File[]) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  return api.post<ArtistProfile>(
    `${API_V1}/artist-profiles/me/portfolio-images`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export const updateMyArtistPortfolioImageOrder = (urls: string[]) =>
  api.put<ArtistProfile>(`${API_V1}/artist-profiles/me/portfolio-images`, {
    portfolio_image_urls: urls,
  });

// ─── SERVICES ──────────────────────────────────────────────────────────────────

// “services by artist” is GET /api/v1/services/artist/{artist_user_id}
export const getArtistServices = (artistUserId: number) =>
  api.get<Service[]>(`${API_V1}/services/artist/${artistUserId}`);

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

// list reviews for an artist: GET /api/v1/reviews/artist-profiles/{artist_id}/reviews
export const getArtistReviews = (artistUserId: number) =>
  api.get<Review[]>(
    `${API_V1}/reviews/artist-profiles/${artistUserId}/reviews`
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

export const uploadMessageAttachment = (
  bookingRequestId: number,
  file: File,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{ url: string }>(
    `${API_V1}/booking-requests/${bookingRequestId}/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress }
  );
};

export const uploadBookingAttachment = (
  formData: FormData,
  onUploadProgress?: (event: AxiosProgressEvent) => void,
) =>
  api.post<{ url: string }>(
    `${API_V1}/booking-requests/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress }
  );

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


// ─── SOUND PROVIDERS ─────────────────────────────────────────────────────────
export const getSoundProviders = () =>
  api.get<SoundProvider[]>(`${API_V1}/sound-providers/`);

export const createSoundProvider = (data: Partial<SoundProvider>) =>
  api.post<SoundProvider>(`${API_V1}/sound-providers/`, data);

export const updateSoundProvider = (
  id: number,
  data: Partial<SoundProvider>
) => api.put<SoundProvider>(`${API_V1}/sound-providers/${id}`, data);

export const deleteSoundProvider = (id: number) =>
  api.delete(`${API_V1}/sound-providers/${id}`);

export const getSoundProvidersForArtist = (artistId: number) =>
  api.get<ArtistSoundPreference[]>(`${API_V1}/sound-providers/artist/${artistId}`);

export const addArtistSoundPreference = (
  artistId: number,
  data: { provider_id: number; priority?: number }
) =>
  api.post<ArtistSoundPreference>(`${API_V1}/sound-providers/artist/${artistId}`,
    data);

// ─── QUOTE CALCULATOR ───────────────────────────────────────────────────────
export const calculateQuote = (params: {
  base_fee: number;
  distance_km: number;
  provider_id?: number;
  accommodation_cost?: number;
}) => api.post<QuoteCalculationResponse>(`${API_V1}/quotes/calculate`, params);

// ─── PAYMENTS ───────────────────────────────────────────────────────────────
export const createPayment = (data: {
  booking_request_id: number;
  amount: number;
  full?: boolean;
}) => api.post(`${API_V1}/payments`, data);

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
// Notifications endpoints live under /api/v1
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

export default api;
