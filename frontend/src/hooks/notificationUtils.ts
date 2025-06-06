import type { Notification } from '@/types';

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
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
