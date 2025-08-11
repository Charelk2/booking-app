// MessageThread.tsx
'use client';

import React, {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import Image from 'next/image';
import {
  getFullImageUrl,
  formatCurrency,
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';
import { DocumentIcon, DocumentTextIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import {
  Booking,
  Review,
  Message,
  MessageCreate,
  QuoteV2,
  QuoteV2Create,
} from '@/types';
import { ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  getMessagesForBookingRequest,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  createQuoteV2,
  getQuoteV2,
  acceptQuoteV2,
  declineQuoteV2,
  getBookingDetails,
  markMessagesRead,
  updateBookingRequestArtist,
  useAuth,
} from '@/lib/api';
import useOfflineQueue from '@/hooks/useOfflineQueue';
import Button from '../ui/Button';
import usePaymentModal from '@/hooks/usePaymentModal';
import QuoteBubble from './QuoteBubble';
import InlineQuoteForm from './InlineQuoteForm';
import useWebSocket from '@/hooks/useWebSocket';
import { format, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import { buildReceiptUrl } from '@/lib/utils';
import { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { createPortal } from 'react-dom';
import { t } from '@/lib/i18n';

const MemoQuoteBubble = React.memo(QuoteBubble);
const MemoInlineQuoteForm = React.memo(InlineQuoteForm);

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });


// Constants
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 20;
const MAX_TEXTAREA_LINES = 10;
const isImageAttachment = (url?: string | null) =>
  !!url && /\.(jpe?g|png|gif|webp)$/i.test(url);

// Generate an ISO timestamp in GMT+2 regardless of client locale
const gmt2ISOString = () => 
  new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+02:00');

// Normalize backend-provided message types for case-insensitive comparisons.
const normalizeType = (t?: string | null) => (t ?? '').toUpperCase();

// Human-friendly day label for separators: Today, Yesterday, weekday, weeks ago, or date
const daySeparatorLabel = (date: Date) => {
  const now = new Date();
  const days = differenceInCalendarDays(startOfDay(now), startOfDay(date));
  // Today -> weekday name (e.g., Monday)
  if (days === 0) return format(date, 'EEEE');
  // Yesterday -> literal lowercase per request
  if (days === 1) return 'yesterday';
  // Within past week -> weekday name (e.g., Saturday, Friday)
  if (days < 7) return format(date, 'EEEE');
  // Older than a week -> abbreviated day and date (e.g., Mon, 29 Jun)
  return format(date, 'EEE, d LLL');
};

// Interface for component handle
export interface MessageThreadHandle {
  refreshMessages: () => void;
}

// Interface for parsed booking details (used for clarity)
interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

// Interface for MessageThreadProps
interface MessageThreadProps {
  bookingRequestId: number;
  onMessageSent?: () => void;
  onQuoteSent?: () => void;
  serviceId?: number;
  artistName?: string;
  clientName?: string;
  clientId?: number;
  artistId?: number;
  artistAvatarUrl?: string | null;
  clientAvatarUrl?: string | null;
  isSystemTyping?: boolean;
  serviceName?: string;
  initialNotes?: string | null;
  onBookingDetailsParsed?: (details: ParsedBookingDetails) => void;
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
  onBookingConfirmedChange?: (isConfirmed: boolean, booking: Booking | null) => void;
  onPaymentStatusChange?: (status: string | null, amount: number | null, receiptUrl: string | null) => void;
  onShowReviewModal?: (show: boolean) => void;
  onOpenDetailsPanel?: () => void;
  artistCancellationPolicy?: string | null;
  allowInstantBooking?: boolean;
  instantBookingPrice?: number;
}

// SVG Checkmark Icons (refined sizes and stroke)
const DoubleCheckmarkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1}
    stroke="currentColor"
    {...props}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12.75 12.75L15 15 18.75 9.75" />
  </svg>
);


const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(
  function MessageThread(
    {
      bookingRequestId,
      onMessageSent,
      onQuoteSent,
      serviceId,
      artistName = 'Service Provider',
      clientName = 'Client',
      clientAvatarUrl = null,
      clientId: propClientId,
      artistId: propArtistId,
      artistAvatarUrl = null,
      isSystemTyping = false,
      serviceName,
      initialNotes = null,
      onBookingDetailsParsed,
      initialBaseFee,
      initialTravelCost,
      initialSoundNeeded,
      onBookingConfirmedChange,
      onPaymentStatusChange,
      onShowReviewModal,
      onOpenDetailsPanel,
      artistCancellationPolicy,
      allowInstantBooking,
      instantBookingPrice,
    }: MessageThreadProps,
    ref,
  ) {
    const { user } = useAuth();
    const router = useRouter();

    // State variables
    const [messages, setMessages] = useState<Message[]>([]);
    const [quotes, setQuotes] = useState<Record<number, QuoteV2>>({});
    const [loading, setLoading] = useState(true);
    const [newMessageContent, setNewMessageContent] = useState('');
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
    const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
    const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | undefined>();
    const [threadError, setThreadError] = useState<string | null>(null);
    const [wsFailed, setWsFailed] = useState(false);
    const [bookingConfirmed, setBookingConfirmed] = useState(false);
    const [uploadingProgress, setUploadingProgress] = useState(0);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [announceNewMessage, setAnnounceNewMessage] = useState('');
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
    const [textareaLineHeight, setTextareaLineHeight] = useState(0);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showDetailsCard, setShowDetailsCard] = useState(false);
    const [isPortalReady, setIsPortalReady] = useState(false);
    const { enqueue: enqueueMessage } = useOfflineQueue<{
      tempId: number;
      payload: MessageCreate;
    }>('offlineSendQueue', async ({ tempId, payload }) => {
      const res = await postMessageToBookingRequest(bookingRequestId, payload);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...res.data, status: 'sent' } : m)),
      );
    });
    const [typingUsers, setTypingUsers] = useState<number[]>([]);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [revealedImages, setRevealedImages] = useState<Set<number>>(new Set());

    // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement | null>(null);

    // Derived values
    const computedServiceName = serviceName ?? bookingDetails?.service?.title;

    const currentClientId =
      propClientId ||
      bookingDetails?.client_id ||
      messages.find((m) => m.sender_type === 'client')?.sender_id ||
      0;
    const currentArtistId = propArtistId || bookingDetails?.artist_id || user?.id || 0;

    const baseFee = initialBaseFee ?? 0;
    const travelFee = initialTravelCost ?? 0;

    const eventDetails = useMemo(
      () => ({
        from: clientName || 'Client',
        receivedAt: format(new Date(), 'PPP'),
        event: parsedBookingDetails?.eventType,
        date: parsedBookingDetails?.date &&
          isValid(new Date(parsedBookingDetails.date))
          ? format(new Date(parsedBookingDetails.date), 'PPP')
          : undefined,
        guests: parsedBookingDetails?.guests,
        venue: parsedBookingDetails?.venueType,
        notes: parsedBookingDetails?.notes,
      }),
      [clientName, parsedBookingDetails],
    );

    // Focus textarea on mount and when switching conversations
    useEffect(() => {
      textareaRef.current?.focus();
    }, []);

    useEffect(() => {
      textareaRef.current?.focus();
    }, [bookingRequestId]);

    // Ensure portal mounts only on client to avoid hydration mismatch
    useEffect(() => {
      setIsPortalReady(true);
    }, []);

    const hasSentQuote = useMemo(
      () => messages.some((m) => Number(m.quote_id) > 0),
      [messages],
    );
    const typingIndicator = useMemo(() => {
      const names = typingUsers.map((id) =>
        id === currentArtistId ? artistName : id === currentClientId ? clientName : 'Participant',
      );
      if (isSystemTyping) names.push('System');
      if (names.length === 0) return null;
      const verb = names.length > 1 ? 'are' : 'is';
      return `${names.join(' and ')} ${verb} typing...`;
    }, [typingUsers, isSystemTyping, currentArtistId, currentClientId, artistName, clientName]);


    // Payment Modal Hook
    const [paymentInfo, setPaymentInfo] = useState<{ status: string | null; amount: number | null; receiptUrl: string | null }>({ status: null, amount: null, receiptUrl: null });

    const { openPaymentModal, paymentModal } = usePaymentModal(
      useCallback(({ status, amount, receiptUrl: url }) => {
        setPaymentInfo({ status: status ?? null, amount: amount ?? null, receiptUrl: url ?? null });
        if (onPaymentStatusChange) {
          onPaymentStatusChange(status, amount, url ?? null);
        }
      }, [onPaymentStatusChange]),
      useCallback(() => { /* usePaymentModal handles its own error display */ }, []),
    );

    // --- Helper Functions and Callbacks ---

    // Calculate textarea line height once on mount
    useEffect(() => {
      if (textareaRef.current && textareaLineHeight === 0) {
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.height = 'auto';
        tempDiv.style.width = '200px';
        const computedStyle = getComputedStyle(textareaRef.current);
        tempDiv.style.fontFamily = computedStyle.fontFamily;
        tempDiv.style.fontSize = computedStyle.fontSize;
        tempDiv.style.lineHeight = computedStyle.lineHeight;
        tempDiv.innerText = 'M';
        document.body.appendChild(tempDiv);
        setTextareaLineHeight(tempDiv.clientHeight);
        document.body.removeChild(tempDiv);
      }
    }, [textareaRef, textareaLineHeight]);

    // Function to auto-resize the textarea
    const autoResizeTextarea = useCallback(() => {
      const ta = textareaRef.current;
      const container = messagesContainerRef.current;
      if (!ta || textareaLineHeight === 0) return;

      // Track current height before resizing so we can adjust scroll position
      const prevH = ta.offsetHeight;
      ta.style.height = 'auto';

      const style = getComputedStyle(ta);
      const padT = parseFloat(style.paddingTop);
      const bdrT = parseFloat(style.borderTopWidth);
      const bdrB = parseFloat(style.borderBottomWidth);

      const maxH = textareaLineHeight * MAX_TEXTAREA_LINES + padT + bdrT + bdrB;
      const newH = Math.min(ta.scrollHeight, maxH);
      ta.style.height = `${newH}px`;

      // Adjust scroll so the latest messages remain visible when textarea grows
      const diff = newH - prevH;
      if (container && diff !== 0 && !isUserScrolledUp) {
        container.scrollTop += diff;
      }
    }, [textareaLineHeight, isUserScrolledUp]);

    // Effect to resize textarea when content changes
    useEffect(() => {
      autoResizeTextarea();
    }, [newMessageContent, autoResizeTextarea]);

    // Close emoji picker when clicking outside of it
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          showEmojiPicker &&
          emojiPickerRef.current &&
          !emojiPickerRef.current.contains(e.target as Node)
        ) {
          setShowEmojiPicker(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);


    const firstUnreadIndex = useMemo(
      () => messages.findIndex((msg) => msg.sender_id !== user?.id && !msg.is_read),
      [messages, user?.id],
    );

  const ensureQuoteLoaded = useCallback(
      async (quoteId: number) => {
        if (quotes[quoteId]) return;
        try {
          const res = await getQuoteV2(quoteId);
          setQuotes((prev) => ({ ...prev, [quoteId]: res.data }));

          if (res.data.status === 'accepted' && res.data.booking_id) {
            setBookingConfirmed(true);
            if (!bookingDetails || bookingDetails.id !== res.data.booking_id) {
              try {
                const detailsRes = await getBookingDetails(res.data.booking_id);
                setBookingDetails(detailsRes.data);
              } catch (err: unknown) {
                console.error('Failed to fetch booking details for accepted quote:', err);
              }
            }
          }
        } catch (err: unknown) {
          console.error(`Failed to fetch quote ${quoteId}:`, err);
        }
      },
      [quotes, bookingDetails, setQuotes, setBookingConfirmed, setBookingDetails],
    );

    // Track composer height to avoid cutting off last message behind the input on mobile
    const [composerHeight, setComposerHeight] = useState(0);
    useEffect(() => {
      const el = composerRef.current;
      if (!el) return;
      const update = () => setComposerHeight(el.offsetHeight || 0);
      update();
      let ro: ResizeObserver | null = null;
      try {
        ro = new ResizeObserver(() => update());
        ro.observe(el);
      } catch {
        // Fallback: update on resize
        window.addEventListener('resize', update);
      }
      return () => {
        if (ro && el) ro.unobserve(el);
        window.removeEventListener('resize', update);
      };
    }, [composerRef]);

    const fetchMessages = useCallback(async () => {
      setLoading(true);
      try {
        const res = await getMessagesForBookingRequest(bookingRequestId);
        let parsedDetails: ParsedBookingDetails | undefined;

        const filteredMessages = res.data.filter((msg) => {
          const type = normalizeType(msg.message_type);
          if (type === 'SYSTEM' && msg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
            parsedDetails = parseBookingDetailsFromMessage(msg.content);
            return false;
          }
          if (type === 'USER' && msg.content.startsWith('Requesting ')) {
            return false;
          }
          if (initialNotes && type === 'USER' && msg.content.trim() === initialNotes.trim()) {
            return false;
          }
          return true;
        });

        setMessages(filteredMessages);
        setParsedBookingDetails(parsedDetails);

        const hasUnread = filteredMessages.some(
          (msg) => msg.sender_id !== user?.id && !msg.is_read
        );
        if (hasUnread) {
          try {
            await markMessagesRead(bookingRequestId);
          } catch (err: unknown) {
            console.error('Failed to mark messages read:', err);
          }
        }

        filteredMessages.forEach((msg) => {
          const quoteId = Number(msg.quote_id);
          const isQuote =
            quoteId > 0 &&
            (normalizeType(msg.message_type) === 'QUOTE' ||
              (normalizeType(msg.message_type) === 'SYSTEM' &&
                msg.action === 'review_quote'));
          if (isQuote) {
            void ensureQuoteLoaded(quoteId);
          }
        });

        if (parsedDetails && onBookingDetailsParsed) {
          onBookingDetailsParsed(parsedDetails);
        }

        setThreadError(null);
      } catch (err: unknown) {
        console.error('Failed to fetch messages:', err);
        setThreadError(`Failed to load messages. ${(err as Error).message || 'Please try again.'}`);
      } finally {
        setLoading(false);
      }
    }, [bookingRequestId, user?.id, initialNotes, onBookingDetailsParsed, ensureQuoteLoaded, setMessages, setThreadError, setLoading]);

    useImperativeHandle(ref, () => ({
      refreshMessages: fetchMessages,
    }));

    useEffect(() => {
      fetchMessages();
    }, [bookingRequestId, fetchMessages]);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') || '' : '';
    const { onMessage: onSocketMessage, updatePresence } = useWebSocket(
      `${WS_BASE}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
      (event) => {
        if (event?.code === 4401) {
          setThreadError('Authentication error. Please sign in again.');
        } else {
          setWsFailed(true);
        }
      },
    );

    useEffect(() => {
      if (!user?.id) return;
      updatePresence(user.id, 'online');
      const handleVisibility = () => {
        updatePresence(user.id, document.hidden ? 'away' : 'online');
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        updatePresence(user.id, 'offline');
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }, [updatePresence, user?.id]);

    useEffect(
      () =>
        onSocketMessage((event) => {
          const incoming = JSON.parse(event.data) as Partial<Message> & {
            type?: string;
            users?: number[];
          };
          if (incoming.type === 'typing' && Array.isArray(incoming.users)) {
            setTypingUsers(incoming.users.filter((id) => id !== user?.id));
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setTypingUsers([]), 2000);
            return;
          }
          const incomingMsg = incoming as Message;
          if (normalizeType(incomingMsg.message_type) === 'SYSTEM' && incomingMsg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
            if (onBookingDetailsParsed) {
              onBookingDetailsParsed(parseBookingDetailsFromMessage(incomingMsg.content));
            }
            return;
          }
          setMessages((prevMessages) => {
            if (
              prevMessages.some((prevMsg) => prevMsg.id === incomingMsg.id) ||
              (initialNotes && normalizeType(incomingMsg.message_type) === 'USER' && incomingMsg.content.trim() === initialNotes.trim())
            ) {
              return prevMessages;
            }
            return [...prevMessages.slice(-199), incomingMsg];
          });
          const incomingQuoteId = Number(incomingMsg.quote_id);
          const isQuoteMsg =
            incomingQuoteId > 0 &&
            (normalizeType(incomingMsg.message_type) === 'QUOTE' ||
              (normalizeType(incomingMsg.message_type) === 'SYSTEM' &&
                incomingMsg.action === 'review_quote'));
          if (isQuoteMsg) {
            void ensureQuoteLoaded(incomingQuoteId);
          }
        }),
      [onSocketMessage, ensureQuoteLoaded, initialNotes, onBookingDetailsParsed, setMessages, user?.id],
    );

    useEffect(() => {
      if (attachmentFile) {
        const url = URL.createObjectURL(attachmentFile);
        setAttachmentPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      }
      setAttachmentPreviewUrl(null);
      return () => {};
    }, [attachmentFile]);

    // Refined scrolling logic
useEffect(() => {
  if (!messagesContainerRef.current || !messagesEndRef.current) return;

  const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
  const atBottom = scrollHeight - scrollTop - clientHeight <= MIN_SCROLL_OFFSET;

  const shouldAutoScroll = messages.length > prevMessageCountRef.current || (typingIndicator && (atBottom || !isUserScrolledUp));

  if (shouldAutoScroll) {
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }

  prevMessageCountRef.current = messages.length;
}, [messages, typingIndicator, isUserScrolledUp]);

    const handleScroll = useCallback(() => {
      if (!messagesContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < MIN_SCROLL_OFFSET;
      setShowScrollButton(!atBottom);
      setIsUserScrolledUp(!atBottom);
    }, []);

    useEffect(() => {
      handleScroll();
      const container = messagesContainerRef.current;
      if (container) {
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
      }
      return () => {};
    }, [handleScroll]);

    // Close details card on Escape
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setShowDetailsCard(false);
      };
      if (showDetailsCard) window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [showDetailsCard]);

    useEffect(() => {
      if (prevMessageCountRef.current && messages.length > prevMessageCountRef.current && showScrollButton) {
        setAnnounceNewMessage('New messages available');
      }
      prevMessageCountRef.current = messages.length;
    }, [messages, showScrollButton]);

    const visibleMessages = useMemo(() => {
      const quoteIds = new Set<number>();
      messages.forEach((m) => {
        const qid = Number(m.quote_id);
        if (
          normalizeType(m.message_type) === 'QUOTE' &&
          !Number.isNaN(qid)
        ) {
          quoteIds.add(qid);
        }
      });

      return messages.filter((msg) => {
        const visibleToCurrentUser =
          !msg.visible_to ||
          msg.visible_to === 'both' ||
          (user?.user_type === 'service_provider' && msg.visible_to === 'service_provider') ||
          (user?.user_type === 'client' && msg.visible_to === 'client');

        const qid = Number(msg.quote_id);
        return (
          visibleToCurrentUser &&
          msg.content &&
          msg.content.trim().length > 0 &&
          !(normalizeType(msg.message_type) === 'SYSTEM' &&
            msg.content.startsWith(BOOKING_DETAILS_PREFIX)) &&
          !(normalizeType(msg.message_type) === 'SYSTEM' &&
            msg.action === 'review_quote' &&
            (Number.isNaN(qid) || qid <= 0)) &&
          !(
            normalizeType(msg.message_type) === 'SYSTEM' &&
            msg.action === 'review_quote' &&
            !Number.isNaN(qid) &&
            quoteIds.has(qid)
          )
        );
      });
    }, [messages, user?.user_type]);

    const shouldShowTimestampGroup = useCallback(
      (msg: Message, index: number, list: Message[]) => {
        if (index === 0) return true;
        const prevMsg = list[index - 1];
        const prevTime = new Date(prevMsg.timestamp).getTime();
        const currTime = new Date(msg.timestamp).getTime();

        const isDifferentDay = format(currTime, 'yyyy-MM-dd') !== format(prevTime, 'yyyy-MM-dd');
        const isTimeGapSignificant = (currTime - prevTime) >= TEN_MINUTES_MS;
        const isDifferentSender = prevMsg.sender_id !== msg.sender_id || prevMsg.sender_type !== msg.sender_type;

        return isDifferentDay || isTimeGapSignificant || isDifferentSender;
      },
      [],
    );

    const groupedMessages = useMemo(() => {
      const groups: { sender_id: number | null; sender_type: string; messages: Message[]; showDayDivider: boolean; }[] = [];
      visibleMessages.forEach((msg, idx) => {
        const isNewGroupNeeded = shouldShowTimestampGroup(msg, idx, visibleMessages);
        const isNewDay =
          idx === 0 ||
          format(new Date(msg.timestamp), 'yyyy-MM-dd') !==
            format(new Date(visibleMessages[idx - 1].timestamp), 'yyyy-MM-dd');

        if (isNewGroupNeeded || groups.length === 0) {
          groups.push({
            sender_id: msg.sender_id,
            sender_type: msg.sender_type,
            messages: [msg],
            showDayDivider: isNewDay,
          });
        } else {
          const lastGroup = groups[groups.length - 1];
          lastGroup.messages.push(msg);
          if (isNewDay) {
            lastGroup.showDayDivider = true;
          }
        }
      });
      return groups;
    }, [visibleMessages, shouldShowTimestampGroup]);


    // --- Event Handlers ---

    const handleEmojiSelect = (emoji: { native?: string }) => {
      if (emoji?.native) {
        setNewMessageContent((prev) => `${prev}${emoji.native}`);
      }
      setShowEmojiPicker(false);
      textareaRef.current?.focus();
    };

    const handleSendMessage = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageContent.trim() && !attachmentFile) return;

        if (attachmentFile && !navigator.onLine) {
          setThreadError('Cannot send attachments while offline.');
          return;
        }

        let attachment_url: string | undefined;
        const tempId = Date.now();

        try {
          if (attachmentFile) {
            setIsUploadingAttachment(true);
            const res = await uploadMessageAttachment(
              bookingRequestId,
              attachmentFile,
              (evt) => {
                if (evt.total) {
                  setUploadingProgress(Math.round((evt.loaded * 100) / evt.total));
                }
              },
            );
            attachment_url = res.data.url;
          }

          const payload: MessageCreate = {
            content: newMessageContent.trim(),
            attachment_url,
          };

          const optimistic: Message = {
            id: tempId,
            booking_request_id: bookingRequestId,
            sender_id: user?.id || 0,
            sender_type: user?.user_type === 'service_provider' ? 'artist' : 'client',
            content: payload.content,
            message_type: 'USER',
            quote_id: null,
            attachment_url,
            visible_to: 'both',
            action: null,
            avatar_url: undefined,
            expires_at: null,
            unread: false,
            is_read: true,
            // Ensure optimistic message uses GMT+2 timestamp
            timestamp: gmt2ISOString(),
            status: 'sending',
          };
          setMessages((prev) => [...prev, optimistic]);

          const resetInput = () => {
            setNewMessageContent('');
            setAttachmentFile(null);
            setAttachmentPreviewUrl(null);
            setUploadingProgress(0);
            setIsUploadingAttachment(false);
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.rows = 1;
              // Keep focus ready for continued typing
              textareaRef.current.focus();
            }
          };

          if (!navigator.onLine) {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' } : m)),
            );
            enqueueMessage({ tempId, payload });
            resetInput();
            return;
          }

          try {
            const res = await postMessageToBookingRequest(bookingRequestId, payload);
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...res.data, status: 'sent' } : m)),
            );
            if (onMessageSent) onMessageSent();
          } catch (err: unknown) {
            console.error('Failed to send message:', err);
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' } : m)),
            );
            enqueueMessage({ tempId, payload });
            setThreadError(
              `Failed to send message. ${(err as Error).message || 'Please try again later.'}`,
            );
          }

          resetInput();
        } catch (err: unknown) {
          console.error('Failed to send message:', err);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
          );
          const message =
            err instanceof AxiosError && err.response?.status === 422
              ? 'Attachment file missing. Please select a file before sending.'
              : (err as Error).message || 'Please try again later.';
          setThreadError(`Failed to send message. ${message}`);
          setIsUploadingAttachment(false);
        }
      },
      [
        newMessageContent,
        attachmentFile,
        bookingRequestId,
        onMessageSent,
        textareaRef,
        user?.id,
        user?.user_type,
        setAttachmentFile,
        setAttachmentPreviewUrl,
        setUploadingProgress,
        setIsUploadingAttachment,
        setNewMessageContent,
        setThreadError,
        setMessages,
        enqueueMessage,
      ],
    );

    const handleSendQuote = useCallback(
      async (quoteData: QuoteV2Create) => {
        try {
          await createQuoteV2(quoteData);
          void fetchMessages();
          if (onMessageSent) onMessageSent();
          if (onQuoteSent) onQuoteSent();
        } catch (err: unknown) {
          console.error('Failed to send quote:', err);
          setThreadError(`Failed to send quote. ${(err as Error).message || 'Please try again.'}`);
        }
      },
      [fetchMessages, onMessageSent, onQuoteSent, setThreadError],
    );

    const handleDeclineRequest = useCallback(async () => {
      try {
        await updateBookingRequestArtist(bookingRequestId, {
          status: 'request_declined',
        });
        void fetchMessages();
        if (onMessageSent) onMessageSent();
      } catch (err: unknown) {
        console.error('Failed to decline request:', err);
        setThreadError(
          `Failed to decline request. ${(err as Error).message || 'Please try again.'}`,
        );
      }
    }, [bookingRequestId, fetchMessages, onMessageSent, setThreadError]);

    const handleAcceptQuote = useCallback(
      async (quote: QuoteV2) => {
        try {
          await acceptQuoteV2(quote.id, serviceId);
        } catch (err: unknown) {
          console.error('Failed to accept quote:', err);
          setThreadError(
            `Failed to accept quote. ${(err as Error).message || 'Please try again.'}`,
          );
          return;
        }

        try {
          const freshQuote = await getQuoteV2(quote.id);
          setQuotes((prev) => ({ ...prev, [quote.id]: freshQuote.data }));

          const bookingId = freshQuote.data.booking_id;
          if (!bookingId) {
            throw new Error('Booking not found after accepting quote');
          }

          const details = await getBookingDetails(bookingId);
          setBookingConfirmed(true);
          if (onBookingConfirmedChange) {
            onBookingConfirmedChange(true, details.data);
          }

          setBookingDetails(details.data);

          openPaymentModal({
            bookingRequestId,
            depositAmount: details.data.deposit_amount ?? undefined,
            depositDueBy: details.data.deposit_due_by ?? undefined,
          });
          void fetchMessages();
        } catch (err: unknown) {
          console.error('Failed to finalize quote acceptance process:', err);
          setThreadError(`Quote accepted, but there was an issue setting up payment. ${(err as Error).message || 'Please try again.'}`);
        }
      },
      [bookingRequestId, fetchMessages, openPaymentModal, serviceId, setQuotes, setBookingConfirmed, setBookingDetails, setThreadError, onBookingConfirmedChange],
    );

    const handleDeclineQuote = useCallback(
      async (quote: QuoteV2) => {
        try {
          await declineQuoteV2(quote.id);
          const updatedQuote = await getQuoteV2(quote.id);
          setQuotes((prev) => ({ ...prev, [quote.id]: updatedQuote.data }));
        } catch (err: unknown) {
          console.error('Failed to decline quote:', err);
          setThreadError('Failed to decline quote. Please refresh and try again.');
        }
      },
      [setQuotes, setThreadError],
    );

    return (
      <div className="flex flex-col rounded-b-2xl overflow-hidden w-full bg-white h-full">
        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 flex-grow overflow-y-auto flex flex-col gap-3 bg-[#ffffff] px-4 pt-4 pb-2"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {loading ? (
            <div className="flex justify-center py-6" aria-label="Loading messages">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
            </div>
          ) : (
            visibleMessages.length === 0 && !isSystemTyping && (
              <div className="text-center py-4">
                {user?.user_type === 'client' ? (
                  <p className="text-xs text-gray-600">
                    {t(
                      'chat.empty.client',
                      'Your request is in - expect a quote soon. Add any notes or questions below.',
                    )}
                    <>
                      <span className="mx-1">·</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-600 underline underline-offset-2"
                        onClick={() => setShowDetailsCard(true)}
                      >
                        {t('chat.empty.viewDetails', 'View details')}
                      </button>
                    </>
                  </p>
                ) : user?.user_type === 'service_provider' ? (
                  <p className="text-xs text-gray-600">
                    {t(
                      'chat.empty.artist',
                      'No messages yet—say hi or share details. You can send a quick quote when you’re ready.',
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">
                    {t('chat.empty.default', 'Start the conversation whenever you’re ready.')}
                  </p>
                )}
              </div>
            )
          )}

          {user?.user_type === 'service_provider' && !bookingConfirmed && !hasSentQuote && (
            <div className="mb-4" data-testid="artist-inline-quote">
              <MemoInlineQuoteForm
                artistId={currentArtistId}
                clientId={currentClientId}
                bookingRequestId={bookingRequestId}
                serviceName={computedServiceName}
                initialBaseFee={baseFee}
                initialTravelCost={travelFee}
                initialSoundNeeded={initialSoundNeeded}
                onSubmit={handleSendQuote}
                onDecline={handleDeclineRequest}
                eventDetails={eventDetails}
              />
            </div>
          )}

          {/* Render Grouped Messages */}
          {groupedMessages.map((group, idx) => {
            const firstMsgInGroup = group.messages[0];
            const isSystemMessage = normalizeType(firstMsgInGroup.message_type) === 'SYSTEM';
            const isSenderSelf = firstMsgInGroup.sender_id === user?.id;

            return (
              <React.Fragment key={firstMsgInGroup.id}>
                {/* Day Divider: centered date without side lines */}
                {group.showDayDivider && (
                  <div className="flex justify-center my-4 w-full">
                    <span className="px-3 text-xs text-gray-500 bg-gray-100 rounded-full py-1">
                      {daySeparatorLabel(new Date(firstMsgInGroup.timestamp))}
                    </span>
                  </div>
                )}

                {/* Message Group Container */}
                <div className={`flex flex-col w-full`}>
                  {/* Sender Name/Avatar for received messages (not system or self) */}
                  {!isSenderSelf && !isSystemMessage && (
                    <div className="flex items-center mb-1">
                      {user?.user_type === 'service_provider'
                        ? clientAvatarUrl
                          ? (
                              <Image
                                src={getFullImageUrl(clientAvatarUrl) as string}
                                alt="Client avatar"
                                width={20}
                                height={20}
                                className="h-5 w-5 rounded-full object-cover mr-2"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                                }}
                              />
                            )
                          : (
                              <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium mr-2">
                                {clientName?.charAt(0)}
                              </div>
                            )
                        : artistAvatarUrl
                          ? (
                              <Image
                                src={getFullImageUrl(artistAvatarUrl) as string}
                                alt="Service Provider avatar"
                                width={20}
                                height={20}
                                className="h-5 w-5 rounded-full object-cover mr-2"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                                }}
                              />
                            )
                          : (
                              <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium mr-2">
                                {artistName?.charAt(0)}
                              </div>
                            )}
                      <span className="text-xs font-semibold text-gray-700">
                        {user?.user_type === 'service_provider' ? clientName : artistName}
                      </span>
                    </div>
                  )}

                  {/* Render individual messages within the group */}
                  {group.messages.map((msg, msgIdx) => {
                    const isMsgFromSelf = msg.sender_id === user?.id;
                    const isLastInGroup = msgIdx === group.messages.length - 1;

                    let bubbleShape: string;
                    if (isSystemMessage) {
                      bubbleShape = 'rounded-lg';
                    } else if (isMsgFromSelf) {
                      bubbleShape = isLastInGroup ? 'rounded-br-none rounded-xl' : 'rounded-xl';
                    } else {
                      bubbleShape = isLastInGroup ? 'rounded-bl-none rounded-xl' : 'rounded-xl';
                    }

                    const quoteId = Number(msg.quote_id);
                    const isQuoteMessage =
                      quoteId > 0 &&
                      (normalizeType(msg.message_type) === 'QUOTE' ||
                        (normalizeType(msg.message_type) === 'SYSTEM' &&
                          msg.action === 'review_quote'));

                    if (isSystemMessage) {
                      return (
                        <div
                          key={msg.id}
                          className="text-center text-sm text-gray-500 py-2"
                          ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}>
                          {msg.content}
                        </div>
                      );
                    }

                    const bubbleBase = isMsgFromSelf
                      ? 'bg-blue-50 text-gray-900'
                      : 'bg-gray-50 text-gray-900';

                    const bubbleClasses = `${bubbleBase} ${bubbleShape}`;
                    const messageTime = format(new Date(msg.timestamp), 'HH:mm');

                    if (isQuoteMessage) {
                      const quoteData = quotes[quoteId];
                      if (!quoteData) return null;
                      const isClient = user?.user_type === 'client';
                      return (
                        <div
                          key={msg.id}
                          id={`quote-${quoteId}`}
                          className={`mb-0.5 w-full`}
                          ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                        >
                          {isClient && quoteData.status === 'pending' && !bookingConfirmed && (
                            <div className="my-2 md:my-3">
                              <div className="flex items-center gap-3 text-gray-500">
                                <div className="h-px flex-1 bg-gray-200" />
                                <span className="text-[11px] sm:text-xs">
                                  {t('quote.newFrom', 'New quote from {name}', { name: artistName || 'the artist' })}
                                </span>
                                <div className="h-px flex-1 bg-gray-200" />
                              </div>
                            </div>
                          )}

                          <MemoQuoteBubble
                            description={quoteData.services[0]?.description || ''}
                            price={Number(quoteData.services[0]?.price || 0)}
                            soundFee={Number(quoteData.sound_fee)}
                            travelFee={Number(quoteData.travel_fee)}
                            accommodation={quoteData.accommodation || undefined}
                            discount={Number(quoteData.discount) || undefined}
                            subtotal={Number(quoteData.subtotal)}
                            total={Number(quoteData.total)}
                            status={
                              quoteData.status === 'pending'
                                ? 'Pending'
                                : quoteData.status === 'accepted'
                                  ? 'Accepted'
                                  : quoteData.status === 'rejected' || quoteData.status === 'expired'
                                    ? 'Rejected'
                                    : 'Pending'
                            }
                            expiresAt={quoteData.expires_at || undefined}
                            eventDetails={{
                              from: clientName || 'Client',
                              receivedAt: format(new Date(msg.timestamp), 'PPP'),
                              event: parsedBookingDetails?.eventType,
                              date: (() => {
                                if (!parsedBookingDetails?.date) return undefined;
                                const eventDate = new Date(parsedBookingDetails.date);
                                return isValid(eventDate)
                                  ? format(eventDate, 'PPP')
                                  : undefined;
                              })(),
                              guests: parsedBookingDetails?.guests,
                              venue: parsedBookingDetails?.venueType,
                              notes: parsedBookingDetails?.notes,
                            }}
                            onAccept={
                              user?.user_type === 'client' &&
                              quoteData.status === 'pending' &&
                              !bookingConfirmed
                                ? () => handleAcceptQuote(quoteData)
                                : undefined
                            }
                            onDecline={
                              user?.user_type === 'client' &&
                              quoteData.status === 'pending' &&
                              !bookingConfirmed
                                ? () => handleDeclineQuote(quoteData)
                                : undefined
                            }
                          />

                          {isClient && quoteData.status === 'pending' && !bookingConfirmed && (
                            <>
                              <div className="mt-2 mb-2">
                                <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 border border-gray-100">
                                  <InformationCircleIcon className="h-4 w-4 text-gray-400 mt-0.5" />
                                  <div>
                                    <p className="text-[11px] sm:text-xs text-gray-600">
                                      {t('quote.guidance.review', 'Review the itemized price and included services. Ask questions if anything looks off.')}
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-gray-600 mt-1">
                                      {t('quote.guidance.acceptCta', 'Ready to go? Tap Accept to secure the date. You can pay the deposit right after.')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="my-2 md:my-3">
                                <div className="h-px w-full bg-gray-200" />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }

                      if (
                        normalizeType(msg.message_type) === 'SYSTEM' &&
                        msg.action === 'review_quote'
                      ) {
                        return null;
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`relative inline-block w-auto max-w-[75%] px-4 py-2 text-sm font-normal leading-snug ${bubbleClasses} ${msgIdx < group.messages.length - 1 ? 'mb-0.5' : ''} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'}`}
                          ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                        >
                          <div className="pr-10">
                            {msg.sender_id !== user?.id && !msg.is_read && (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" aria-label="Unread message" />
                            )}
                            {normalizeType(msg.message_type) === 'SYSTEM' && msg.action === 'view_booking_details' ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!bookingDetails?.id) return;
                                  const base =
                                    user?.user_type === 'service_provider'
                                      ? '/dashboard/bookings'
                                      : '/dashboard/client/bookings';
                                  router.push(`${base}/${bookingDetails.id}`);
                                }}
                                className="text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                              >
                                View Booking Details
                              </Button>
                            ) : (
                              msg.content
                            )}
                            {msg.attachment_url && (
                              isImageAttachment(msg.attachment_url) ? (
                                revealedImages.has(msg.id) ? (
                                  <Image
                                    src={getFullImageUrl(msg.attachment_url) as string}
                                    alt="Image attachment"
                                    width={200}
                                    height={200}
                                    className="mt-1 rounded"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRevealedImages((prev) => new Set(prev).add(msg.id))
                                    }
                                    className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                                  >
                                    View image
                                  </button>
                                )
                              ) : (
                                <a
                                  href={msg.attachment_url}
                                  target="_blank"
                                  className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                                  rel="noopener noreferrer"
                                >
                                  View attachment
                                </a>
                              )
                            )}
                          </div>
                          {/* Timestamp and Read Receipts - positioned absolutely within the bubble */}
                          <div className="absolute bottom-0.5 right-1.5 flex items-center space-x-0.5 text-[9px] text-right text-gray-500">
                            <time
                              dateTime={msg.timestamp}
                              title={new Date(msg.timestamp).toLocaleString()}
                            >
                              {messageTime}
                            </time>
                            {isMsgFromSelf && (
                              <div className="flex-shrink-0">
                                {msg.status === 'sending' ? (
                                  <ClockIcon className="h-4 w-4 text-gray-500 -ml-1" />
                                ) : msg.status === 'failed' ? (
                                  <ExclamationTriangleIcon className="h-4 w-4 text-red-500 -ml-1" />
                                ) : (
                                  <DoubleCheckmarkIcon
                                    className={`h-5 w-5 ${msg.is_read ? 'text-blue-600' : 'text-gray-500'} -ml-[8px]`}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                  })}
                </div>
              </React.Fragment>
            );
          })}

          {typingIndicator && (
            <p className="text-xs text-gray-500" aria-live="polite">{typingIndicator}</p>
          )}
          <div ref={messagesEndRef} className="absolute bottom-0 left-0 w-0 h-0" aria-hidden="true" />
        </div>

        {/* Scroll to Bottom Button (Mobile Only) */}
        {showScrollButton && (
          <button
            type="button"
            aria-label="Scroll to latest message"
            onClick={() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' });
              }
              setShowScrollButton(false);
              setIsUserScrolledUp(false);
            }}
            className="fixed bottom-24 right-6 z-50 md:hidden rounded-full bg-indigo-600 p-3 text-white shadow-lg hover:bg-indigo-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25L12 15.75 4.5 8.25"
              />
            </svg>
          </button>
        )}

        

        {/* Live Region for New Message Announcements */}
        <div aria-live="polite" className="sr-only">{announceNewMessage}</div>

        

        {/* Details Card Modal (Portal to escape stacking contexts) */}
        {showDetailsCard && isPortalReady && createPortal(
          (
            <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowDetailsCard(false)}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-[10000] w-full sm:max-w-md md:max-w-lg bg-white text-black rounded-2xl shadow-2xl max-h-[92vh] overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-base font-semibold">Your booking details</h3>
                  <button
                    type="button"
                    onClick={() => setShowDetailsCard(false)}
                    className="p-2 rounded-full hover:bg-gray-100"
                    aria-label="Close details"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-4 pt-3 text-sm text-gray-600">Here’s a summary of your request.</div>
                <div className="px-4 mt-3 flex items-center gap-3">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden flex-shrink-0">
                    {artistAvatarUrl ? (
                      <Image
                        src={getFullImageUrl(artistAvatarUrl) as string}
                        alt="Artist"
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gray-200" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <div className="text-base font-semibold">{computedServiceName || 'Service'}</div>
                    <div className="text-sm text-gray-600">{artistName || 'Service Provider'}</div>
                  </div>
                </div>
                <div className="my-4 mt-4 border-t border-gray-200" />
                <div className="px-4 pb-4 overflow-y-auto max-h-[60vh] text-sm leading-6">
                  {/* Booking details list */}
                  <ul className="divide-y divide-gray-100">
                    {parsedBookingDetails?.eventType && (
                      <li className="py-2"><span className="font-semibold">Event Type:</span> {parsedBookingDetails.eventType}</li>
                    )}
                    {parsedBookingDetails?.date && (
                      <li className="py-2"><span className="font-semibold">Date:</span> {isValid(new Date(parsedBookingDetails.date)) ? format(new Date(parsedBookingDetails.date), 'PPP p') : parsedBookingDetails.date}</li>
                    )}
                    {parsedBookingDetails?.location && (
                      <li className="py-2"><span className="font-semibold">Location:</span> {parsedBookingDetails.location}</li>
                    )}
                    {parsedBookingDetails?.guests && (
                      <li className="py-2"><span className="font-semibold">Guests:</span> {parsedBookingDetails.guests}</li>
                    )}
                    {parsedBookingDetails?.venueType && (
                      <li className="py-2"><span className="font-semibold">Venue Type:</span> {parsedBookingDetails.venueType}</li>
                    )}
                    {parsedBookingDetails?.notes && (
                      <li className="py-2"><span className="font-semibold">Notes:</span> {parsedBookingDetails.notes}</li>
                    )}
                  </ul>

                  {/* Order & receipt */}
                  {(bookingConfirmed || paymentInfo.status) && (
                    <div className="mt-4">
                      <div className="font-semibold mb-1">Order</div>
                      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700">Order number</span>
                          <span className="font-medium">{bookingDetails?.id ?? '—'}</span>
                        </div>
                        {(() => {
                          const url = buildReceiptUrl(paymentInfo.receiptUrl, bookingDetails?.payment_id ?? null);
                          return url ? (
                            <div className="mt-2 text-right">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline text-gray-700">View receipt</a>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Estimate or Quote Totals */}
                  {(() => {
                    const quoteList = Object.values(quotes || {});
                    const accepted = quoteList.find((q) => q.status === 'accepted');
                    const pending = quoteList.filter((q) => q.status === 'pending');
                    const latestPending = pending.sort((a,b) => (a.id||0) - (b.id||0)).slice(-1)[0];
                    const best = accepted || latestPending;
                    if (best) {
                      return (
                        <div className="mt-4">
                          <div className="font-semibold mb-1">Quote total</div>
                          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
                            {best.services?.[0]?.description && (
                              <div className="flex justify-between text-gray-700">
                                <span>{best.services[0].description}</span>
                                <span>{formatCurrency(Number(best.services[0].price||0))}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-gray-700">
                              <span>Sound</span>
                              <span>{formatCurrency(Number(best.sound_fee||0))}</span>
                            </div>
                            <div className="flex justify-between text-gray-700">
                              <span>Travel</span>
                              <span>{formatCurrency(Number(best.travel_fee||0))}</span>
                            </div>
                            {best.accommodation && (
                              <div className="flex justify-between text-gray-700">
                                <span>Accommodation</span>
                                <span>{best.accommodation}</span>
                              </div>
                            )}
                            {Number(best.discount||0) > 0 && (
                              <div className="flex justify-between text-gray-700">
                                <span>Discount</span>
                                <span>-{formatCurrency(Number(best.discount||0))}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold mt-2 border-t border-gray-200 pt-2">
                              <span>Total</span>
                              <span>{formatCurrency(Number(best.total||0))}</span>
                            </div>
                          </div>
                          {allowInstantBooking && !accepted && (
                            <div className="mt-3 text-right">
                              <Button
                                type="button"
                                onClick={() => openPaymentModal({ bookingRequestId, amount: Number(best.total||0) })}
                                className="bg-gray-900 text-white hover:bg-black"
                              >
                                Reserve now
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div className="mt-4">
                        <div className="font-semibold mb-1">Estimated total</div>
                        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                          <div className="flex justify-between text-gray-700">
                            <span>Base fee</span>
                            <span>{formatCurrency(Number(baseFee || 0))}</span>
                          </div>
                          <div className="flex justify-between text-gray-700 mt-1">
                            <span>Travel</span>
                            <span>{formatCurrency(Number(travelFee || 0))}</span>
                          </div>
                          <div className="flex justify-between font-semibold mt-2 border-t border-gray-200 pt-2">
                            <span>Total estimate</span>
                            <span>{formatCurrency(Number(baseFee || 0) + Number(travelFee || 0))}</span>
                          </div>
                          {typeof initialSoundNeeded !== 'undefined' && (
                            <div className="text-xs text-gray-500 mt-1">Sound equipment: {initialSoundNeeded ? 'Yes' : 'No'} (if required, may be quoted separately)</div>
                          )}
                        </div>
                        {allowInstantBooking && (
                          <div className="mt-3 text-right">
                            <Button
                              type="button"
                              onClick={() => openPaymentModal({ bookingRequestId, amount: Number(instantBookingPrice ?? (Number(baseFee||0)+Number(travelFee||0))) })}
                              className="bg-gray-900 text-white hover:bg-black"
                            >
                              Reserve now
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Policy */}
                  <div className="mt-5">
                    <div className="font-semibold mb-1">Cancellation policy</div>
                    <p className="text-gray-600 text-sm">
                      {artistCancellationPolicy?.trim() ||
                        'Free cancellation within 48 hours of booking. 50% refund up to 7 days before the event. Policies may vary by provider.'}
                    </p>
                  </div>

                  {/* Links */}
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={currentArtistId ? `/service-providers/${currentArtistId}` : '#'}
                      className="block text-center rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 font-medium"
                    >
                      View service provider
                    </a>
                    <a
                      href="/support"
                      className="block text-center rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 font-medium"
                    >
                      Get support
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ),
          document.body
        )}

        {/* Message Input and Action Bar */}
        {user && (
          <>
            {/* Attachment Preview */}
            {attachmentPreviewUrl && (
              <div className="flex items-center gap-2 mb-1.5 bg-gray-100 rounded-xl p-2.5 shadow-inner">
                {attachmentFile && attachmentFile.type.startsWith('image/') ? (
                  <Image
                    src={attachmentPreviewUrl}
                    alt="Attachment preview"
                    width={40}
                    height={40}
                    loading="lazy"
                    className="w-10 h-10 object-cover rounded-md border border-gray-200"
                  />
                ) : (
                  <>
                    {attachmentFile?.type === 'application/pdf' ? (
                      <DocumentIcon className="w-9 h-9 text-red-600" />
                    ) : (
                      <DocumentTextIcon className="w-9 h-9 text-gray-600" />
                    )}
                    <span className="text-xs text-gray-700 font-medium">{attachmentFile?.name}</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setAttachmentFile(null)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                  aria-label="Remove attachment"
                >
                  Remove
                </button>
              </div>
            )}

            {/* Message Input Form */}
            <div
              ref={composerRef}
              data-testid="composer-container"
              className="bg-white border-t border-gray-100 shadow-lg pb-safe relative flex-shrink-0 pb-2"
            >
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className="absolute bottom-14 left-0 z-50">
                  <EmojiPicker
                    data={data}
                    onEmojiSelect={handleEmojiSelect}
                    previewPosition="none"
                  />
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex items-center gap-x-2 px-3 pt-2 pb-2">
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  accept="image/*,application/pdf"
                />
                <label
                  htmlFor="file-upload"
                  aria-label="Upload attachment"
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </label>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  aria-label="Add emoji"
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <FaceSmileIcon className="w-6 h-6" />
                </button>
                {/* Textarea for auto-expansion and scrolling */}
                <textarea
                  ref={textareaRef}
                  value={newMessageContent}
                  onChange={(e) => {
                    setNewMessageContent(e.target.value);
                  }}
                  onInput={autoResizeTextarea}
                  autoFocus
                  rows={1}
                  className="flex-grow rounded-2xl px-4 py-2 border border-gray-300 shadow-sm resize-none text-sm font-medium focus:outline-none"
                  placeholder="Type your message..."
                  aria-label="New message input"
                  disabled={isUploadingAttachment}
                />
                {isUploadingAttachment && (
                  <div
                    className="flex items-center gap-1.5"
                    role="progressbar"
                    aria-label="Upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadingProgress}
                    aria-valuetext={`${uploadingProgress}%`}
                  >
                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${uploadingProgress}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{uploadingProgress}%</span>
                  </div>
                )}
                {/* Send Button: Circular arrow icon, make it smaller */}
                <Button
                  type="submit"
                  aria-label="Send message"
                  className="flex-shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center w-10 h-10 p-2"
                  disabled={isUploadingAttachment || (!newMessageContent.trim() && !attachmentFile)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </Button>
              </form>
            </div>

            {/* Leave Review Button (Client only, after booking completed) */}
            {user?.user_type === 'client' &&
              bookingDetails &&
              bookingDetails.status === "completed" &&
              !(bookingDetails as Booking & { review?: Review }).review && (
                <Button
                  type="button"
                  onClick={() => onShowReviewModal?.(true)}
                  className="mt-1.5 text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                >
                  Leave Review
                </Button>
              )}

            {paymentModal}
          </>
        )}

        {/* Error and WebSocket Connection Lost Messages */}
        {threadError && (
          <p className="text-xs text-red-600 p-4 mt-1.5" role="alert">{threadError}</p>
        )}
        {wsFailed && (
          <p className="text-xs text-red-600 p-4 mt-1.5" role="alert">
            Connection lost. Please refresh the page or sign in again.
          </p>
        )}
      </div>
    );
  },
);

MessageThread.displayName = 'MessageThread';
export default React.memo(MessageThread);
