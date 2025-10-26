// components/chat/MessageThread/grouping/keys.ts
import type { MessageGroup } from './types';

/**
 * Compute stable keys per group using a signature of first/last ids, count, and divider flag.
 * The caller provides a Map to preserve keys across renders and a nextKeyRef for fallback sequences.
 */
export function computeGroupKeys(
  groups: MessageGroup[],
  map: Map<string, number>,
  nextKeyRef: { current: number },
): number[] {
  const out: number[] = [];
  for (const g of groups) {
    const first = g.messages[0];
    const last = g.messages[g.messages.length - 1];
    const firstId = Number(first?.id || 0);
    const lastId = Number(last?.id || 0);
    const sig = `${firstId}-${lastId}-${g.messages.length}-${g.showDayDivider ? 1 : 0}`;
    if (!map.has(sig)) {
      const key = Number.isFinite(firstId) && firstId > 0 ? firstId : (nextKeyRef.current++);
      map.set(sig, key);
    }
    out.push(map.get(sig)!);
  }
  return out;
}

