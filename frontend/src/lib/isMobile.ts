import { BREAKPOINT_SM } from '@/lib/breakpoints';

/**
 * Determine if the current viewport is below the small breakpoint.
 * Uses `matchMedia` so the value mirrors Tailwind's `sm` screen.
 */
export default function isMobileScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${BREAKPOINT_SM - 1}px)`).matches;
}
