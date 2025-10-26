import * as React from 'react';

type BubbleProps = {
  id?: string;
  fromSelf?: boolean;
  className?: string;
  highlight?: boolean;
  unreadRef?: React.Ref<HTMLDivElement>;
  onLongPressStart?: (e: React.TouchEvent | React.MouseEvent) => void;
  onLongPressMove?: (e: React.TouchEvent | React.MouseEvent) => void;
  onLongPressEnd?: (e: React.TouchEvent | React.MouseEvent) => void;
  children?: React.ReactNode;
};

const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(function Bubble(
  {
    id,
    fromSelf = false,
    className = '',
    highlight = false,
    unreadRef,
    onLongPressStart,
    onLongPressMove,
    onLongPressEnd,
    children,
  },
  _ref
) {
  // WhatsApp-like bubble styling
  // - Outgoing (self): pale green, tail on right
  // - Incoming: white, tail on left
  const base =
    'group relative inline-block select-text w-auto max-w-[78%] px-3 py-1.5 text-[14px] leading-snug ' +
    'whitespace-pre-wrap break-words shadow-[0_1px_0_rgba(0,0,0,0.08)] will-change-transform';

  const color = fromSelf ? 'bg-[#D9FDD3] text-[#111b21]' : 'bg-white text-[#111b21]';
  const align = fromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0';
  const radius = fromSelf ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';
  const ring = highlight ? 'ring-1 ring-indigo-200' : '';

  // Allow text selection so message content can be copied
  const selectableStyle: React.CSSProperties = {
    WebkitUserSelect: 'text',
    userSelect: 'text',
  };

  // Prefer the external unreadRef if provided, else our internal ref
  const bubbleRef = (node: HTMLDivElement | null) => {
    if (!unreadRef) return;
    if (typeof unreadRef === 'function') unreadRef(node);
    else if (typeof unreadRef === 'object') (unreadRef as any).current = node;
  };

  const handleStart = (e: any) => onLongPressStart?.(e);
  const handleMove = (e: any) => onLongPressMove?.(e);
  const handleEnd = (e: any) => onLongPressEnd?.(e);

  return (
    <div
      id={id}
      data-from-self={fromSelf ? '1' : '0'}
      className={`${base} ${color} ${align} ${radius} ${ring} ${className}`}
      tabIndex={-1}
      ref={bubbleRef}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      style={selectableStyle}
      role="group"
      aria-live="off"
    >
      {/* Tail */}
      {fromSelf ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 bottom-0 text-[#D9FDD3]"
        >
          <svg viewBox="0 0 8 13" width="8" height="13" preserveAspectRatio="xMidYMid meet" className="block">
            <path opacity="0.13" d="M5.188,1H0v11.193l6.467-8.625 C7.526,2.156,6.958,1,5.188,1z" fill="#000" />
            <path d="M5.188,0H0v11.193l6.467-8.625C7.526,1.156,6.958,0,5.188,0z" fill="currentColor" />
          </svg>
        </span>
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-2 bottom-0 text-white"
        >
          <svg viewBox="0 0 8 13" width="8" height="13" preserveAspectRatio="xMidYMid meet" className="block">
            <path opacity="0.13" d="M1.533,3.568L8,12.193V1H2.812 C1.042,1,0.474,2.156,1.533,3.568z" fill="#000" />
            <path d="M1.533,2.568L8,11.193V0L2.812,0C1.042,0,0.474,1.156,1.533,2.568z" fill="currentColor" />
          </svg>
        </span>
      )}

      {children}
    </div>
  );
});

export default React.memo(Bubble);
