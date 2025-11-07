// frontend/src/lib/normalizers/messages.ts
import type { Message } from '@/types';
import { safeParseDate } from '@/lib/chat/threadStore';

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

  // Normalize message_type to accept lowercase legacy values
  const mt = String(raw?.message_type ?? '').toUpperCase();
  const message_type = (mt === 'TEXT' ? 'USER' : (mt || 'USER')) as Message['message_type'];

  const tsRaw = String(raw?.timestamp ?? '');
  const ts = safeParseDate(tsRaw);
  const iso = Number.isFinite(ts.getTime()) ? ts.toISOString() : new Date().toISOString();

  return {
    id: Number(raw?.id ?? 0),
    booking_request_id: Number(raw?.booking_request_id ?? raw?.thread_id ?? 0),
    sender_id: Number(raw?.sender_id ?? 0),
    sender_type,
    content: String(raw?.content ?? ''),
    message_type,
    quote_id: raw?.quote_id == null ? null : Number(raw?.quote_id),
    attachment_url: raw?.attachment_url ?? null,
    attachment_meta: raw?.attachment_meta ?? null,
    visible_to,
    action: raw?.action ?? null,
    avatar_url: raw?.avatar_url ?? null,
    expires_at: raw?.expires_at ?? null,
    unread: Boolean(raw?.unread),
    is_read: Boolean(raw?.is_read),
    reply_to_message_id: raw?.reply_to_message_id == null ? null : Number(raw?.reply_to_message_id),
    reply_to_preview: raw?.reply_to_preview ?? null,
    reactions: raw?.reactions ?? null,
    my_reactions: raw?.my_reactions ?? null,
    timestamp: iso,
    status,
  } as Message;
}