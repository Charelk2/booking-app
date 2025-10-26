import * as React from 'react';

type Props = {
  messageId: number;
  fromSelf?: boolean;
  text?: string;
  linkToCopy?: string;
  myReactions?: Set<string>;
  onToggleReaction?: (id: number, emoji: string, hasNow: boolean) => void;
  onReply?: (id: number, snippet: string) => void;
  onDelete?: (id: number) => void;
};

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉'];

export default function MessageActions({ messageId, fromSelf = false, text = '', linkToCopy, myReactions, onToggleReaction, onReply, onDelete }: Props) {
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const lpTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      try {
        const t = e.target as Node | null;
        if (panelRef.current && t && panelRef.current.contains(t)) return;
      } catch {}
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  // Close on scroll/wheel/touchmove (prevents stale overlays while the thread scrolls)
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Wheel and touchmove bubble; capture scroll events broadly
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('touchmove', close, { passive: true });
    window.addEventListener('scroll', close, { capture: true, passive: true } as any);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', close as any);
      window.removeEventListener('touchmove', close as any);
      window.removeEventListener('scroll', close as any, { capture: true } as any);
      window.removeEventListener('keydown', onKey as any);
    };
  }, [open]);

  const onCopy = async () => {
    try {
      const val = (text || linkToCopy || '').toString();
      if (!val) return;
      await navigator.clipboard?.writeText(val);
    } catch {}
    setOpen(false);
  };

  const replySnippet = React.useMemo(() => (text || '').toString().slice(0, 140), [text]);

  return (
    <div
      className="pointer-events-auto"
      onContextMenu={(e) => { e.preventDefault(); setOpen(true); }}
      onTouchStart={() => {
        try { if (lpTimerRef.current) window.clearTimeout(lpTimerRef.current); } catch {}
        lpTimerRef.current = window.setTimeout(() => setOpen(true), 350);
      }}
      // Guard against long-press opening while user starts scrolling
      onTouchMove={() => { try { if (lpTimerRef.current) window.clearTimeout(lpTimerRef.current); } catch {} }}
      onTouchEnd={() => { try { if (lpTimerRef.current) window.clearTimeout(lpTimerRef.current); } catch {} }}
      onTouchCancel={() => { try { if (lpTimerRef.current) window.clearTimeout(lpTimerRef.current); } catch {} }}
    >
      {/* Trigger */}
      <button
        type="button"
        aria-label="Message actions"
        className={[
          'absolute -top-3',
          fromSelf ? '-left-3' : '-right-3',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
          'rounded-full bg-white shadow ring-1 ring-black/10 w-6 h-6 grid place-items-center',
        ].join(' ')}
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
      >
        {/* three dots */}
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
          <circle cx="4" cy="10" r="1.6" fill="currentColor" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          <circle cx="16" cy="10" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={[
            // High stacking to ensure the menu stays above adjacent bubbles
            'absolute z-[2000]',
            // Vertical flip: anchor the menu ABOVE the bubble so its bottom aligns with bubble top
            'bottom-full',
            // Horizontal mirroring by sender
            // - Sent (fromSelf): place menu to the LEFT of the bubble so the menu's bottom-right
            //   corner meets the bubble's top-left corner.
            // - Received: place menu to the RIGHT so the menu's bottom-left corner meets
            //   the bubble's top-right corner.
            fromSelf ? 'right-full' : 'left-full',
          ].join(' ')}
        >
          <div className="rounded-xl bg-white shadow-lg ring-1 ring-black/10 p-2 w-40">
            <div className="flex items-center justify-end gap-1 px-1 pb-2 border-b border-gray-200">
                {QUICK_EMOJIS.map((e) => {
                  const active = Boolean(myReactions && myReactions.has(e));
                  return (
                    <button
                      key={e}
                      type="button"
                      className={[
                        'px-1.5 py-0.5 text-[12px] rounded-full border',
                        active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700',
                      ].join(' ')}
                      onClick={(ev) => { ev.stopPropagation(); onToggleReaction?.(messageId, e, active); setOpen(false); }}
                    >
                      {e}
                    </button>
                  );
                })}
            </div>
            <div className="py-1">
              <button
                type="button"
                className="w-full text-left text-[13px] px-2 py-1 rounded hover:bg-gray-50"
                onClick={(e) => { e.stopPropagation(); onReply?.(messageId, replySnippet); setOpen(false); }}
              >
                Reply
              </button>
              <button
                type="button"
                className="w-full text-left text-[13px] px-2 py-1 rounded hover:bg-gray-50"
                onClick={(e) => { e.stopPropagation(); onCopy(); }}
                disabled={!text && !linkToCopy}
              >
                {text ? 'Copy' : 'Copy link'}
              </button>
              {fromSelf && (
                <>
                  <div className="my-1 h-px bg-gray-200" />
                  <button
                    type="button"
                    className="w-full text-left text-[13px] px-2 py-1 rounded hover:bg-red-50 text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      const ok = window.confirm('Delete this message?');
                      if (!ok) return;
                      try { onDelete?.(messageId); } finally { setOpen(false); }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
