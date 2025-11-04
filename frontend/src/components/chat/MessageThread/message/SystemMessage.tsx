// components/chat/MessageThread/message/SystemMessage.tsx
import * as React from 'react';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { apiUrl } from '@/lib/api';
import { t } from '@/lib/i18n';

type SystemMessageProps = {
  msg: any;
  onOpenDetails?: () => void;
  onOpenQuote?: () => void;
  hasAnyQuote?: boolean;
};

const absUrlRegex = /(https?:\/\/[^\s]+)/i;
const relUrlRegex = /(\/api\/[\S]+)/i;
const urlRegex = /(https?:\/\/[^\s]+|\/[^\s]+)/i;




export default function SystemMessage({ msg, onOpenDetails, onOpenQuote, hasAnyQuote = false }: SystemMessageProps) {
  try {
    const key = String((msg?.system_key || msg?.action || '')).toLowerCase();
    const content = String(msg?.content || '');
    const lower = content.toLowerCase();

    // New quote requested CTA (client asks for a fresh quote)
    // Place this early so it doesn't fall through to the generic system line.
    if (lower.includes('new quote requested') || key.includes('quote_requested')) {
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black text-white text-xs font-semibold">Q</span>
              <div>
                <div className="text-sm font-semibold">New quote requested.</div>
                <div className="text-xs text-gray-600">Send an updated quote.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900"
                onClick={() => { try { onOpenQuote?.(); } catch {} }}
              >
                Create quote
              </button>
            </div>
          </div>
        </div>
      );
    }

    // New booking request CTA card
    if (lower.includes('new booking request') || lower.includes('you have a new booking request')) {
      if (hasAnyQuote) return null;
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black text-white text-xs font-semibold">B</span>
              <div>
                <div className="text-sm font-semibold">Booking request.</div>
                {/* Keep subtitle minimal; details live in the side panel */}
                <div className="text-xs text-gray-600">Review details.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
                onClick={() => { try { onOpenDetails?.(); } catch {} }}
              >
                Review details
              </button>
              {!hasAnyQuote && (
                <button
                  type="button"
                  className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900"
                  onClick={() => { try { onOpenQuote?.(); } catch {} }}
                >
                  Create quote
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Payment received
    if (key.includes('payment_received') || content.toLowerCase().includes('payment received')) {
      // Extract a receipt link from the content. Prefer absolute; fall back to
      // relative and normalize to absolute using apiUrl.
      const abs = content.match(absUrlRegex)?.[1] || null;
      const rel = abs ? null : (content.match(relUrlRegex)?.[1] || null);
      const receiptUrl = abs || (rel ? apiUrl(rel) : null);
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="text-[12px] text-gray-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
            {t('system.paymentReceived', 'Payment received. Your booking is confirmed.')}
            {receiptUrl ? (
              <>
                {' '}
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="underline text-green-700">
                  {t('system.viewReceipt', 'View receipt')}
                </a>
              </>
            ) : null}
          </div>
        </div>
      );
    }

    // Booking details summary: show a compact, actionable line instead of hiding completely
    if (content.startsWith(BOOKING_DETAILS_PREFIX)) {
      if (hasAnyQuote) return null;
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black text-white text-xs font-semibold">B</span>
              <div>
                <div className="text-sm font-semibold">New booking request</div>
                <div className="text-xs text-gray-600">Review details.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
                onClick={() => { try { onOpenDetails?.(); } catch {} }}
              >
                Review details
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Moderation: listing approved/rejected
    const modMatch = lower.match(/listing\s+(approved|rejected)\s*:/i);
    if (modMatch) {
      const status = (modMatch[1] || '').toLowerCase();
      const approved = status === 'approved';
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3 max-w-[520px] w-full">
            <div className={`text-[12px] font-medium ${approved ? 'text-green-700' : 'text-red-700'}`}>
              {approved
                ? t('system.listingApproved', 'Listing approved')
                : t('system.listingRejected', 'Listing rejected')}
            </div>
            <div className="mt-1 text-[12px] text-gray-600 break-words">
              {content}
            </div>
          </div>
        </div>
      );
    }

    // Inquiry sent (rich card)
    if (key.includes('inquiry_sent') || content.includes('inquiry_sent_v1')) {
      // Try to parse rich payload from JSON content
      let title = '';
      let cover: string | null = null;
      let view: string | null = null;
      let date: string | undefined;
      let guests: number | undefined;
      try {
        const obj = JSON.parse(content);
        const p = obj?.inquiry_sent_v1 as any;
        if (p && typeof p === 'object') {
          title = String(p.title || '');
          cover = p.cover ? String(p.cover) : null;
          view = p.view ? String(p.view) : null;
          if (p.date) date = String(p.date);
          if (p.guests != null) {
            const g = Number(p.guests);
            if (Number.isFinite(g)) guests = g;
          }
        }
      } catch {
        // Fallback: extract the first URL (if any) from the content
        const m = content.match(urlRegex);
        view = m?.[1] || null;
      }

      const hasMeta = Boolean(date || guests !== undefined);
      const metaText = [
        date ? new Date(date).toLocaleDateString('en') : null,
        guests !== undefined ? `${guests} ${guests === 1 ? 'guest' : 'guests'}` : null,
      ].filter(Boolean).join(' • ');

      return (
        <div className="my-2 ml-auto w-full md:w-1/3 md:max-w-[480px] group relative" role="group" aria-label="Inquiry sent">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-600 font-medium">{t('system.inquirySent', 'Inquiry sent')}</div>
                {title ? (
                  <div className="mt-1 text-sm font-semibold text-gray-900 truncate">{title}</div>
                ) : null}
                {hasMeta ? (
                  <div className="mt-0.5 text-[12px] text-gray-600 truncate">{metaText}</div>
                ) : null}
              </div>
              {cover ? (
                <img
                  alt=""
                  width={56}
                  height={56}
                  decoding="async"
                  className="ml-auto h-14 w-14 rounded-lg object-cover"
                  src={cover}
                />
              ) : null}
            </div>
            {view ? (
              <div className="mt-3">
                <a
                  href={view}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white hover:no-underline focus:text-white active:text-white"
                >
                  {t('system.viewListing', 'View listing')}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // Generic system line
    return (
      <div className="my-2 w-full flex justify-center">
        <div className="text-[12px] text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {content || t('system.update', 'System update')}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
