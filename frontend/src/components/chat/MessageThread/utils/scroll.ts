// components/chat/MessageThread/utils/scroll.ts
// Shared scroll helpers and constants to keep behavior consistent.

export const AT_BOTTOM_EPSILON_PX = 4;

export function isAtBottom(scroller: { scrollHeight?: number; clientHeight?: number; scrollTop?: number }, epsilon: number = AT_BOTTOM_EPSILON_PX): boolean {
  try {
    const scrollHeight = Number(scroller?.scrollHeight || 0);
    const clientHeight = Number(scroller?.clientHeight || 0);
    const scrollTop = Number(scroller?.scrollTop || 0);
    const maxTop = Math.max(0, scrollHeight - clientHeight);
    return Math.abs(maxTop - scrollTop) <= epsilon;
  } catch {
    return false;
  }
}
