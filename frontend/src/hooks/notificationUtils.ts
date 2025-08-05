import type { Notification, ThreadNotification, UnifiedNotification } from '@/types';

/**
 * Merge incoming notifications with existing ones, ensuring uniqueness by ID
 * and keeping them sorted from newest to oldest.
 */
export function mergeNotifications(
  existing: Notification[],
  incoming: Notification[],
): Notification[] {
  const map = new Map<number, Notification>();
  [...existing, ...incoming].forEach((n) => map.set(n.id, n));
  const sorted = Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const deduped: Notification[] = [];
  for (const n of sorted) {
    const last = deduped[deduped.length - 1];
    if (
      last &&
      last.type === n.type &&
      last.link === n.link &&
      last.message === n.message &&
      Math.abs(new Date(last.timestamp).getTime() - new Date(n.timestamp).getTime()) <
        10 * 60 * 1000
    ) {
      continue;
    }
    deduped.push(n);
  }
  return deduped;
}

/** Merge and sort unified notifications from both APIs. */
export function mergeFeedItems(
  existing: UnifiedNotification[],
  incoming: UnifiedNotification[],
): UnifiedNotification[] {
  const map = new Map<string, UnifiedNotification>();
  const all = [...existing, ...incoming];
  all.forEach((n) => {
    const key = n.type === 'message' ? `t-${n.booking_request_id}` : `n-${n.id}`;
    if (key) {
      map.set(key, { ...map.get(key), ...n });
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/** Convert a Notification into the unified format. */
export function toUnifiedFromNotification(n: Notification): UnifiedNotification {
  return {
    type: n.type === 'new_message' ? 'message' : n.type,
    timestamp: n.timestamp,
    is_read: n.is_read,
    content: n.message,
    link: n.link,
    id: n.id,
    sender_name: n.sender_name,
    booking_type: n.booking_type,
    avatar_url: n.avatar_url,
    profile_picture_url: n.profile_picture_url,
  };
}

/** Convert a ThreadNotification into the unified format. */
export function toUnifiedFromThread(t: ThreadNotification): UnifiedNotification {
  return {
    type: 'message',
    timestamp: t.timestamp,
    is_read: t.unread_count === 0,
    content: t.last_message,
    booking_request_id: t.booking_request_id,
    name: t.name,
    unread_count: t.unread_count,
    link: t.link,
    avatar_url: t.avatar_url,
    profile_picture_url: t.profile_picture_url,
    booking_details: t.booking_details ?? undefined,
  };
}
