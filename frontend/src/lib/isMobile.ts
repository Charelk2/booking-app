export default function isMobileScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
}
