export type Role = 'support' | 'payments' | 'trust' | 'content' | 'admin' | 'superadmin';

export type AdminUser = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
};

export type Listing = {
  id: string;
  provider_id: string;
  title: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  category: string;
  price_from?: number;
  updated_at: string;
};

export type Booking = {
  id: string;
  client_id: string;
  provider_id: string;
  listing_id: string;
  status: 'requested' | 'quoted' | 'paid_held' | 'completed' | 'disputed' | 'refunded' | 'cancelled';
  event_date: string;         // ISO
  location?: string;
  total_amount: number;       // cents
  created_at: string;         // ISO
};

export type LedgerEntry = {
  id: string;
  booking_id?: string;
  type: 'charge' | 'fee' | 'refund' | 'payout' | 'chargeback';
  amount: number; // cents (+ = platform received; - = platform out)
  currency: 'ZAR';
  created_at: string;
  meta?: Record<string, unknown>;
};

export type Payout = {
  id: string;
  provider_id: string;
  amount: number;
  currency: 'ZAR';
  status: 'queued' | 'processing' | 'paid' | 'failed';
  batch_id?: string;
  created_at: string;
};

export type Dispute = {
  id: string;
  booking_id: string;
  status: 'open' | 'needs_info' | 'resolved_refund' | 'resolved_release' | 'denied';
  reason: string;
  created_at: string;
};

export type EmailEvent = {
  id: string;
  message_id: string;
  to: string;
  template: string;
  event: 'processed'|'delivered'|'open'|'click'|'bounce'|'dropped';
  created_at: string;
  booking_id?: string;
  user_id?: string;
};

export type SmsEvent = {
  id: string;
  sid: string;
  to: string;
  status: 'queued'|'sent'|'delivered'|'undelivered'|'failed';
  created_at: string;
  booking_id?: string;
  user_id?: string;
};

export type Review = {
  id: string;
  booking_id: string;
  provider_id: string;
  rating: number; // 1..5
  text?: string;
  verified: boolean;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  actor_admin_id: string;
  entity: string;
  entity_id: string;
  action: string;
  before?: unknown;
  after?: unknown;
  at: string;
};

