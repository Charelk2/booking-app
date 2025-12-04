// /src/components/chat/MessageThread/ConversationList.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  memo,
} from "react";
import { FixedSizeList as List, areEqual } from "react-window";
import clsx from "clsx";
import SafeImage from "@/components/ui/SafeImage";
import type { BookingRequest, User } from "@/types";
import { counterpartyAvatar, counterpartyLabel } from "@/lib/names";
import { getMessagesForBookingRequest } from "@/lib/api";
import {
  hasThreadCacheAsync,
  writeThreadCache,
  readThreadCache,
} from "@/lib/chat/threadCache";
import { safeParseDate } from "@/lib/dates";
import { isImage, isVideo, isAudio } from "./utils/media";
import { BOOKING_DETAILS_PREFIX } from "@/lib/constants";
import {
  CameraIcon,
  VideoCameraIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";

// ───────────────────────────────────────────────────────────────────────────────
// Types

type ConversationListProps = {
  threads: BookingRequest[];
  selectedThreadId: number | null;
  onSelect: (threadId: number) => void;
  currentUser?: User | null;
  query?: string;
  height?: number;
};

type ConversationTag =
  | "EVENT"
  | "VIDEO"
  | "QUOTE"
  | "INQUIRY"
  | "BOOKA"
  | "SUPPLIER";

type HighlightParts = {
  before: string;
  match: string;
  after: string;
  has: boolean;
};

type ConversationRow = {
  id: number;
  name: string;
  nameParts: HighlightParts;
  previewParts: HighlightParts;
  avatarUrl: string | null;
  timestamp: string;
  rawTimestamp: string | null;
  unreadCount: number;
  isUnread: boolean;
  tags: ConversationTag[];
  isBookaModeration: boolean;
  supplierProgram?: string | null;
  attachmentType?: "photo" | "video" | "voice" | null;
  attachmentLabel?: string | null;
};

// Only the fields we read from react-window's items-rendered callback.
// This avoids importing ListOnItemsRenderedProps, fixing TS2709.
type ItemsRendered = {
  visibleStartIndex: number;
  visibleStopIndex: number;
};

// Narrow ref type: only the methods we actually call.
type FixedListRef = {
  scrollTo: (offset: number) => void;
  scrollToItem: (
    index: number,
    align?: "auto" | "smart" | "center" | "end" | "start"
  ) => void;
} | null;

// ───────────────────────────────────────────────────────────────────────────────
// Helpers

function highlight(text: string, query: string): HighlightParts {
  const safeText = text ?? "";
  const q = (query || "").trim().toLowerCase();
  if (!q) return { before: safeText, match: "", after: "", has: false };

  const lower = safeText.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return { before: safeText, match: "", after: "", has: false };

  return {
    before: safeText.slice(0, idx),
    match: safeText.slice(idx, idx + q.length),
    after: safeText.slice(idx + q.length),
    has: true,
  };
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const dt = safeParseDate(iso);
    if (Number.isNaN(dt.getTime())) return "";
    const now = new Date();

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayStart = startOfDay(now);
    const dayStart = startOfDay(dt);
    const diffDays = Math.round(
      (todayStart.getTime() - dayStart.getTime()) / 86_400_000
    );

    if (diffDays === 0) {
      return dt.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) {
      return dt.toLocaleDateString(undefined, { weekday: "long" });
    }
    return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function normalizeUnread(
  raw: unknown,
  fallback: boolean
): { isUnread: boolean; count: number } {
  const num = Number(raw ?? 0);
  if (Number.isFinite(num) && num > 0)
    return { isUnread: true, count: Math.floor(num) };
  return { isUnread: fallback, count: fallback ? 1 : 0 };
}

function detectTags(
  thread: BookingRequest,
  previewLower: string,
  isPersonalizedVideo: boolean,
  paidOrConfirmed: boolean
): ConversationTag[] {
  const tags: ConversationTag[] = [];
  const isSupplierInvite = /preferred sound supplier/i.test(previewLower);

  const showQuote = (() => {
    const state = String(((thread as any).thread_state ?? "") || "").toLowerCase();
    if (state === "quoted") return true;
    if ((thread as any).accepted_quote_id) return true;
    // Prefer explicit preview key provided by the server
    const pk = String(((thread as any).last_message_preview_key || (thread as any).preview_key || '') || '').toLowerCase();
    if (pk === 'quote') return true;
    // Prefer preview text which already normalizes system/user messages server-side
    const text = ((thread as any).last_message_content || "").toString();
    // Match common phrasing and the server's stable preview label for quote messages
    // e.g., "Artist sent a quote", "Quote sent", "New quote", and "Quote from <name>"
    return /(sent a quote|quote sent|provided a quote|new quote|^quote\b|^quote from\b)/i.test(text);
  })();

  const showInquiry = (() => {
    // Inquiry is suppressed once the event is paid/confirmed, for PV threads,
    // or for supplier invites. It is allowed to co-exist with QUOTE so users
    // can still see there is an open inquiry card alongside a quote.
    if (paidOrConfirmed || isPersonalizedVideo || isSupplierInvite) {
      return false;
    }
    if ((thread as any).has_inquiry_card === true) {
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(`inquiry-thread-${thread.id}`, "1");
        }
      } catch {}
      return true;
    }
    try {
      if (
        typeof window !== "undefined" &&
        localStorage.getItem(`inquiry-thread-${thread.id}`)
      )
        return true;
    } catch {}
    return false;
  })();

  if (isSupplierInvite) tags.push("SUPPLIER");
  if (paidOrConfirmed && !isPersonalizedVideo) tags.push("EVENT");
  if (isPersonalizedVideo) tags.push("VIDEO");
  if (!tags.includes("EVENT") && !tags.includes("VIDEO") && showQuote)
    tags.push("QUOTE");
  if (
    !tags.includes("EVENT") &&
    !tags.includes("VIDEO") &&
    !tags.includes("QUOTE") &&
    showInquiry
  )
    tags.push("INQUIRY");

  return tags;
}

function computeRow(
  thread: BookingRequest,
  currentUser: User | null | undefined,
  queryLower: string
): ConversationRow {
  const nameFallback = (thread as any)?.counterparty_label as string | undefined;
  const counterpartyName = counterpartyLabel(thread, currentUser, nameFallback) || "";
  const avatar = counterpartyAvatar(
    thread,
    currentUser,
    (thread as any)?.counterparty_avatar_url ?? null
  );

  const timestamp =
    (thread.last_message_timestamp ||
      thread.updated_at ||
      thread.created_at) as string | null;
  const parsedTimestamp = timestamp ? safeParseDate(timestamp).toISOString() : null;

  const isPersonalizedVideo =
    String(thread.service?.service_type || "").toLowerCase() ===
    "personalized video";

  const paidOrConfirmed = (() => {
    const text = (thread.last_message_content || "").toString();
    const status = (thread.status || "").toString().toLowerCase();
    const hasAcceptedQuote = Boolean(thread.accepted_quote_id);
    const paymentMessage = /payment\s*received|booking\s*confirmed/i.test(text);
    const confirmed = [
      "confirmed",
      "completed",
      "request_confirmed",
      "request_completed",
    ].includes(status);
    let localFlag = false;
    try {
      if (typeof window !== "undefined") {
        localFlag = !!localStorage.getItem(`booking-confirmed-${thread.id}`);
      }
    } catch {}
    return paymentMessage || confirmed || hasAcceptedQuote || localFlag;
  })();

  const rawPreview =
    (thread.last_message_content ??
      thread.service?.title ??
      (thread as any).message ??
      "New Request") as string;

  const rawPreviewLower = String(rawPreview || "").toLowerCase();
  const isBookaSynthetic = Boolean((thread as any).is_booka_synthetic);
  const isBookaModeration =
    isBookaSynthetic ||
    /^\s*listing\s+approved:/i.test(rawPreviewLower) ||
    /^\s*listing\s+rejected:/i.test(rawPreviewLower) ||
    /booka\s*update\b/i.test(rawPreviewLower);

  const supplierProgram = (() => {
    if (!/preferred sound supplier/i.test(rawPreviewLower)) return null;
    const match = rawPreview.match(
      /preferred sound supplier for\s+(.+?)(?:\.|$)/i
    );
    return match ? match[1].trim() : null;
  })();

  const isUnreadFlag = (() => {
    const value = (thread as any).is_unread_by_current_user;
    return value === true || value === 1 || value === "1" || value === "true";
  })();

  const displayPreview = (() => {
    const previewText = String(rawPreview || "");
    if (/(sent a quote|quote sent)/i.test(previewText)) {
      const isArtist = currentUser?.user_type === "service_provider";
      return isArtist
        ? "You sent a quote"
        : `${counterpartyName || "Partner"} sent a quote`;
    }
    if (isBookaModeration && /\bnew\s+booking\s+request\b/i.test(rawPreviewLower)) {
      return "Booka update";
    }
    // Collapse booking details summaries to a safe label in previews
    try {
      const text = String(rawPreview || "");
      if (text.startsWith(BOOKING_DETAILS_PREFIX)) {
        return "New Booking Request";
      }
    } catch {}
    return rawPreview;
  })();

  // Attachment-aware preview via local thread cache (best-effort, no extra network)
  let attachmentType: "photo" | "video" | "voice" | null = null;
  try {
    const cached = readThreadCache(thread.id);
    const last =
      Array.isArray(cached) && cached.length ? cached[cached.length - 1] : null;
    if (
      last &&
      (last.attachment_url ||
        (last.attachment_meta && last.attachment_meta.content_type))
    ) {
      const url = (last.attachment_url || "").toString();
      const meta = (last.attachment_meta || {}) as {
        content_type?: string;
        original_filename?: string;
      };
      const ct = (meta.content_type || "").toLowerCase().split(";")[0].trim();
      const filename = (meta.original_filename || "").toString().toLowerCase();
      const looksVoice =
        filename.includes("voice") ||
        url.toLowerCase().includes("/voice") ||
        url.toLowerCase().includes("voicenote");
      if (ct.startsWith("image/") || isImage(url)) attachmentType = "photo";
      else if (ct.startsWith("video/") || isVideo(url)) attachmentType = "video";
      else if (ct.startsWith("audio/") || isAudio(url) || looksVoice)
        attachmentType = "voice";
    }
  } catch {}

  const attachmentLabel =
    attachmentType === "photo"
      ? "Photo"
      : attachmentType === "video"
      ? "Video"
      : attachmentType === "voice"
      ? "Voice note"
      : null;

  const { isUnread, count: unreadCount } = normalizeUnread(
    (thread as any).unread_count,
    isUnreadFlag
  );

  const tags = detectTags(
    thread,
    rawPreviewLower,
    isPersonalizedVideo,
    paidOrConfirmed
  );
  if (isBookaModeration && !tags.includes("BOOKA")) tags.unshift("BOOKA");

  const nameParts = highlight(counterpartyName, queryLower);
  const previewParts = highlight(displayPreview, queryLower);

  return {
    id: thread.id,
    name: counterpartyName || "-",
    nameParts,
    previewParts,
    avatarUrl: isBookaModeration ? null : avatar,
    timestamp: formatTimestamp(parsedTimestamp),
    rawTimestamp: parsedTimestamp,
    unreadCount,
    isUnread,
    tags,
    isBookaModeration,
    supplierProgram,
    attachmentType,
    attachmentLabel,
  };
}

function useConversationRows(
  threads: BookingRequest[],
  currentUser: User | null | undefined,
  query: string
): ConversationRow[] {
  return useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return threads.map((t) => computeRow(t, currentUser ?? null, q));
  }, [threads, currentUser, query]);
}

// ───────────────────────────────────────────────────────────────────────────────
// Prefetch (best-effort warming of thread cache)

const PREFETCH_INFLIGHT = new Set<number>();
const PREFETCH_QUEUE = new Set<number>();
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

async function prefetchThread(threadId: number) {
  if (!threadId || PREFETCH_INFLIGHT.has(threadId)) return;
  PREFETCH_INFLIGHT.add(threadId);
  try {
    const hasCache = await hasThreadCacheAsync(threadId);
    if (hasCache) return;
    const res = await getMessagesForBookingRequest(threadId, {
      // Bounded warmup: enough recent messages for instant paint without overloading the backend
      limit: 60,
      mode: 'full',
    });
    const items = Array.isArray((res.data as any)?.items)
      ? (res.data as any).items
      : [];
    if (items.length) writeThreadCache(threadId, items);
  } catch {
    // ignore - prefetch is best-effort
  } finally {
    PREFETCH_INFLIGHT.delete(threadId);
  }
}

function schedulePrefetch(threadId: number) {
  if (!threadId) return;
  PREFETCH_QUEUE.add(threadId);
  if (prefetchTimer != null) return;
  prefetchTimer = setTimeout(() => {
    const ids = Array.from(PREFETCH_QUEUE);
    PREFETCH_QUEUE.clear();
    prefetchTimer = null;
    ids.forEach((id) => {
      void prefetchThread(id);
    });
  }, 160);
}

// ───────────────────────────────────────────────────────────────────────────────
// Row renderer

type RowProps = {
  index: number;
  style: CSSProperties;
  data: {
    rows: ConversationRow[];
    selectedId: number | null;
    onSelect: (threadId: number) => void;
    query: string;
  };
};

function ConversationRowItem({ index, style, data }: RowProps) {
  const row = data.rows[index];
  const isActive = data.selectedId === row.id;

  const handleClick = useCallback(() => {
    data.onSelect(row.id);
  }, [data, row.id]);

  // Render
  return (
    <button
      type="button"
      style={style}
      className={clsx(
        "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150",
        "rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        isActive
          ? "bg-gray-100 ring-1 ring-gray-200"
          : "hover:bg-gray-50 active:bg-gray-100"
      )}
      onClick={handleClick}
      data-id={row.id}
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      aria-label={`${row.name}${
        row.unreadCount > 0 ? `, ${row.unreadCount} unread` : ""
      }`}
    >
      {row.avatarUrl ? (
        <SafeImage
          src={row.avatarUrl}
          alt={`${row.name} avatar`}
          width={40}
          height={40}
          sizes="40px"
          loading="lazy"
          className="h-10 w-10 flex-shrink-0 rounded-full border border-gray-200 object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-base font-semibold text-white">
          {(row.name?.charAt(0) || "•").toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div
          className={clsx(
            "flex items-center justify-between gap-2",
            row.isUnread ? "font-semibold text-gray-900" : "text-gray-700"
          )}
        >
          <span className="truncate">
            {row.nameParts.has ? (
              <>
                {row.nameParts.before}
                <span className="rounded bg-yellow-100 px-0.5 text-yellow-800">
                  {row.nameParts.match}
                </span>
                {row.nameParts.after}
              </>
            ) : (
              row.name
            )}
          </span>
          <time
            dateTime={row.rawTimestamp || undefined}
            className={clsx(
              "flex-shrink-0 text-xs",
              row.isUnread ? "font-semibold text-gray-900" : "text-gray-500"
            )}
          >
            {row.timestamp}
          </time>
        </div>

        <div className="mt-1 flex items-start justify-between gap-3 text-xs">
          <span
            className={clsx(
              "flex-1 truncate",
              row.isUnread ? "font-semibold text-gray-800" : "text-gray-600"
            )}
          >
            {/* Chips */}
            <span className="inline-flex items-center gap-1">
              {row.tags.map((chip) => (
                <span
                  key={chip}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                    chip === "BOOKA" &&
                      "border-indigo-200 bg-indigo-100 text-indigo-700",
                    chip === "SUPPLIER" &&
                      "border-purple-200 bg-purple-100 text-purple-700",
                    (chip === "EVENT" || chip === "VIDEO") &&
                      "border-emerald-200 bg-emerald-50 text-emerald-700",
                    chip === "QUOTE" &&
                      "border-amber-200 bg-amber-50 text-amber-700",
                    chip === "INQUIRY" &&
                      "border-indigo-200 bg-indigo-50 text-indigo-700"
                  )}
                >
                  {chip === "SUPPLIER" && row.supplierProgram
                    ? `${chip} · ${row.supplierProgram}`
                    : chip}
                </span>
              ))}
            </span>

            {/* Preview text + attachment */}
            <span className="ml-1 truncate whitespace-nowrap">
              {row.attachmentType && (
                <span className="mr-1 inline-flex items-center gap-1 align-text-top text-[11px] text-gray-600">
                  {row.attachmentType === "photo" && (
                    <CameraIcon className="h-3 w-3" aria-hidden />
                  )}
                  {row.attachmentType === "video" && (
                    <VideoCameraIcon className="h-3 w-3" aria-hidden />
                  )}
                  {row.attachmentType === "voice" && (
                    <MicrophoneIcon className="h-3 w-3" aria-hidden />
                  )}
                  <span>{row.attachmentLabel}</span>
                </span>
              )}
              {row.previewParts.has ? (
                <>
                  {row.previewParts.before}
                  <span className="rounded bg-yellow-100 px-0.5 text-yellow-800">
                    {row.previewParts.match}
                  </span>
                  {row.previewParts.after}
                </>
              ) : (
                row.previewParts.before
              )}
            </span>
          </span>

          {row.unreadCount > 0 && (
            <span
              aria-label={`${row.unreadCount} unread`}
              className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black px-1 text-[11px] font-semibold text-white"
            >
              {row.unreadCount > 99 ? "99+" : row.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Use react-window's areEqual to avoid unnecessary row re-renders.
const MemoizedRow = memo(ConversationRowItem, areEqual);

// ───────────────────────────────────────────────────────────────────────────────
// Main component

export default function ConversationList({
  threads,
  selectedThreadId,
  onSelect,
  currentUser,
  query = "",
  height,
}: ConversationListProps) {
  const rows = useConversationRows(threads, currentUser ?? null, query);

  // Build a stable index map for O(1) lookups and scroll-to-item.
  const idToIndex = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [rows]);

  const listRef = useRef<FixedListRef>(null);

  // Persist & restore scroll offset
  const initialScroll = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = sessionStorage.getItem("inbox:convListOffset");
      const offset = raw ? Number(raw) : 0;
      return Number.isFinite(offset) ? offset : 0;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Restore once rows mount; guard to avoid fighting user scroll
    try {
      const raw = sessionStorage.getItem("inbox:convListOffset");
      const offset = raw ? Number(raw) : 0;
      if (Number.isFinite(offset) && offset > 0) {
        listRef.current?.scrollTo(offset);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  // Track visible range to perform smart scroll-to-selection.
  const visibleRangeRef = useRef<{ start: number; stop: number }>({
    start: 0,
    stop: 0,
  });

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: ItemsRendered) => {
      const total = rows.length;
      const start = Math.max(0, visibleStartIndex);
      const stop = Math.min(total - 1, visibleStopIndex);

      // Save visible range
      visibleRangeRef.current = { start, stop };

      // Warm cache for items in view + 1 lookahead
      for (let i = start; i <= stop; i += 1) {
        const id = rows[i]?.id;
        if (id && id !== selectedThreadId) schedulePrefetch(id);
      }
      const lookahead = Math.min(total - 1, stop + 1);
      if (lookahead > stop) {
        const id = rows[lookahead]?.id;
        if (id && id !== selectedThreadId) schedulePrefetch(id);
      }

      // Persist top-most id & index (optional analytics / restore)
      try {
        const topId = rows[start]?.id;
        if (topId) {
          sessionStorage.setItem("inbox:convListTopId", String(topId));
          sessionStorage.setItem("inbox:convListTopIndex", String(start));
        }
      } catch {}
    },
    [rows, selectedThreadId]
  );

  const handleScroll = useCallback((ev: { scrollOffset: number }) => {
    try {
      sessionStorage.setItem("inbox:convListOffset", String(ev.scrollOffset));
    } catch {}
  }, []);

  // Smartly ensure the selected item is visible (without yanking the user's scroll)
  useEffect(() => {
    if (selectedThreadId == null) return;
    const idx = idToIndex.get(selectedThreadId);
    if (idx == null) return;
    const { start, stop } = visibleRangeRef.current;
    if (idx < start || idx > stop) {
      listRef.current?.scrollToItem(idx, "smart");
    }
  }, [selectedThreadId, idToIndex]);

  const listHeight =
    Number.isFinite(height) && (height ?? 0) > 0
      ? (height as number)
      : typeof window !== "undefined"
      ? Math.min(window.innerHeight * 0.7, 640)
      : 560;

  // Pre-compute stable, minimal item data to avoid re-renders.
  const itemData = useMemo(
    () => ({
      rows,
      selectedId: selectedThreadId,
      onSelect,
      query: query.trim().toLowerCase(),
    }),
    [rows, selectedThreadId, onSelect, query]
  );

  return (
    <div role="listbox" aria-label="Conversations" className="w-full">
      <List
        ref={listRef}
        className="divide-y divide-gray-100"
        height={listHeight}
        itemCount={rows.length}
        itemSize={74}
        width="100%"
        initialScrollOffset={initialScroll}
        overscanCount={8}
        onScroll={handleScroll}
        onItemsRendered={handleItemsRendered}
        itemData={itemData}
        itemKey={(index: number) => rows[index]?.id ?? index}
      >
        {MemoizedRow}
      </List>

      {rows.length === 0 && (
        <div className="flex items-center justify-center p-8 text-sm text-gray-500">
          No conversations found.
        </div>
      )}
    </div>
  );
}
