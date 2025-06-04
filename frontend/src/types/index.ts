// frontend/src/types/index.ts

export interface User {
  id: number;
  email: string;
  user_type: 'artist' | 'client';
  first_name: string;
  last_name: string;
  phone_number: string;
  is_active: boolean;
  is_verified: boolean;
}

export interface ArtistProfile {
  id: number;
  user_id: number;
  business_name: string;
  description?: string | null;
  location?: string | null;
  hourly_rate?: number | string | null;
  profile_picture_url?: string | null;
  cover_photo_url?: string | null;
  portfolio_urls?: string[] | null;
  specialties?: string[] | null;
  user: User;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: number;
  artist_id: number;
  title: string;
  description: string;
  duration_minutes: number;
  price: number;
  artist: ArtistProfile;
}

export interface Booking {
  id: number;
  artist_id: number;
  client_id: number;
  service_id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  total_price: number;
  notes: string;
  artist: ArtistProfile;
  client: User;
  service: Service;
}

export interface Review {
  id: number;
  booking_id: number;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
  client?: User;
}

// ─── BookingRequest / Quote Interfaces ─────────────────────────────────────────

// This is the payload you send when creating a new booking request:
export interface BookingRequestCreate {
  artist_id: number;
  service_id?: number;
  message?: string;
  proposed_datetime_1?: string; // ISO‐formatted date‐time string
}

// This is what the backend returns when you GET a booking request:
export interface BookingRequest {
  id: number;
  client_id: number;
  artist_id: number;
  service_id?: number;
  message?: string | null;
  proposed_datetime_1?: string | null;
  proposed_datetime_2?: string | null;
  status: string; // e.g. "pending_quote", "quote_provided", etc.
  created_at: string;
  updated_at: string;
  // If you want to expand relationships, you could add:
  // client?: User;
  // artist?: User;
  // service?: Service;
  // quotes?: Quote[];
}

// If you need to handle Quotes (e.g. when the artist replies):
export interface QuoteCreate {
  booking_request_id: number;
  quote_details: string;
  price: number;
  currency?: string;      // defaults to "USD"
  valid_until?: string;   // ISO date-time
}

export interface Quote {
  id: number;
  booking_request_id: number;
  artist_id: number;
  quote_details: string;
  price: number;
  currency: string;
  valid_until?: string | null;
  status: string; // e.g. "pending_client_action", "accepted_by_client", etc.
  created_at: string;
  updated_at: string;
  // booking_request?: BookingRequest;
  // artist?: User;
}

export interface Message {
  id: number;
  booking_request_id: number;
  sender_id: number;
  sender_type: 'client' | 'artist';
  content: string;
  message_type: 'text' | 'quote' | 'system';
  quote_id?: number | null;
  attachment_url?: string | null;
  timestamp: string;
}

export interface MessageCreate {
  content: string;
  message_type?: 'text' | 'quote' | 'system';
  quote_id?: number;
  attachment_url?: string;
}
