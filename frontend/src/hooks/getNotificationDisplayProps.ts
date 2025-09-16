// Avoid runtime imports of UI components to prevent circular dependencies in
// production builds. Define the shape used by NotificationCard inline.
import { parseItem } from '@/components/layout/NotificationListItem';
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
  const parsed = parseItem(unified);
  const link = unified.link;

  let from = parsed.title;
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
    type: parsed.status ?? 'reminder',
    from,
    subtitle: parsed.subtitle,
    metadata: parsed.metadata,
    avatarUrl: parsed.avatarUrl ?? null,
    createdAt: unified.timestamp,
    unread: unified.type === 'message'
      ? (unified.unread_count ?? 0) > 0
      : !unified.is_read,
    onClick,
  };
}
