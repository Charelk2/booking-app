// Avoid runtime imports of UI components to prevent circular dependencies in
// production builds. Define the shape used by NotificationCard inline and keep
// parsing logic local.
import { toUnifiedFromNotification } from './notificationUtils';
import type { Notification, UnifiedNotification } from '@/types';

export interface NotificationCardProps {
  type: 'confirmed' | 'reminder' | 'due' | string;
  from: string;
  createdAt: string | number | Date;
  unread: boolean;
  onClick: () => void;
  avatarUrl?: string | null;
  subtitle?: string;
  metadata?: string;
}

/**
 * Convert a Notification or UnifiedNotification into NotificationCard props.
 * Provides a click handler that navigates to the related link using
 * `window.location.assign`.
 */
export default function getNotificationDisplayProps(
  n: Notification | UnifiedNotification,
): NotificationCardProps {
  const unified: UnifiedNotification = 'content' in n ? n : toUnifiedFromNotification(n);
  // Inline parse (title, subtitle, status, avatar)
  const content = typeof unified.content === 'string' ? unified.content : '';
  const avatarUrl = unified.profile_picture_url || unified.avatar_url || undefined;
  let status: 'confirmed' | 'reminder' | 'due' | undefined;
  let title = unified.name || unified.sender_name || '';
  let subtitle = '';
  let metadata: string | undefined;

  if (unified.type === 'message' || unified.type === 'new_message') {
    const cleaned = content.replace(/^new message(?: from [^:]+)?:\s*/i, '').trim();
    const snippet = cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned;
    title = title || 'Message';
    const senderName = unified.sender_name || unified.name || 'Someone';
    const prefix = `New message from ${senderName}`;
    subtitle = snippet ? `${prefix}: ${snippet}` : prefix;
  } else if (unified.type === 'new_booking_request') {
    status = 'reminder';
    const bRaw = (unified.booking_type || '').replace(/_/g, ' ').trim();
    const bookingType = (() => {
      const normalized = bRaw.toLowerCase();
      if (!normalized) return '';
      if (normalized === 'personalized video') return 'Personalised Video';
      return bRaw.replace(/\b\w/g, (c) => c.toUpperCase());
    })();
    title = title || 'New booking request';
    subtitle = bookingType || 'New booking request';
    const loc = content.match(/Location:\s*(.+)/i)?.[1]?.split('\n')[0]?.trim();
    const dateStr = content.match(/Date:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const parts: string[] = [];
    if (loc) parts.push(`📍 ${loc}`);
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        parts.push(`📅 ${fmt.format(d)}`);
      } catch {}
    }
    metadata = parts.join(' — ');
  } else if (unified.type === 'quote_expiring' || unified.type === 'quote_expired') {
    status = 'reminder';
    title = unified.type === 'quote_expiring' ? 'Quote Expiring' : 'Quote Expired';
    subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
  } else if (unified.type === 'review_request') {
    status = 'reminder';
    title = 'Review Request';
    subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
  } else if (/booking confirmed/i.test(content) || unified.type === 'new_booking') {
    status = 'reminder';
    title = 'Booking Confirmed';
    subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
  } else if (unified.type === 'quote_accepted' || /quote accepted/i.test(content)) {
    status = 'confirmed';
    const who = unified.sender_name || unified.name || content.match(/Quote accepted by (.+)/i)?.[1] || '';
    title = who ? `Quote accepted by ${who}` : 'Quote accepted';
    subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
  } else if (/new booking/i.test(content)) {
    status = 'confirmed';
    title = 'Booking Confirmed';
    subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
  } else {
    const typeTitle = (unified.type || '')
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
    title = title || typeTitle || 'Notification';
    subtitle = content.length > 36 ? `${content.slice(0, 36)}...` : content;
  }
  const link = unified.link;

  // Use the computed title as the primary "from" label, falling back to sender/name.
  let from = title || unified.sender_name || unified.name || '';
  if ((unified.type === 'message' || unified.type === 'new_message') && !from) {
    const match = unified.content?.match(/New message from (.*?):/i);
    if (match && match[1]) {
      from = match[1].trim();
    }
  }

  const onClick = () => {
    if (link) {
      window.location.assign(link);
    }
  };

  return {
    type: status ?? 'reminder',
    from,
    subtitle,
    metadata,
    avatarUrl: avatarUrl ?? null,
    createdAt: unified.timestamp,
    unread: unified.type === 'message'
      ? (unified.unread_count ?? 0) > 0
      : !unified.is_read,
    onClick,
  };
}
