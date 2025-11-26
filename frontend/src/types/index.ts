// frontend/src/types/index.ts

export interface User {
  id: number;
  email: string;
  user_type: 'service_provider' | 'client';
  first_name: string;
  last_name: string;
  phone_number: string;
  is_active: boolean;
  is_verified: boolean;
  mfa_enabled?: boolean;
  profile_picture_url?: string | null;
  /** Optional slug for the provider profile when user_type === 'service_provider' */
  artist_slug?: string | null;
}

export interface ServiceProviderProfile {
  id: number;
  user_id: number;
  business_name: string;
  slug?: string | null;
  /** Optional primary role or  headline, e.g. 'DJ' */
  primary_role?: string | null;
  custom_subtitle?: string | null;
  description?: string | null;
  location?: string | null;
  hourly_rate?: number | string | null;
  profile_picture_url?: string | null;
  cover_photo_url?: string | null;
  portfolio_urls?: string[] | null;
  portfolio_image_urls?: string[] | null;
  specialties?: string[] | null;
  /** Spoken languages (optional; not always provided by backend) */
  languages?: string[] | null;
  /** Operational flags often shown as chips */
  owns_pa?: boolean | null;
  insured?: boolean | null;
  verified?: boolean | null;
  /** Engagement metrics */
  bookings_count?: number | null;
  avg_response_minutes?: number | null;
  /** Optional cancellation policy text configured by the service provider */
  cancellation_policy?: string | null;
  /** Whether the provider has completed onboarding */
  onboarding_completed?: boolean;
  /** Derived completion flag from backend */
  profile_complete?: boolean;
  /** Average star rating calculated from reviews */
  rating?: number;
  /** Optional average rating field variant in some responses */
  rating_avg?: number | null;
  /** Number of reviews contributing to the rating */
  rating_count?: number;
  /** Whether the service provider has no active bookings on the chosen date */
  is_available?: boolean;
  /** Controls if the hourly_rate should be displayed to users */
  price_visible?: boolean;
  /** Price of the selected service category when filtering */
  service_price?: number | string | null;
  /** Names of service categories offered by the service provider */
  service_categories?: string[];

  // Business & VAT
  legal_name?: string | null;
  trading_name?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_region?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  invoice_email?: string | null;
  vat_registered?: boolean | null;
  vat_number?: string | null;
  vat_rate?: number | string | null;
  agent_invoicing_consent?: boolean | null;
  user: User;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
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

  /** Canonical relationship field */
  service_provider_id: number;
  /** DEPRECATED alias kept during migration */
  artist_id?: number;

  title: string;
  description: string;

  /**
   * Some parts of the UI read `.details.sound_provisioning.*`.
   * Keep this flexible so we don't fight the compiler.
   */
  details?: Record<string, any> | null;

  media_url: string;
  service_type:
    | 'Live Performance'
    | 'Virtual Appearance'
    | 'Personalized Video'
    | 'Custom Song'
    | 'Other';
  duration_minutes: number;

  // Optional linkage to a predefined category. The slug is used when creating
  // services so the frontend does not depend on database-specific IDs.
  service_category_id?: number;
  service_category_slug?: string;
  service_category?: ServiceCategory;

  travel_rate?: number;
  travel_members?: number;
  car_rental_price?: number;
  flight_price?: number;

  display_order: number;
  price: number;

  /** Moderation status to reflect dashboard visibility */
  status?: 'draft' | 'pending_review' | 'approved' | 'rejected';

  /** Canonical relation */
  service_provider: ServiceProviderProfile;
  /** DEPRECATED alias kept during migration */
  artist?: ServiceProviderProfile;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'draft'
  | 'pending_quote'
  | 'quote_provided'
  | 'pending_artist_confirmation' // legacy value possibly still emitted by API
  | 'request_confirmed'
  | 'request_completed'
  | 'request_declined'
  | 'request_withdrawn'
  | 'quote_rejected';

export interface Booking {
  id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  client_id: number;
  service_id: number;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  total_price: number;
  notes: string;

  /** Current payment status, e.g. 'pending', 'paid' */
  payment_status?: string;
  /** ID from the payment gateway used to fetch receipts */
  payment_id?: string | null;
  /** Booking request associated with this booking */
  booking_request_id?: number;
  /** Latest invoice id for this booking (server-provided) */
  invoice_id?: number | null;

  /** Canonical */
  service_provider: ServiceProviderProfile;
  /** DEPRECATED */
  artist?: ServiceProviderProfile;

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
  // For provider/service reviews, the backend may include a nested client as
  // well as denormalised identity fields for convenience.
  client?: User;
  client_id?: number;
  client_first_name?: string;
  client_last_name?: string;
  client_display_name?: string;
}

// ─── BookingRequest / Quote Interfaces ─────────────────────────────────────────

export interface BookingRequestCreate {
  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  service_id?: number;
  message?: string;
  attachment_url?: string;
  proposed_datetime_1?: string; // ISO‐formatted date‐time string
  proposed_datetime_2?: string;
  status?: BookingStatus;
  travel_mode?: 'fly' | 'drive';
  travel_cost?: number;
  travel_breakdown?: Record<string, unknown>;
  /** New structured sound context (optional during transition) */
  sound_context?: SoundContext;
}

export interface ParsedBookingDetails {
  date?: string;
  location?: string;
  guests?: number;
  event_type?: string;
}

// This is what the backend returns when you GET a booking request:
export interface BookingRequest {
  artist: any;
  last_message_timestamp: string;
  is_unread_by_current_user: boolean;
  last_message_content: string | undefined;
  sound_required: undefined;
  id: number;
  client_id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  service_id?: number;
  message?: string | null;
  attachment_url?: string | null;
  proposed_datetime_1?: string | null;
  proposed_datetime_2?: string | null;
  travel_mode?: 'fly' | 'drive' | null;
  travel_cost?: number | null;
  travel_breakdown?: Record<string, unknown> | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;

  // Optional expanded relations returned by the API
  client?: User;

  /** Canonical */
  service_provider?: (User & {
    business_name?: string | null;
    profile_picture_url?: string | null;
    user?: User | null;
  }) | null;

  /** Canonical */
  service_provider_profile?: ServiceProviderProfile;
  /** DEPRECATED */
  artist_profile?: ServiceProviderProfile;

  service?: Service;
  quotes?: Quote[];
  accepted_quote_id?: number | null;

  /** Optional UI-only fields used for stable first paint */
  counterparty_label?: string;
  counterparty_avatar_url?: string | null;
}

// If you need to handle Quotes (e.g. when the service provider replies):
export interface QuoteCreate {
  booking_request_id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  quote_details: string;
  price: number;
  currency?: string; // defaults to "ZAR"
  valid_until?: string; // ISO date-time
}

export interface Quote {
  id: number;
  booking_request_id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  quote_details: string;
  price: number;
  currency: string;
  valid_until?: string | null;
  status: string; // e.g. "pending_client_action", "accepted_by_client", etc.
  created_at: string;
  updated_at: string;
  totals_preview?: QuoteTotalsPreview | null;
  provider_subtotal_preview?: number;
  booka_fee_preview?: number;
  booka_fee_vat_preview?: number;
  client_total_preview?: number;
  rates_preview?: Record<string, number> | null;
}

export interface ServiceItem {
  description: string;
  price: number;
}

export interface QuoteTemplate {
  id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

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

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

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
  totals_preview?: QuoteTotalsPreview | null;
  // DEPRECATED legacy preview fields (kept for compatibility)
  provider_subtotal_preview?: number;
  booka_fee_preview?: number;
  booka_fee_vat_preview?: number;
  client_total_preview?: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  updated_at: string;
}

export interface QuoteTotalsPreview {
  provider_subtotal?: number;
  platform_fee_ex_vat?: number;
  platform_fee_vat?: number;
  client_total_incl_vat?: number;
}

export interface BookingSimple {
  id: number;
  quote_id: number;

  /** Canonical */
  service_provider_id: number;
  /** DEPRECATED */
  artist_id?: number;

  client_id: number;
  confirmed: boolean;
  date?: string | null;
  location?: string | null;
  payment_status: string;
  payment_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentMeta {
  original_filename: string | null;
  content_type: string | null;
  size: number | null;
}

export interface Message {
  is_read: boolean;
  id: number;
  booking_request_id: number;
  sender_id: number;

  /** Canonical sender roles */
  sender_type: 'client' | 'service_provider';

  content: string;
  // message_type values are provided by the backend in uppercase.
  // Support both legacy lowercase and new uppercase forms for robustness.
  message_type: 'text' | 'quote' | 'system' | 'USER' | 'QUOTE' | 'SYSTEM';
  quote_id?: number | null;
  attachment_url?: string | null;
  attachment_meta?: AttachmentMeta | null;
  reactions?: Record<string, number> | null;
  my_reactions?: string[] | null;

  /** Canonical visibility values */
  visible_to?: 'service_provider' | 'client' | 'both';

  action?: string | null;
  avatar_url?: string | null;
  /** Optional expiration timestamp for system CTAs */
  expires_at?: string | null;

  /** Whether the message has been read by the current user */
  unread?: boolean;

  timestamp: string;

  /** Client-side status for optimistic UI (include 'queued' for offline-first) */
  status?: 'queued' | 'sending' | 'sent' | 'failed';

  /** Reply metadata */
  reply_to_message_id?: number | null;
  reply_to_preview?: string | null;
}

export interface MessageCreate {
  content?: string;
  // Allow either lowercase or uppercase message types when creating messages.
  message_type?: 'text' | 'quote' | 'system' | 'USER' | 'QUOTE' | 'SYSTEM';
  quote_id?: number;
  attachment_url?: string;
  attachment_meta?: AttachmentMeta;

  /** Canonical visibility values */
  visible_to?: 'service_provider' | 'client' | 'both';

  action?: string;
  expires_at?: string;

  /** Optional reply target */
  reply_to_message_id?: number;
}

export interface TravelEstimate {
  mode: string;
  cost: number;
}

export interface QuoteCalculationResponse {
  base_fee: number;
  travel_cost: number;
  travel_mode: string;
  travel_estimates: TravelEstimate[];
  accommodation_cost: number;
  sound_cost: number;
  sound_mode: string;
  sound_mode_overridden: boolean;
  sound_provider_id?: number | null;
  total: number;
}

// ─── SOUND CONTEXT (Payload) ───────────────────────────────────────────────
export interface SoundContext {
  sound_required: boolean;
  mode: 'supplier' | 'provided_by_artist' | 'managed_by_artist' | 'client_provided' | 'none';
  guest_count?: number;
  venue_type?: 'indoor' | 'outdoor' | 'hybrid';
  stage_required?: boolean;
  stage_size?: 'S' | 'M' | 'L';
  lighting_evening?: boolean;
  backline_required?: boolean;
  selected_sound_service_id?: number;
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

// Unified thread preview item returned by /message-threads/preview
export interface ThreadPreview {
  thread_id: number;
  counterparty: { name: string; avatar_url?: string | null };
  last_message_preview: string;
  last_actor: 'system' | 'user' | 'artist' | 'client';
  last_ts: string;
  unread_count: number;
  state: 'requested' | 'quoted' | 'confirmed' | 'completed' | 'cancelled' | string;
  meta?: Record<string, any> | null;
  pinned: boolean;
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

// ─── Event Prep ───────────────────────────────────────────────────────────────
export interface EventPrepPayload {
  day_of_contact_name?: string | null;
  day_of_contact_phone?: string | null;
  venue_address?: string | null;
  venue_place_id?: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  loadin_start?: string | null; // HH:MM[:SS]
  loadin_end?: string | null;   // HH:MM[:SS]
  soundcheck_time?: string | null;
  guests_arrival_time?: string | null;
  performance_start_time?: string | null;
  performance_end_time?: string | null;
  tech_owner?: 'venue' | 'artist' | null;
  stage_power_confirmed?: boolean | null;
  accommodation_required?: boolean | null;
  accommodation_address?: string | null;
  accommodation_contact?: string | null;
  accommodation_notes?: string | null;
  notes?: string | null;
  schedule_notes?: string | null;
  parking_access_notes?: string | null;
  // Booking Wizard specific details for clarity in Event Prep
  event_type?: string | null;
  guests_count?: number | null;
}

export interface EventPrep extends EventPrepPayload {
  booking_id: number;
  progress_done: number;
  progress_total: number;
}
