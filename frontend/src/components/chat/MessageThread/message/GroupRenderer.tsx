// components/chat/MessageThread/message/GroupRenderer.tsx
import * as React from 'react';
import Bubble from './Bubble';
import BubbleStatus from './BubbleStatus';
import Attachments from './Attachments';
import Album from './Album';
import ThreadMessageGroup from '../../ThreadMessageGroup';
import NewMessagesDivider from './NewMessagesDivider';
import SafeImage from '@/components/ui/SafeImage';
import { isImage, isVideo, isAudio } from '../utils/media';
import type { MessageGroup } from '../grouping/types';
import { format } from 'date-fns';
import SystemMessage from './SystemMessage';
import ImagePreviewModal from '@/components/ui/ImagePreviewModal';
import QuoteBubble from '@/components/chat/QuoteBubble';
import { safeParseDate } from '@/lib/chat/threadStore';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import MessageActions from './MessageActions';

export type GroupRendererProps = {
  group: MessageGroup;
  myUserId: number;
  bookingRequestId?: number;
  userType?: 'client' | 'service_provider' | string;
  clientName?: string | null;
  clientAvatarUrl?: string | null;
  artistName?: string | null;
  artistAvatarUrl?: string | null;
  newMessageAnchorId?: number | null;
  /** Message id to briefly highlight (jump target) */
  highlightId?: number | null;
  quotesById?: Record<number, any>;
  ensureQuoteLoaded?: (id: number) => void;
  onMediaLoad?: () => void;
  onToggleReaction?: (id: number, emoji: string, hasNow: boolean) => void;
  onPayNow?: (quote: any) => void;
  onDecline?: (quote: any) => void;
  onOpenDetailsPanel?: () => void;
  onOpenQuote?: () => void;
  onRequestNewQuote?: () => void;
  disableRequestNewQuote?: boolean;
  // Global gallery across thread: images and videos only
  galleryItems?: { src: string; type: 'image' | 'video' }[];
  onReplyToMessage?: (target: { id: number; sender_type?: string; content: string }) => void;
  onDeleteMessage?: (id: number) => void;
  onRetryMessage?: (id: number) => void;
  /** Jump handler invoked when user clicks the reply preview */
  onJumpToMessage?: (id: number) => void;
  /** Optional resolver to derive a local preview when backend did not include one */
  resolveReplyPreview?: (id: number) => string | null | undefined;
  /** Optional global paid state for the thread */
  isPaid?: boolean;
};

export default function GroupRenderer({
  group,
  myUserId,
  bookingRequestId,
  userType = 'client',
  clientName = 'Client',
  clientAvatarUrl = null,
  artistName = 'Service Provider',
  artistAvatarUrl = null,
  newMessageAnchorId = null,
  highlightId = null,
  quotesById,
  ensureQuoteLoaded,
  onMediaLoad,
  onToggleReaction,
  onPayNow,
  onDecline,
  onOpenDetailsPanel,
  onOpenQuote,
  onRequestNewQuote,
  disableRequestNewQuote,
  galleryItems = [],
  onReplyToMessage,
  onDeleteMessage,
  onRetryMessage,
  onJumpToMessage,
  resolveReplyPreview,
  isPaid = false,
}: GroupRendererProps) {
  if (!group || !Array.isArray(group.messages) || group.messages.length === 0) return null;

  // Lightbox state (scoped to this group renderer instance)
  const [lbOpen, setLbOpen] = React.useState(false);
  const [lbItems, setLbItems] = React.useState<{ src: string; type: 'image' | 'video' }[]>([]);
  const [lbIndex, setLbIndex] = React.useState<number>(0);
  const [lbInitialIndex, setLbInitialIndex] = React.useState<number>(0);
  const [lbInitialTime, setLbInitialTime] = React.useState<number | undefined>(undefined);
  const [lbAutoPlay, setLbAutoPlay] = React.useState<boolean>(false);
  const openLightbox = React.useCallback((startUrl: string, gallery: { src: string; type: 'image' | 'video' }[], state?: { time?: number; play?: boolean }) => {
    const list = Array.isArray(gallery) && gallery.length ? gallery : [];
    if (!list.length) return;
    const idx = Math.max(0, list.findIndex((it) => it.src === startUrl));
    setLbItems(list);
    setLbIndex(idx === -1 ? 0 : idx);
    setLbInitialIndex(idx === -1 ? 0 : idx);
    setLbInitialTime(state?.time);
    setLbAutoPlay(Boolean(state?.play));
    setLbOpen(true);
  }, []);

  // Any quote present FOR THIS THREAD? Used to hide "Create quote" CTA in the system card
  // Previously this checked the global quotes cache, which could contain quotes from other threads
  // and incorrectly hide the button. Scope to the current bookingRequestId.
  const hasAnyQuote = React.useMemo(() => {
    try {
      const qb = quotesById || {};
      const values = Object.values(qb) as any[];
      if (!values.length) return false;
      const brId = Number(bookingRequestId || 0);
      if (!Number.isFinite(brId) || brId <= 0) return false;
      return values.some((q) => Number((q as any)?.booking_request_id) === brId);
    } catch {
      return false;
    }
  }, [quotesById, bookingRequestId]);

  // Pre-compute any quote IDs that are referenced but missing in cache
  const missingQuoteIds = React.useMemo(() => {
    try {
      const set = new Set<number>();
      const qb = quotesById || {};
      for (const m of group.messages as any[]) {
        const qid = Number(m?.quote_id || 0);
        if (qid > 0 && !qb[qid]) set.add(qid);
      }
      return Array.from(set);
    } catch {
      return [] as number[];
    }
  }, [group, quotesById]);

  // Trigger quote loads outside of render to avoid setState during render warnings
  React.useEffect(() => {
    if (!ensureQuoteLoaded || missingQuoteIds.length === 0) return;
    for (const id of missingQuoteIds) {
      try { ensureQuoteLoaded(id); } catch {}
    }
  }, [ensureQuoteLoaded, missingQuoteIds]);

  const first = group.messages[0];
  const fromSelf = Number(first?.sender_id) === Number(myUserId);
  const showHeader = false; // header hidden to match WhatsApp style
  const dayLabel = group.showDayDivider ? format(safeParseDate(first.timestamp), 'EEE, d LLL') : null;
  const showNewDivider = newMessageAnchorId != null && group.messages.some((m: any) => Number(m.id) === newMessageAnchorId);

  const header = showHeader ? (
    <div className="flex items-center mb-1">
      {userType === 'service_provider' ? (
        clientAvatarUrl ? (
          <SafeImage src={clientAvatarUrl} alt="Client avatar" width={20} height={20} className="h-5 w-5 rounded-full object-cover mr-2" />
        ) : (
          <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
            {(clientName || 'C').charAt(0)}
          </div>
        )
      ) : artistAvatarUrl ? (
        <SafeImage src={artistAvatarUrl} alt="Service Provider avatar" width={20} height={20} className="h-5 w-5 rounded-full object-cover mr-2" />
      ) : (
        <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-medium mr-2">
          {(artistName || 'S').charAt(0)}
        </div>
      )}
      <span className="text-xs text-gray-600">{userType === 'service_provider' ? (clientName || 'Client') : (artistName || 'Service Provider')}</span>
    </div>
  ) : null;

  return (
    <ThreadMessageGroup dayLabel={dayLabel}>
      <div className="flex flex-col w-full">
        {showNewDivider && <NewMessagesDivider />}
        {header}
        {/* Coalesce image-only sequences into album blocks */}
        {(() => {
          const out: Array<{ type: 'album'; items: { id: number; url: string }[] } | { type: 'msg'; m: any }> = [];
          const isImageOnly = (mm: any) => {
            const url = mm?.attachment_url as string | undefined;
            const meta = (mm as any)?.attachment_meta as { content_type?: string } | undefined;
            const ct = typeof meta?.content_type === 'string' ? meta.content_type.toLowerCase() : '';
            const byCtImg = ct.startsWith('image/');
            const img = isImage(url) || byCtImg;
            if (!img) return false;
            const text = String(mm?.content || '').trim().toLowerCase();
            return !text || text === 'attachment' || text === '[attachment]' || text === '[image]' || text === 'image';
          };
          for (let i = 0; i < group.messages.length; ) {
            const mm = group.messages[i];
            if (isImageOnly(mm)) {
              const block: any[] = [mm];
              let j = i + 1;
              while (j < group.messages.length && isImageOnly(group.messages[j])) { block.push(group.messages[j]); j += 1; }
              if (block.length > 1) {
                const items = block.map((b) => ({ id: b.id, url: b.attachment_url as string }));
                out.push({ type: 'album', items });
              } else {
                out.push({ type: 'msg', m: mm });
              }
              i = j;
            } else {
              out.push({ type: 'msg', m: mm });
              i += 1;
            }
          }

          return out.map((entry, idx) => {
            if (entry.type === 'album') {
              const fromSelfAlbum = Number(first?.sender_id) === Number(myUserId);
              return (
                <div key={`album-${idx}`} className={`my-2 ${fromSelfAlbum ? 'ml-auto pr-2' : 'mr-auto pl-2'}`}>
                  <Album
                    items={entry.items}
                    onMediaLoad={onMediaLoad}
                    onOpenItem={(i) => {
                      try {
                        const url = entry.items[i]?.url;
                        if (url) openLightbox(url, galleryItems);
                      } catch {}
                    }}
                  />
                </div>
              );
            }

            const m = entry.m;
          const fromSelfMsg = Number(m?.sender_id) === Number(myUserId);
          const url = m?.attachment_url as string | undefined;
          // Detect media by extension and, if available, by content-type metadata
          const meta = (m as any)?.attachment_meta as { content_type?: string; original_filename?: string } | undefined;
          // Normalize content-type and prefer it over extension when present
          const ctRaw = typeof meta?.content_type === 'string' ? meta.content_type.toLowerCase() : '';
          const ct = ctRaw.split(';')[0].trim();
          const byCtImg = ct.startsWith('image/');
          const byCtVid = ct.startsWith('video/');
          const byCtAud = ct.startsWith('audio/');
          const hasImage = byCtImg || isImage(url);
          const hasVideo = byCtVid || (!byCtAud && isVideo(url));
          const hasAudio = byCtAud || (!byCtVid && isAudio(url));
          const text = String(m?.content || '');
          const isSystem = String(m?.message_type || '').toUpperCase() === 'SYSTEM';
          const isInquiryCard = text.includes('inquiry_sent_v1');
          const quoteId = Number(m?.quote_id || 0);

          // System message line (rich renderer)
          if (isSystem || isInquiryCard) {
            try {
              const content = String(m?.content || '');
              // For service providers, suppress the booking-details card while keeping
              // the message in the list so parsing and side-panel still work.
              if (userType === 'service_provider' && content.startsWith(BOOKING_DETAILS_PREFIX)) {
                return null;
              }
            } catch {}
            return (
              <SystemMessage
                key={String(m?.id ?? (m as any)?.client_request_id ?? (m as any)?.clientId)}
                msg={m}
                hasAnyQuote={hasAnyQuote}
                onOpenDetails={onOpenDetailsPanel}
                onOpenQuote={onOpenQuote}
              />
            );
          }

          // Quote block (render if loaded, else show placeholder; effect above requests loads)
          if (quoteId > 0) {
            const q = quotesById?.[quoteId];
            const isClientView = String(userType).toLowerCase() === 'client';
            return (
              <div key={String(m?.id ?? (m as any)?.client_request_id ?? (m as any)?.clientId)} className="my-2 w-full flex justify-center">
                {q ? (
                  <>
                    <QuoteBubble
                      quoteId={quoteId}
                      description={(q?.services?.[0]?.description as string) || ''}
                    price={Number(q?.services?.[0]?.price || 0)}
                    soundFee={Number(q?.sound_fee || 0)}
                    travelFee={Number(q?.travel_fee || 0)}
                    accommodation={(q?.accommodation as string) || undefined}
                    discount={Number(q?.discount) || undefined}
                    subtotal={Number(q?.subtotal || 0)}
                    total={Number(q?.total || 0)}
                    providerSubtotalPreview={Number((q as any)?.provider_subtotal_preview ?? NaN)}
                    bookaFeePreview={Number((q as any)?.booka_fee_preview ?? NaN)}
                    bookaFeeVatPreview={Number((q as any)?.booka_fee_vat_preview ?? NaN)}
                    clientTotalPreview={Number((q as any)?.client_total_preview ?? NaN)}
                    status={(q?.status === 'accepted') ? 'Accepted' : (q?.status === 'rejected') ? 'Rejected' : (q?.status === 'expired') ? 'Expired' : 'Pending'}
                    isClientView={String(userType).toLowerCase() === 'client'}
                    isPaid={Boolean(isPaid)}
                    expiresAt={(q?.expires_at as string) || undefined}
                    providerName={artistName || 'Service Provider'}
                    providerAvatarUrl={artistAvatarUrl || undefined}
                    onPayNow={onPayNow ? (() => onPayNow(q)) : undefined}
                    onDecline={onDecline ? (() => onDecline(q)) : undefined}
                    onAskQuestion={onRequestNewQuote}
                    disableRequestNewQuote={Boolean(disableRequestNewQuote)}
                  />
                    {/* Removed artist guidance banner to keep thread clean */}
                  </>
                ) : (
                  <div className="text-[12px] text-gray-600">Loading quote…</div>
                )}
              </div>
            );
          }
          return (
            <div key={String(m?.id ?? (m as any)?.client_request_id ?? (m as any)?.clientId)} className={`my-1 flex ${fromSelfMsg ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
              {(() => {
                const raw = String(m?.status || '').toLowerCase();
                const failed = raw === 'failed' || raw === 'error';
                const queued = raw === 'queued';
                const sending = raw === 'sending';
                const read = Boolean(m?.is_read || m?.read_at);
                const delivered = Boolean(m?.is_delivered || m?.delivered_at);
                const metaState: any = failed ? 'error' : read ? 'read' : delivered ? 'delivered' : (sending || queued) ? 'sending' : 'sent';
                const metaColor = metaState === 'error' ? 'text-red-500' : 'text-[#3B4A54]';
                const renderMeta = () => (
                  <div className={`flex items-center text-[11px] leading-[12px] tracking-[0.01em] ${metaColor}`}>
                    <span>{format(safeParseDate(m.timestamp), 'HH:mm')}</span>
                    {fromSelfMsg ? (
                      <span className="ml-0.5 inline-flex">
                        <BubbleStatus state={metaState} />
                      </span>
                    ) : null}
                  </div>
                );
                const isDeleted = Boolean((m as any)?._deleted);
                if (isDeleted) {
                  return (
                    <Bubble fromSelf={fromSelfMsg}>
                      <div className="text-[12px] italic text-gray-600">This message has been deleted</div>
                    </Bubble>
                  );
                }
                const renderText = () => {
                  if (!text) return null;
                  return <div className="text-[13px] leading-snug break-words">{text}</div>;
                };
                const hasMedia = hasImage || hasVideo || hasAudio;

                const messageBody = (() => {
                  // Optional reply header (if this message is a reply to another)
                  const replyHeader = (() => {
                    const rid = Number((m as any)?.reply_to_message_id || 0);
                    let rtext = String((m as any)?.reply_to_preview || '').trim();
                    if (!rtext && Number.isFinite(rid) && rid > 0 && typeof resolveReplyPreview === 'function') {
                      try { rtext = String(resolveReplyPreview(rid) || '').trim(); } catch {}
                    }
                    if (!rid && !rtext) return null;
                    const handle = () => { if (rid > 0) try { onJumpToMessage?.(rid); } catch {} };
                    const onKey = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle(); }
                    };
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={handle}
                        onKeyDown={onKey}
                        aria-label="View replied message"
                        title="View replied message"
                        className="mb-1 text-[12px] text-gray-700 bg-gray-100 rounded-lg px-2 py-1 border-l-4 border-gray-300 max-w-[380px] cursor-pointer hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        {rtext || 'View replied message'}
                      </div>
                    );
                  })();
                  // Fallback label for non-media attachments (e.g., PDFs)
                  const fileLabel = (!hasMedia && url) ? (meta?.original_filename || 'Attachment') : null;
                  // ConversationList-style fallback when content is missing but we still want a visible line
                  const fallbackText = (() => {
                    const rawText = String(text || '').trim();
                    if (rawText) return rawText;
                    // Collapse booking details to a safe label
                    if ((m as any)?.content && String((m as any).content).startsWith(BOOKING_DETAILS_PREFIX)) return 'New Booking Request';
                    // Prefer preview label if present
                    const prev = String((m as any)?.preview_label || '').trim();
                    if (prev) return prev;
                    // Derive basic media labels from metadata when URL missing
                    if ((meta?.content_type || '').toLowerCase().startsWith('audio/')) return 'Voice note';
                    if ((meta?.content_type || '').toLowerCase().startsWith('image/')) return 'Photo';
                    if ((meta?.content_type || '').toLowerCase().startsWith('video/')) return 'Video';
                    const qid = Number((m as any)?.quote_id || 0);
                    if (qid > 0) return 'Quote';
                    return '';
                  })();
                  if (!hasMedia) {
                    return (
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 text-[#111b21]">
                          {replyHeader}
                          {renderText() || (fallbackText ? (
                            <div className="text-[13px] leading-snug break-words">{fallbackText}</div>
                          ) : null)}
                          {fileLabel ? (
                            <div className="mt-1">
                              <Attachments fileLabel={fileLabel} fileUrl={url as string} />
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0">{renderMeta()}</div>
                      </div>
                    );
                  }

                  const blocks: React.ReactNode[] = [];
                  const textNode = renderText();
                  const rid = Number((m as any)?.reply_to_message_id || 0);
                  let rtext = String((m as any)?.reply_to_preview || '').trim();
                  if (!rtext && Number.isFinite(rid) && rid > 0 && typeof resolveReplyPreview === 'function') {
                    try { rtext = String(resolveReplyPreview(rid) || '').trim(); } catch {}
                  }
                  if (rid || rtext) {
                    const handle = () => { if (rid > 0) try { onJumpToMessage?.(rid); } catch {} };
                    const onKey = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle(); }
                    };
                    blocks.push(
                      <div
                        key="reply"
                        role="button"
                        tabIndex={0}
                        onClick={handle}
                        onKeyDown={onKey}
                        aria-label="View replied message"
                        title="View replied message"
                        className="mb-1 text-[12px] text-gray-700 bg-gray-100 rounded-lg px-2 py-1 border-l-4 border-gray-300 max-w-[380px] cursor-pointer hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        {rtext || 'View replied message'}
                      </div>
                    );
                  }
                  const shouldShowTextNode = Boolean(textNode) && !(hasImage || hasVideo || hasAudio);
                  if (shouldShowTextNode) {
                    blocks.push(
                      <div key="text" className="mb-2">
                        {textNode}
                      </div>
                    );
                  }

                  if (hasImage || hasVideo) {
                    blocks.push(
                  <div
                    key="media"
                    className="relative inline-block"
                  >
                        <Attachments
                          imageUrl={hasImage ? url as string : undefined}
                          videoUrl={hasVideo ? url as string : undefined}
                          audioUrl={undefined}
                          progressPct={typeof (m as any)?._upload_pct === 'number' ? (m as any)._upload_pct : undefined}
                          onMediaLoad={onMediaLoad}
                          onOpenImage={hasImage ? (() => openLightbox(url as string, galleryItems)) : undefined}
                          onOpenVideo={hasVideo ? ((s) => openLightbox(url as string, galleryItems, { time: s?.time, play: s?.playing })) : undefined}
                        />
                        <div className="pointer-events-none absolute bottom-2 right-2 drop-shadow" aria-hidden>
                          {renderMeta()}
                        </div>
                      </div>
                    );
                  } else if (hasAudio) {
                    blocks.push(
                      <div key="media" style={{ width: 'min(420px, 62vw)' }}>
                        <Attachments
                          imageUrl={undefined}
                          videoUrl={undefined}
                          audioUrl={url as string}
                          progressPct={typeof (m as any)?._upload_pct === 'number' ? (m as any)._upload_pct : undefined}
                          onMediaLoad={onMediaLoad}
                        />
                      </div>
                    );
                  blocks.push(
                      <div key="meta" className="mt-1 flex justify-end">
                        {renderMeta()}
                      </div>
                    );
                  }

                  return <>{blocks}</>;
                })();

                  return (
                    <Bubble id={`msg-${String(m?.id ?? (m as any)?.client_request_id ?? (m as any)?.clientId)}`} fromSelf={fromSelfMsg} highlight={Number(m.id) === Number(highlightId)}>
                    {/* Inline actions trigger + popover */}
                    {(() => {
                      const mySet = new Set<string>((m?.my_reactions || []) as string[]);
                      return (
                        <MessageActions
                          messageId={Number(m.id)}
                          fromSelf={fromSelfMsg}
                          text={text}
                          linkToCopy={!text && url ? (url as string) : undefined}
                          myReactions={mySet}
                          onToggleReaction={(id, emoji, hasNow) => onToggleReaction?.(id, emoji, hasNow)}
                          onReply={(id, snippet) => {
                            try { onReplyToMessage?.({ id, sender_type: m?.sender_type as any, content: snippet }); } catch {}
                          }}
                          onDelete={(id) => { try { onDeleteMessage?.(id); } catch {} }}
                        />
                      );
                    })()}
                    {messageBody}
                    {/* Retry affordance for failed sends */}
                    {(() => {
                      const raw = String(m?.status || '').toLowerCase();
                      const failed = raw === 'failed' || raw === 'error';
                      if (!failed || Number.isNaN(Number(m?.id))) return null;
                      return (
                        <div className="mt-1 flex justify-end">
                          <button
                            type="button"
                            className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-600 bg-white hover:bg-red-50"
                            onClick={() => { try { onRetryMessage?.(Number(m.id)); } catch {} }}
                          >
                            Retry
                          </button>
                        </div>
                      );
                    })()}
                    {(() => {
                      const agg = (m?.reactions || {}) as Record<string, number>;
                      const mine = new Set<string>((m?.my_reactions || []) as string[]);
                      const emojis = Object.keys(agg);
                      if (!emojis.length) return null;
                      return (
                        <div className="mt-1 flex gap-1">
                          {emojis.map((e) => {
                            const count = agg[e] || 0;
                            const active = mine.has(e);
                            return (
                              <button
                                key={e}
                                type="button"
                                className={`px-2 py-0.5 text-[11px] rounded-full border ${active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                onClick={() => onToggleReaction?.(m.id, e, active)}
                              >
                                {e} {count}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </Bubble>
                );
              })()}
            </div>
          );
          });
        })()}
      </div>
      {/* Lightbox modal for images within this group */}
      <ImagePreviewModal
        open={lbOpen}
        src={(lbItems[lbIndex]?.src || '')}
        items={lbItems}
        index={lbIndex}
        onIndexChange={setLbIndex}
        onClose={() => setLbOpen(false)}
        initialIndex={lbInitialIndex}
        initialTime={lbInitialTime}
        autoPlay={lbAutoPlay}
        onCloseWithState={(resume) => {
          if (!resume || !resume.src) return;
          try {
            const targetPath = new URL(resume.src, window.location.origin).pathname;
            const nodes = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            for (const el of nodes) {
              try {
                const elSrc = el.currentSrc || el.src || '';
                if (!elSrc) continue;
                const elPath = new URL(elSrc, window.location.origin).pathname;
                if (elPath === targetPath) {
                  // Seek and optionally resume
                  if (Number.isFinite(resume.time)) {
                    try { el.currentTime = Math.max(0, resume.time); } catch {}
                  }
                  // Always pause inline video after closing the gallery (requested behavior)
                  try { el.pause(); } catch {}
                  break;
                }
              } catch { continue; }
            }
          } catch {}
        }}
      />
    </ThreadMessageGroup>
  );
}
