// frontend/src/lib/alwaysBottomClamp.ts
// Hard-clamp a scrollable element to the absolute bottom at all times.
// Attaches listeners and observers to ensure scrollTop always equals
// (scrollHeight - clientHeight), regardless of content changes or user input.

export function attachAlwaysBottomClamp(el: HTMLElement): () => void {
  if (!el) return () => {};

  let rafId: number | null = null;

  const clampNow = () => {
    try {
      const maxTop = (el.scrollHeight || 0) - (el.clientHeight || 0);
      if (maxTop >= 0 && typeof el.scrollTop === 'number') {
        if (el.scrollTop !== maxTop) el.scrollTop = maxTop;
      }
    } catch {}
  };

  const clampAsync = () => {
    try {
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId);
      }
      if (typeof requestAnimationFrame !== 'undefined') {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          clampNow();
          // double-check shortly after in case of late image/font reflow
          setTimeout(clampNow, 16);
        });
      } else {
        setTimeout(clampNow, 0);
      }
    } catch {}
  };

  // Initial clamp
  clampNow();

  const onScroll = () => clampAsync();
  el.addEventListener('scroll', onScroll, { passive: true });

  // Resize observer for scroll box
  let ro: ResizeObserver | null = null;
  try {
    ro = new ResizeObserver(() => clampAsync());
    ro.observe(el);
  } catch {}

  // Mutation observer for content changes (images, messages, etc.)
  let mo: MutationObserver | null = null;
  try {
    mo = new MutationObserver(() => clampAsync());
    mo.observe(el, { childList: true, subtree: true, attributes: true, characterData: false });
  } catch {}

  return () => {
    try { el.removeEventListener('scroll', onScroll); } catch {}
    try { if (ro) ro.disconnect(); } catch {}
    try { if (mo) mo.disconnect(); } catch {}
    try { if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId); } catch {}
  };
}

