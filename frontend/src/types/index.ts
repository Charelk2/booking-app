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
  mfa_enabled?: boolean;
  profile_picture_url?: string | null;
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
  portfolio_image_urls?: string[] | null;
  specialties?: string[] | null;
  /** Average star rating calculated from reviews */
  rating?: number;
  /** Number of reviews contributing to the rating */
  rating_count?: number;
  /** Whether the artist has no active bookings on the chosen date */
  is_available?: boolean;
  /** Controls if the hourly_rate should be displayed to users */
  price_visible?: boolean;
  /** Price of the selected service category when filtering */
  service_price?: number | string | null;
  user: User;
  created_at: string;
  updated_at: string;
}

export interface SearchParams {
  category?: string;
  location?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
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
  travel_rate?: number;
  travel_members?: number;
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
  /** Amount paid as a deposit toward this booking */
  deposit_amount?: number | null;
  /** Date when the deposit is due */
  deposit_due_by?: string | null;
  /** Current payment status, e.g. 'pending', 'deposit_paid', 'paid' */
  payment_status?: string;
  /** ID from the payment gateway used to fetch receipts */
  payment_id?: string | null;
  /** Booking request associated with this booking */
  booking_request_id?: number;
  artist: ArtistProfile;
  client: User;
  service: Service;
  source_quote?: Quote;
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
  proposed_datetime_2?: string;
  status?: string;
  travel_mode?: 'fly' | 'drive';
  travel_cost?: number;
  travel_breakdown?: Record<string, unknown>;
}

// This is what the backend returns when you GET a booking request:
export interface BookingRequest {
  last_message_timestamp: string;
  is_unread_by_current_user: boolean;
  last_message_content: string | undefined;
  sound_required: undefined;
  id: number;
  client_id: number;
  artist_id: number;
  service_id?: number;
  message?: string | null;
  attachment_url?: string | null;
  proposed_datetime_1?: string | null;
  proposed_datetime_2?: string | null;
  travel_mode?: 'fly' | 'drive' | null;
  travel_cost?: number | null;
  travel_breakdown?: Record<string, unknown> | null;
  status: string; // e.g. "pending_quote", "quote_provided", etc.
  created_at: string;
  updated_at: string;
  // Optional expanded relations returned by the API
  client?: User;
  artist?: User;
  /** Additional artist details including business name */
  artist_profile?: ArtistProfile;
  service?: Service;
  quotes?: Quote[];
  accepted_quote_id?: number | null;
}

// If you need to handle Quotes (e.g. when the artist replies):
export interface QuoteCreate {
  booking_request_id: number;
  quote_details: string;
  price: number;
  currency?: string; // defaults to "ZAR"
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

export interface ServiceItem {
  description: string;
  price: number;
}

export interface QuoteTemplate {
  id: number;
  artist_id: number;
  name: string;
  services: ServiceItem[];
  sound_fee: number;
  travel_fee: number;
  accommodation?: string | null;
  discount?: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteV2Create {
  booking_request_id: number;
  artist_id: number;
  client_id: number;
  services: ServiceItem[];
  sound_fee: number;
  travel_fee: number;
  accommodation?: string | null;
  discount?: number | null;
  expires_at?: string | null;
}

export interface QuoteV2 extends QuoteV2Create {
  id: number;
  booking_id?: number | null;
  subtotal: number;
  total: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  updated_at: string;
}

export interface BookingSimple {
  id: number;
  quote_id: number;
  artist_id: number;
  client_id: number;
  confirmed: boolean;
  date?: string | null;
  location?: string | null;
  payment_status: string;
  deposit_due_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  is_read: boolean;
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
  ai_description?: string | null;
  ai_price_adjustment?: number | null;
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
    | 'quote_accepted'
    | 'new_booking'
    | 'deposit_due'
    | 'review_request'
    | 'message_thread_notification';
  message: string;
  link: string;
  is_read: boolean;
  timestamp: string;
  sender_name?: string;
  booking_type?: string;
  avatar_url?: string | null;
  profile_picture_url?: string | null;
}

export interface ThreadNotification {
  booking_request_id: number;
  name: string;
  unread_count: number;
  last_message: string;
  link: string;
  timestamp: string;
  avatar_url?: string | null;
  profile_picture_url?: string | null;
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
  profile_picture_url?: string | null;
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