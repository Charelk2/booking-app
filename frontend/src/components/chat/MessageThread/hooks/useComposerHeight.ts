// components/chat/MessageThread/hooks/useComposerHeight.ts
import * as React from 'react';

export function useComposerHeight(ref: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight || 0);
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } catch {
      window.addEventListener('resize', update);
    }
    return () => {
      if (ro) try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  return height;
}

