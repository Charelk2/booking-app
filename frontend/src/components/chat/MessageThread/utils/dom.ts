// components/chat/MessageThread/utils/dom.ts (web only)
export function findVirtuosoScroller(host: HTMLElement | null): HTMLElement | null {
  if (!host) return null;
  return (
    (host.querySelector('[data-virtuoso-scroll-container="true"]') as HTMLElement)
    || (host.querySelector('[data-virtuoso-scroller="true"]') as HTMLElement)
    || (host.querySelector('[data-virtuoso-scroller]') as HTMLElement)
    || (host.firstElementChild as HTMLElement | null)
  );
}

