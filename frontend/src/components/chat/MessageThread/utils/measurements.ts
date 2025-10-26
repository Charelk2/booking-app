// components/chat/MessageThread/utils/measurements.ts
export const NEAR_BOTTOM_PX = 2;

export function isNearBottom(scroller: HTMLElement, tolerance = NEAR_BOTTOM_PX) {
  const dist = Math.abs((scroller.scrollHeight - scroller.clientHeight) - scroller.scrollTop);
  return dist <= tolerance;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

