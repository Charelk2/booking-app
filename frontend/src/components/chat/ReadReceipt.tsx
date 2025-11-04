import * as React from 'react';

export type DeliveryState = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

/**
 * WhatsApp‑style read receipts with accessible labels and tiny state animations.
 * Usage: <ReadReceipt state={state} at={timestampISO} align="outgoing" />
 */
function _ReadReceipt({
  state,
  at,
  align = 'outgoing',
  className = '',
}: {
  state: DeliveryState;
  at?: string | Date | null;
  /** outgoing | incoming - incoming hides the ticks entirely */
  align?: 'outgoing' | 'incoming';
  className?: string;
}) {
  if (align === 'incoming') return null; // WhatsApp doesn't show ticks on incoming

  const label =
    state === 'sending' ? 'Sending…' :
    state === 'sent' ? 'Sent' :
    state === 'delivered' ? 'Delivered' :
    state === 'read' ? 'Read' : 'Failed to send';

  // Colors match WhatsApp feel without cloning it exactly
  const base = 'inline-flex items-center select-none';
  const size = 'h-4 w-5';
  const color =
    state === 'read' ? 'text-sky-500' :
    state === 'delivered' ? 'text-zinc-500' :
    state === 'sent' ? 'text-zinc-500' : // treat sending as sent for UI
    state === 'sending' ? 'text-zinc-500' : 'text-rose-500';

  return (
    <span
      className={`${base} ${className}`}
      role="img"
      aria-label={label}
      title={formatTooltip(label, at)}
    >
      {state === 'sending' ? (
        <span className="inline-flex items-center">
          <TickSingle className={`${size} ${color}`} />
          <DotPulse className="ml-0.5" />
          <span className="sr-only">{label}</span>
        </span>
      ) : state === 'sent' ? (
        <TickSingle className={`${size} ${color}`} />
      ) : state === 'delivered' ? (
        <TickDouble className={`${size} ${color}`} />
      ) : state === 'read' ? (
        <TickDouble className={`${size} ${color}`} />
      ) : (
        <ErrorIcon className={`${size} ${color}`} />
      )}
    </span>
  );
}

export default React.memo(_ReadReceipt);

function formatTooltip(label: string, at?: string | Date | null) {
  if (!at) return label;
  try {
    const d = typeof at === 'string' ? new Date(at) : at;
    return `${label} · ${d.toLocaleString()}`;
  } catch {
    return label;
  }
}

function TickSingle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TickDouble(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l4 4L17 7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13l4 4L23 7" />
    </svg>
  );
}

function ErrorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

/** Minimal, accessible 3‑dot pulse for the "sending" state. */
function DotPulse({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex ${className}`} aria-hidden>
      <span className="mx-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-duration:1100ms]" />
      <span className="mx-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:150ms] [animation-duration:1100ms]" />
      <span className="mx-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:300ms] [animation-duration:1100ms]" />
    </span>
  );
}
