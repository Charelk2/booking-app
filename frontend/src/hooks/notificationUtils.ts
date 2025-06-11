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
