// components/chat/MessageThread/message/SystemMessage.tsx
import * as React from 'react';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import SafeImage from '@/components/ui/SafeImage';
import SystemCard from './SystemCard';

type SystemMessageProps = {
  msg: any;
  onOpenDetails?: () => void;
  onOpenQuote?: () => void;
  hasAnyQuote?: boolean;
  onMarkCompletedFromSystem?: () => void;
  onReportProblemFromSystem?: () => void;
  onOpenReviewFromSystem?: () => void;
  onOpenEventPrepFromSystem?: () => void;
};

const absUrlRegex = /(https?:\/\/[^\s]+)/i;
const relUrlRegex = /(\/api\/[\S]+)/i;
const urlRegex = /(https?:\/\/[^\s]+|\/[^\s]+)/i;




export default function SystemMessage({
  msg,
  onOpenDetails,
  onOpenQuote,
  hasAnyQuote = false,
  onMarkCompletedFromSystem,
  onReportProblemFromSystem,
  onOpenReviewFromSystem,
  onOpenEventPrepFromSystem,
}: SystemMessageProps) {
  try {
    const { user } = useAuth() || {} as any;
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
                <div className="text-sm font-semibold">Booking request</div>
                {/* Keep subtitle minimal; details live in the side panel */}
                <div className="text-xs text-gray-600">Review details</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-200 pl-2 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
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

    // Post-event flow: event finished prompts (client / provider)
    // Prefer explicit system_key, but also fall back to content matching for
    // legacy rows that predate system_key or when keys are missing.
    if (key.startsWith('event_finished_v1') || lower.startsWith('event finished:')) {
      const isProvider = (user?.user_type || '').toLowerCase() === 'service_provider';
      const title = t('system.eventFinishedTitle', 'Event finished');
      const subtitleClient = t(
        'system.eventFinishedClient',
        'If something wasn’t as expected, you can report a problem from this chat within 12 hours.',
      );
      const subtitleArtist = t(
        'system.eventFinishedArtist',
        'Review the event and mark this booking as completed, or report a problem if something went wrong.',
      );
      // Only allow the "Report a problem" action within ~12 hours of the system
      // message timestamp; after that, rely on auto-completion + support links.
      let withinComplaintWindow = true;
      try {
        const rawTs: any = (msg as any)?.timestamp || (msg as any)?.created_at;
        if (rawTs) {
          const ts = new Date(rawTs as any);
          if (Number.isFinite(ts.getTime())) {
            const hours = (Date.now() - ts.getTime()) / 3600000;
            withinComplaintWindow = hours <= 12;
          }
        }
      } catch {
        withinComplaintWindow = true;
      }
      if (isProvider) {
        return (
          <SystemCard
            icon="✓"
            tone="info"
            title={title}
            subtitle={subtitleArtist}
            primaryAction={
              withinComplaintWindow && onMarkCompletedFromSystem
                ? {
                    label: t('system.markCompleted', 'Mark as completed'),
                    variant: 'primary',
                    onClick: () => {
                      try {
                        onMarkCompletedFromSystem?.();
                      } catch {}
                    },
                  }
                : undefined
            }
            secondaryAction={
              withinComplaintWindow && onReportProblemFromSystem
                ? {
                    label: t('system.reportProblem', 'Report a problem'),
                    variant: 'secondary',
                    onClick: () => {
                      try {
                        onReportProblemFromSystem?.();
                      } catch {}
                    },
                  }
                : undefined
            }
          />
        );
      }
      return (
        <SystemCard
          icon="✓"
          tone="info"
          title={title}
          subtitle={subtitleClient}
          primaryAction={
            withinComplaintWindow && onReportProblemFromSystem
              ? {
                  label: t('system.reportProblem', 'Report a problem'),
                  variant: 'primary',
                  onClick: () => {
                    try {
                      onReportProblemFromSystem?.();
                    } catch {}
                  },
                }
              : undefined
          }
        />
      );
    }

    // Auto-completed banner
    // Auto-completed banner: show a richer card whenever either the key or the
    // canonical auto-complete copy is present. At this stage, steer users to
    // support rather than opening another review entrypoint.
    if (key === 'event_auto_completed_v1' || lower.startsWith('this event has been automatically marked as completed')) {
      return (
        <SystemCard
          icon="✓"
          tone="neutral"
          title={t('system.eventAutoCompletedTitle', 'Booking completed automatically')}
          subtitle={t(
            'system.eventAutoCompleted',
            'This event has been automatically marked as completed. If you still need help, you can contact support from this conversation.',
          )}
          primaryAction={
            typeof window !== 'undefined'
              ? {
                  label: t('system.getSupport', 'Get support'),
                  variant: 'secondary',
                  onClick: () => {
                    try {
                      window.location.href = '/faq';
                    } catch {}
                  },
                }
              : undefined
          }
        />
      );
    }

    // Day-of reminder: "Event is today: YYYY-MM-DD. …"
    // Render as a card so it matches other post-event/pre-event system messages.
    if (lower.startsWith('event is today:')) {
      const title = t('system.eventTodayTitle', 'Event today');
      let subtitle = content;
      try {
        // Strip the leading "Event is today: YYYY-MM-DD." prefix for a cleaner subtitle
        const m = content.match(/^Event is today:\s*\d{4}-\d{2}-\d{2}\.\s*(.*)$/i);
        if (m && m[1]) {
          subtitle = m[1];
        }
      } catch {
        subtitle = content;
      }
      return (
        <SystemCard
          icon="✓"
          tone="info"
          title={title}
          subtitle={subtitle}
          primaryAction={
            onOpenEventPrepFromSystem
              ? {
                  label: t('system.viewEventDetails', 'Event details'),
                  variant: 'secondary',
                  onClick: () => {
                    try {
                      onOpenEventPrepFromSystem?.();
                    } catch {}
                  },
                }
              : undefined
          }
        />
      );
    }

    // Pre‑event reminders: "Event in 7 days: YYYY‑MM‑DD." / "Event in 3 days: …"
    // These are emitted with system_key `event_reminder:7d` / `event_reminder:3d`
    // but also include a stable text prefix, so support both.
    if (
      key.startsWith('event_reminder:') ||
      lower.startsWith('event in 7 days:') ||
      lower.startsWith('event in 3 days:')
    ) {
      let title = t('system.eventReminderTitle', 'Event reminder');
      if (lower.startsWith('event in 7 days:') || key.endsWith(':7d')) {
        title = t('system.eventIn7DaysTitle', 'Event in 7 days');
      } else if (lower.startsWith('event in 3 days:') || key.endsWith(':3d')) {
        title = t('system.eventIn3DaysTitle', 'Event in 3 days');
      }
      let subtitle = content;
      try {
        const m = content.match(/^Event in\s+\d+\s+days:\s*\d{4}-\d{2}-\d{2}\.\s*(.*)$/i);
        if (m && m[1]) {
          subtitle = m[1];
        }
      } catch {
        subtitle = content;
      }
      return (
        <SystemCard
          icon="✓"
          tone="info"
          title={title}
          subtitle={subtitle}
        />
      );
    }

    // Tombstone: backend-deleted message (safety net; main path handled in GroupRenderer)
    const isDeletionKey = key.startsWith('message_deleted');
    const isDeletionContent =
      lower === 'this message was deleted.' || lower === 'this message has been deleted';
    if (isDeletionKey || isDeletionContent) {
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="text-[12px] italic text-gray-600">
            This message has been deleted
          </div>
        </div>
      );
    }

    // Dispute opened banner
    if (
      key.startsWith('dispute_opened_v1') ||
      lower.startsWith('a problem has been reported for this event')
    ) {
      // Only show this banner to the user who reported the problem. The message
      // still exists in the thread for auditing/admins, but the counterparty
      // does not see an inline complaint marker (nor the generic system line).
      const viewerId = Number((user as any)?.id || 0);
      const senderId = Number((msg as any)?.sender_id || 0);
      if (viewerId && senderId && viewerId !== senderId) return null;
      return (
        <SystemCard
          icon="⚠️"
          tone="warning"
          title={t('system.disputeOpenedTitle', 'Problem reported')}
          subtitle={t(
            'system.disputeOpened',
            'A problem has been reported for this event. Our team will review the details. Messages in this chat are still visible to both parties.',
          )}
        />
      );
    }

    // Review invite for client
    // Match either the structured system_key or the canonical invite copy.
    if (
      key === 'review_invite_client_v1' ||
      lower.startsWith('how was your event with') ||
      lower.startsWith('how was your event?')
    ) {
      return (
        <SystemCard
          icon="★"
          tone="neutral"
          title={t('system.reviewInviteTitle', 'How was your event?')}
          subtitle={
            content ||
            t(
              'system.reviewInviteBody',
              'Leave a rating and short review to help others book with confidence.',
            )
          }
          primaryAction={
            onOpenReviewFromSystem
              ? {
                  label: t('system.leaveReview', 'Leave review'),
                  variant: 'primary',
                  onClick: () => {
                    try {
                      onOpenReviewFromSystem?.();
                    } catch {}
                  },
                }
              : undefined
          }
        />
      );
    }

    // Review invite for provider (review the client)
    // Match either the structured key or the canonical invite copy.
    if (key === 'review_invite_provider_v1' || lower.startsWith('how was your experience with')) {
      const isProvider = (user?.user_type || '').toLowerCase() === 'service_provider';
      if (!isProvider) return null;
      return (
        <SystemCard
          icon="★"
          tone="neutral"
          title={t('system.reviewInviteProviderTitle', 'Review your client')}
          subtitle={content || t(
            'system.reviewInviteProviderBody',
            'Share feedback about communication, punctuality, and overall experience.',
          )}
          primaryAction={
            onOpenReviewFromSystem
              ? {
                  label: t('system.reviewClient', 'Review client'),
                  variant: 'primary',
                  onClick: () => {
                    try {
                      onOpenReviewFromSystem?.();
                    } catch {}
                  },
                }
              : undefined
          }
        />
      );
    }

    // Payment received
    if (key.includes('payment_received') || content.toLowerCase().includes('payment received')) {
      // Extract a receipt link from the content. Prefer absolute; fall back to
      // relative and normalize to absolute using apiUrl.
      const abs = content.match(absUrlRegex)?.[1] || null;
      const rel = abs ? null : (content.match(relUrlRegex)?.[1] || null);
      const receiptUrl = abs || (rel ? apiUrl(rel) : null);
      const isProvider = (user?.user_type || '').toLowerCase() === 'service_provider';
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="text-[12px] text-gray-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
            {t('system.paymentReceived', 'Payment received. Your booking is confirmed.')}
            {!isProvider && receiptUrl ? (
              <>
                {' '}
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="underline text-green-700">
                  {t('system.viewReceipt', 'View receipt')}
                </a>
              </>
            ) : null}
            {isProvider ? (
              <>
                {' '}
                <a href={'/dashboard/provider/payouts'} className="underline text-green-700">
                  {t('system.viewPayoutDetails', 'View payout details')}
                </a>
              </>
            ) : null}
          </div>
        </div>
      );
    }

    // Client-only receipt link (server emits with system_key payment_receipt_link:*)
    if (key.includes('payment_receipt_link')) {
      const abs = content.match(absUrlRegex)?.[1] || null;
      const rel = abs ? null : (content.match(relUrlRegex)?.[1] || null);
      const receiptUrl = abs || (rel ? apiUrl(rel) : null);
      // Only render a link if we have a URL
      if (!receiptUrl) return null;
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="text-[12px] text-gray-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="underline text-green-700">
              {t('system.viewReceipt', 'View receipt')}
            </a>
          </div>
        </div>
      );
    }

    // Provider-only payout notice (server emits with system_key payment_provider_notice:*)
    if (key.includes('payment_provider_notice')) {
      // Only providers should see this line; clients ignore it to avoid flicker
      const isProvider = (user?.user_type || '').toLowerCase() === 'service_provider';
      if (!isProvider) return null;
      return (
        <div className="my-2 w-full flex justify-center">
          <div className="text-[12px] text-gray-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
            {t('system.providerPaidNotice', 'Client paid in full — first payout (50%) processing.')}
            {' '}
            <a href={'/dashboard/provider/payouts'} className="underline text-green-700">
              {t('system.viewPayoutDetails', 'View payout details')}
            </a>
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
                <div className="text-sm font-semibold">Your request is in!</div>
                <div className="text-xs text-gray-600">Expect a quote soon</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-200 pl-2 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50"
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
                <SafeImage
                  alt=""
                  src={cover}
                  width={56}
                  height={56}
                  className="ml-auto h-14 w-14 rounded-lg object-cover"
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
