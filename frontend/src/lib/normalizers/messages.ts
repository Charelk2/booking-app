// frontend/src/lib/normalizers/messages.ts
import type { Message } from '@/types';

/**
 * Normalize inbound messages so legacy payloads using 'artist' don't break the UI.
 */
export function normalizeMessage(raw: any): Message {
  const sender_type =
    raw?.sender_type === 'artist' ? 'service_provider' : (raw?.sender_type ?? 'client');

  const visible_to =
    raw?.visible_to === 'artist' ? 'service_provider' : (raw?.visible_to ?? 'both');

  const status: Message['status'] =
    raw?.status === 'queued' || raw?.status === 'sending' || raw?.status === 'failed'
      ? raw.status
      : 'sent';

  return {
    id: Number(raw.id),
    booking_request_id: Number(raw.booking_request_id),
    sender_id: Number(raw.sender_id),
    sender_type,
    content: String(raw.content ?? ''),
    message_type: (raw.message_type ?? 'USER') as Message['message_type'],
    quote_id: raw.quote_id == null ? null : Number(raw.quote_id),
    attachment_url: raw.attachment_url ?? null,
    visible_to,
    action: raw.action ?? null,
    avatar_url: raw.avatar_url ?? null,
    expires_at: raw.expires_at ?? null,
    unread: Boolean(raw.unread),
    is_read: Boolean(raw.is_read),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    status,
  };
}
