// frontend/src/types/index.ts

export interface User {
  id: number;
  email: string;
  user_type: "artist" | "client";
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
  custom_subtitle?: string | null;
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
  service_type:
    | "Live Performance"
    | "Virtual Appearance"
    | "Personalized Video"
    | "Custom Song"
    | "Other";
  duration_minutes: number;
  display_order: number;
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
  status: "pending" | "confirmed" | "completed" | "cancelled";
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
  attachment_url?: string;
  proposed_datetime_1?: string; // ISO‐formatted date‐time string
  status?: string;
}

// This is what the backend returns when you GET a booking request:
export interface BookingRequest {
  id: number;
  client_id: number;
  artist_id: number;
  service_id?: number;
  message?: string | null;
  attachment_url?: string | null;
  proposed_datetime_1?: string | null;
  proposed_datetime_2?: string | null;
  status: string; // e.g. "pending_quote", "quote_provided", etc.
  created_at: string;
  updated_at: string;
  // Optional expanded relations returned by the API
  client?: User;
  artist?: User;
  service?: Service;
  // quotes?: Quote[];
}

// If you need to handle Quotes (e.g. when the artist replies):
export interface QuoteCreate {
  booking_request_id: number;
  quote_details: string;
  price: number;
  currency?: string; // defaults to "USD"
  valid_until?: string; // ISO date-time
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
  sender_type: "client" | "artist";
  content: string;
  message_type: "text" | "quote" | "system";
  quote_id?: number | null;
  attachment_url?: string | null;
  avatar_url?: string | null;
  /** Whether the message has been read by the current user */
  unread?: boolean;
  timestamp: string;
}

export interface MessageCreate {
  content: string;
  message_type?: "text" | "quote" | "system";
  quote_id?: number;
  attachment_url?: string;
}

export interface SoundProvider {
  id: number;
  name: string;
  contact_info?: string | null;
  price_per_event?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface QuoteCalculationResponse {
  base_fee: number;
  travel_cost: number;
  provider_cost: number;
  accommodation_cost: number;
  total: number;
}
export interface ArtistSoundPreference {
  id: number;
  artist_id: number;
  provider_id: number;
  priority?: number | null;
  provider?: SoundProvider;
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type:
    | 'new_message'
    | 'new_booking_request'
    | 'booking_status_updated'
    | 'deposit_due'
    | 'review_request';
  message: string;
  link: string;
  is_read: boolean;
  timestamp: string;
  sender_name?: string;
  booking_type?: string;
}

export interface ThreadNotification {
  booking_request_id: number;
  name: string;
  unread_count: number;
  last_message: string;
  link: string;
  timestamp: string;
  avatar_url?: string | null;
  booking_details?: {
    timestamp: string;
    location?: string;
    guests?: string;
    venue_type?: string;
    notes?: string;
  } | null;
}

export interface UnifiedNotification {
  /** 'message' for chat threads or other Notification.type values */
  type: string;
  /** ISO timestamp used for chronological sorting */
  timestamp: string;
  /** Whether the item has been read */
  is_read: boolean;
  /** Main content string shown in the feed */
  content: string;
  /** Optional link for navigation */
  link?: string;
  /** Optional ID for standard notifications */
  id?: number;
  /** Optional booking request ID for chat threads */
  booking_request_id?: number;
  /** Sender or thread name */
  name?: string;
  /** Unread message count for chat threads */
  unread_count?: number;
  avatar_url?: string | null;
  /** Optional sender name for booking requests */
  sender_name?: string;
  /** Booking type or service title */
  booking_type?: string;
  booking_details?: {
    timestamp: string;
    location?: string;
    guests?: string;
    venue_type?: string;
    notes?: string;
  } | null;
}
