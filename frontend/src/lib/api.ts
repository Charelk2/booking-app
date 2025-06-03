// frontend/src/lib/api.ts

import axios from 'axios';
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
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
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

// ─── All other resources live under /api/v1 ────────────────────────────────────

const API_V1 = '/api/v1';

// ─── ARTISTS ───────────────────────────────────────────────────────────────────

export const getArtists = () =>
  api.get<ArtistProfile[]>(`${API_V1}/artist-profiles`);

export const getArtist = (userId: number) =>
  api.get<ArtistProfile>(`${API_V1}/artist-profiles/${userId}`);

export const getArtistProfileMe = () =>
  api.get<ArtistProfile>(`${API_V1}/artist-profiles/me`);

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

// ─── SERVICES ──────────────────────────────────────────────────────────────────

// “services by artist” is GET /api/v1/services/artist/{artist_user_id}
export const getArtistServices = (artistUserId: number) =>
  api.get<Service[]>(`${API_V1}/services/artist/${artistUserId}`);

export const getAllServices = () =>
  api.get<Service[]>(`${API_V1}/services`);

// create / update / delete a service: POST /api/v1/services, PUT /api/v1/services/{id}, DELETE /api/v1/services/{id}
export const createService = (data: Partial<Service>) =>
  api.post(`${API_V1}/services`, data);

export const updateService = (id: number, data: Partial<Service>) =>
  api.put(`${API_V1}/services/${id}`, data);

export const deleteService = (id: number) =>
  api.delete(`${API_V1}/services/${id}`);

// ─── BOOKINGS ──────────────────────────────────────────────────────────────────

// create booking: POST /api/v1/bookings
export const createBooking = (data: Partial<Booking>) =>
  api.post(`${API_V1}/bookings`, data);

// client’s bookings: GET /api/v1/bookings/my-bookings
export const getMyClientBookings = () =>
  api.get<Booking[]>(`${API_V1}/bookings/my-bookings`);

// artist’s bookings: GET /api/v1/bookings/artist-bookings
export const getMyArtistBookings = () =>
  api.get<Booking[]>(`${API_V1}/bookings/artist-bookings`);

// read a single booking: GET /api/v1/bookings/{bookingId}
export const getBookingDetails = (bookingId: number) =>
  api.get<Booking>(`${API_V1}/bookings/${bookingId}`);

// update status: PATCH /api/v1/bookings/{booking_id}/status
export const updateBookingStatus = (id: number, status: Booking['status']) =>
  api.patch(`${API_V1}/bookings/${id}/status`, { status });

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
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/my-requests`);

// If the artist needs to fetch requests addressed to them:
export const getBookingRequestsForArtist = () =>
  api.get<BookingRequest[]>(`${API_V1}/booking-requests/artist-requests`);

// If you want to fetch a single booking request by ID:
export const getBookingRequestById = (id: number) =>
  api.get<BookingRequest>(`${API_V1}/booking-requests/${id}`);

// Create a new quote (artist → client) for an existing booking request:
//    POST /api/v1/quotes/
// Body must match QuoteCreate interface.
export const createQuote = (data: QuoteCreate) =>
  api.post<Quote>(`${API_V1}/quotes/`, data);

// Optionally, fetch all quotes for a given booking request:
export const getQuotesForBookingRequest = (bookingRequestId: number) =>
  api.get<Quote[]>(
    `${API_V1}/booking-requests/${bookingRequestId}/quotes`
  );

export default api;
