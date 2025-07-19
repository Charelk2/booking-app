import type { ComponentProps } from 'react';
import NotificationCard from '@/components/ui/NotificationCard';
import { parseItem } from '@/components/layout/NotificationListItem';
import { toUnifiedFromNotification } from './notificationUtils';
import type { Notification, UnifiedNotification } from '@/types';

export type NotificationCardProps = ComponentProps<typeof NotificationCard>;

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

  const onClick = () => {
    if (link) {
      window.location.assign(link);
    }
  };

  return {
    type: parsed.status ?? 'reminder',
    from: parsed.title,
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
