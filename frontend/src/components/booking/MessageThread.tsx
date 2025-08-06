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
} from '@/lib/utils';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/bookingDetails';
import { DocumentIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Booking, Review, Message, MessageCreate, QuoteV2, QuoteV2Create } from '@/types';
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
  useAuth,
} from '@/lib/api';
import Button from '../ui/Button';
import SendQuoteModal from './SendQuoteModal';
import usePaymentModal from '@/hooks/usePaymentModal';
import QuoteBubble from './QuoteBubble';
import useWebSocket from '@/hooks/useWebSocket';
import { format, isValid } from 'date-fns';
import Countdown from './Countdown';
import QuoteReviewModal from './QuoteReviewModal';
import { useRouter } from 'next/navigation';


// Constants
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const API_V1 = '/api/v1';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MIN_SCROLL_OFFSET = 20;
const MAX_TEXTAREA_LINES = 10;

// Normalize backend-provided message types for case-insensitive comparisons.
const normalizeType = (t?: string | null) => (t ?? '').toUpperCase();

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
  // ADD THESE TWO NEW PROPS:
  showQuoteModal: boolean; // Controls the modal visibility
  setShowQuoteModal: (show: boolean) => void; // Allows parent to control the modal
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
      artistName = 'Artist',
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
      showQuoteModal, // Destructured from props
      setShowQuoteModal, // Destructured from props
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
    // REMOVED: const [showQuoteModal, setShowQuoteModal] = useState(false); // No longer managed internally
    const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
    const [parsedBookingDetails, setParsedBookingDetails] = useState<ParsedBookingDetails | undefined>();
    const [threadError, setThreadError] = useState<string | null>(null);
    const [reviewQuote, setReviewQuote] = useState<QuoteV2 | null>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [wsFailed, setWsFailed] = useState(false);
    const [bookingConfirmed, setBookingConfirmed] = useState(false);
    const [uploadingProgress, setUploadingProgress] = useState(0);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [announceNewMessage, setAnnounceNewMessage] = useState('');
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
    const [textareaLineHeight, setTextareaLineHeight] = useState(0);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const prevMessageCountRef = useRef(0);
    const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Derived values
    const computedServiceName = serviceName ?? bookingDetails?.service?.title;

    const currentClientId = propClientId || bookingDetails?.client_id || messages.find((m) => m.sender_type === 'client')?.sender_id || 0;
    const currentArtistId = propArtistId || bookingDetails?.artist_id || user?.id || 0;


    // Payment Modal Hook
    const { openPaymentModal, paymentModal } = usePaymentModal(
      useCallback(({ status, amount, receiptUrl: url }) => {
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
      if (!ta || textareaLineHeight === 0) return;

      ta.style.height = 'auto';

      const style = getComputedStyle(ta);
      const padT = parseFloat(style.paddingTop);
      const padB = parseFloat(style.paddingBottom);
      const bdrT = parseFloat(style.borderTopWidth);
      const bdrB = parseFloat(style.borderBottomWidth);

      const maxH = textareaLineHeight * MAX_TEXTAREA_LINES + padT + padB + bdrT + bdrB;

      const newH = Math.min(ta.scrollHeight, maxH);
      ta.style.height = `${newH}px`;
    }, [textareaLineHeight]);

    // Effect to resize textarea when content changes
    useEffect(() => {
      autoResizeTextarea();
    }, [newMessageContent, autoResizeTextarea]);


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
          if (normalizeType(msg.message_type) === 'QUOTE' && typeof msg.quote_id === 'number') {
            void ensureQuoteLoaded(msg.quote_id);
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
    const { onMessage: onSocketMessage } = useWebSocket(
      `${WS_BASE}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
      (event) => {
        if (event?.code === 4401) {
          setThreadError('Authentication error. Please sign in again.');
        } else {
          setWsFailed(true);
        }
      },
    );

    useEffect(
      () =>
        onSocketMessage((event) => {
          const incomingMsg = JSON.parse(event.data) as Message;

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

          if (normalizeType(incomingMsg.message_type) === 'QUOTE' && typeof incomingMsg.quote_id === 'number') {
            void ensureQuoteLoaded(incomingMsg.quote_id);
          }
        }),
      [onSocketMessage, ensureQuoteLoaded, initialNotes, onBookingDetailsParsed, setMessages],
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

  const shouldAutoScroll = (messages.length > prevMessageCountRef.current || isSystemTyping) && (atBottom || !isUserScrolledUp);

  if (shouldAutoScroll) {
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }

  prevMessageCountRef.current = messages.length;
}, [messages, isSystemTyping, isUserScrolledUp]);

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
        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
      }
      return () => {};
    }, [handleScroll]);

    useEffect(() => {
      if (prevMessageCountRef.current && messages.length > prevMessageCountRef.current && showScrollButton) {
        setAnnounceNewMessage('New messages available');
      }
      prevMessageCountRef.current = messages.length;
    }, [messages, showScrollButton]);

    const visibleMessages = useMemo(
      () =>
        messages.filter((msg) => {
          const visibleToCurrentUser =
            !msg.visible_to ||
            msg.visible_to === 'both' ||
            (user?.user_type === 'artist' && msg.visible_to === 'artist') ||
            (user?.user_type === 'client' && msg.visible_to === 'client');

          return (
            visibleToCurrentUser &&
            msg.content &&
            msg.content.trim().length > 0 &&
            !(normalizeType(msg.message_type) === 'SYSTEM' && msg.content.startsWith(BOOKING_DETAILS_PREFIX))
          );
        }),
      [messages, user?.user_type],
    );

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
        const isNewDay = idx > 0 && format(new Date(msg.timestamp), 'yyyy-MM-dd') !== format(new Date(visibleMessages[idx - 1].timestamp), 'yyyy-MM-dd');

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

    const handleSendMessage = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageContent.trim() && !attachmentFile) return;

        try {
          let attachment_url: string | undefined;
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

          await postMessageToBookingRequest(bookingRequestId, payload);

          setNewMessageContent('');
          setAttachmentFile(null);
          setAttachmentPreviewUrl(null);
          setUploadingProgress(0);
          setIsUploadingAttachment(false);
          // Reset textarea height after sending message
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.rows = 1;
          }
          void fetchMessages();
          if (onMessageSent) onMessageSent();
        } catch (err: unknown) {
          console.error('Failed to send message:', err);
          setThreadError(
            `Failed to send message. ${(err as Error).message || 'Please try again later.'}`
          );
          setIsUploadingAttachment(false);
        }
      },
      [newMessageContent, attachmentFile, bookingRequestId, fetchMessages, onMessageSent, textareaRef, setAttachmentFile, setAttachmentPreviewUrl, setUploadingProgress, setIsUploadingAttachment, setNewMessageContent, setThreadError],
    );

    const handleSendQuote = useCallback(
      async (quoteData: QuoteV2Create) => {
        try {
          await createQuoteV2(quoteData);
          setShowQuoteModal(false); // Use the prop's setter
          void fetchMessages();
          if (onMessageSent) onMessageSent();
          if (onQuoteSent) onQuoteSent();
        } catch (err: unknown) {
          console.error('Failed to send quote:', err);
          setThreadError(`Failed to send quote. ${(err as Error).message || 'Please try again.'}`);
        }
      },
      [fetchMessages, onMessageSent, onQuoteSent, setShowQuoteModal, setThreadError], // Dependency added for setter
    );

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

    const openReviewModal = useCallback(
      async (quoteId: number | undefined) => {
        if (!quoteId) return;
        try {
          const res = await getQuoteV2(quoteId);
          setReviewQuote(res.data);
          setShowReviewModal(true);
        } catch (err: unknown) {
          console.error('Failed to load quote for review:', err);
          setThreadError('Failed to load quote. Please try again.');
        }
      },
      [setShowReviewModal, setReviewQuote, setThreadError],
    );

    return (
      <div className="flex flex-col h-full rounded-b-2xl overflow-hidden w-full">
        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col gap-3 bg-white p-4"
        >
          {loading ? (
            <div className="flex justify-center py-6" aria-label="Loading messages">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
            </div>
          ) : (
            visibleMessages.length === 0 && !isSystemTyping && (
              <p className="text-xs text-gray-500 text-center py-4">No messages yet. Start the conversation below.</p>
            )
          )}

          {/* Render Grouped Messages */}
          {groupedMessages.map((group, idx) => {
            const firstMsgInGroup = group.messages[0];
            const isSystemMessage = normalizeType(firstMsgInGroup.message_type) === 'SYSTEM';
            const isSenderSelf = firstMsgInGroup.sender_id === user?.id;

            return (
              <React.Fragment key={firstMsgInGroup.id}>
                {/* Day Divider Line (WhatsApp style) */}
                {group.showDayDivider && (
                  <div className="flex items-center my-4 w-full">
                    <hr className="flex-grow border-t border-gray-300" />
                    <span className="px-3 text-xs text-gray-500 bg-gray-50 rounded-full py-1">
                      {format(new Date(firstMsgInGroup.timestamp), 'MMM d, yyyy')}
                    </span>
                    <hr className="flex-grow border-t border-gray-300" />
                  </div>
                )}

                {/* Message Group Container */}
                <div className={`flex flex-col w-full`}>
                  {/* Sender Name/Avatar for received messages (not system or self) */}
                  {!isSenderSelf && !isSystemMessage && (
                    <div className="flex items-center mb-1">
                      {user?.user_type === 'artist'
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
                                alt="Artist avatar"
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
                        {user?.user_type === 'artist' ? clientName : artistName}
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

                    const isQuoteMessage =
                      normalizeType(msg.message_type) === 'QUOTE' &&
                      typeof msg.quote_id === 'number';
                    const bubbleBase = isMsgFromSelf
                      ? 'bg-blue-100 text-gray-900'
                      : 'bg-white text-gray-800';

                    const bubbleClasses = `${bubbleBase} ${bubbleShape}`;
                    const messageTime = format(new Date(msg.timestamp), 'HH:mm');

                    if (isQuoteMessage) {
                      const quoteData = quotes[msg.quote_id];
                      if (!quoteData) return null;
                      return (
                        <div
                          key={msg.id}
                          id={`quote-${msg.quote_id}`}
                          className={`mb-0.5 w-full`}
                          ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                        >
                          <QuoteBubble
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
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`relative inline-block w-auto max-w-[75%] px-3 py-1.5 text-xs font-normal leading-snug shadow-sm ${bubbleClasses} ${msgIdx < group.messages.length - 1 ? 'mb-0.5' : ''} ${isMsgFromSelf ? 'ml-auto mr-0' : 'mr-auto ml-0'}`}
                        ref={idx === firstUnreadIndex && msgIdx === 0 ? firstUnreadMessageRef : null}
                      >
                        <div className="pr-10">
                          {msg.sender_id !== user?.id && !msg.is_read && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" aria-label="Unread message" />
                          )}
                          {normalizeType(msg.message_type) === 'SYSTEM' && msg.action ? (
                            msg.action === 'review_quote' ? (
                              <>
                                <Button
                                  type="button"
                                  onClick={() =>
                                    msg.visible_to === 'artist'
                                      ? setShowQuoteModal(true)
                                      : openReviewModal(msg.quote_id)
                                  }
                                  className="text-xs text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                                >
                                  {msg.visible_to === 'artist'
                                    ? 'Review & Send Quote'
                                    : 'Review & Accept Quote'}
                                </Button>
                                {msg.expires_at && (
                                  <div className="mt-1 text-[10px] text-gray-500">
                                    <Countdown expiresAt={msg.expires_at} />
                                  </div>
                                )}
                              </>
                            ) : msg.action === 'view_booking_details' ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!bookingDetails?.id) return;
                                  const base =
                                    user?.user_type === 'artist'
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
                            )
                          ) : (
                            msg.content
                          )}
                          {msg.attachment_url && (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              className="block text-indigo-400 underline mt-1 text-xs hover:text-indigo-300"
                              rel="noopener noreferrer"
                            >
                              View attachment
                            </a>
                          )}
                        </div>
                        {/* Timestamp and Read Receipts - positioned absolutely within the bubble */}
                        <div className="absolute bottom-0.5 right-1.5 flex items-center space-x-0.5 text-[9px] text-right text-gray-400">
                          <time
                            dateTime={msg.timestamp}
                            title={new Date(msg.timestamp).toLocaleString()}
                          >
                            {messageTime}
                          </time>
                          {isMsgFromSelf && (
                            <div className="flex-shrink-0">
                                <DoubleCheckmarkIcon
                                  className={`h-5 w-5 ${msg.is_read ? 'text-blue-500' : 'text-gray-400'} -ml-[8px]`}
                                />
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

          {/* System Typing Indicator */}
          {isSystemTyping && (
            <div className="flex items-end gap-2 self-start">
              <div className="h-7 w-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium shadow-sm">
                {user?.user_type === 'artist' ? clientName?.charAt(0) : artistName?.charAt(0)}
              </div>
              <div className="bg-gray-200 rounded-2xl px-3 py-1.5 shadow-sm">
                <div className="flex space-x-0.5 animate-pulse">
                  <span className="block w-2 h-2 bg-gray-500 rounded-full" />
                  <span className="block w-2 h-2 bg-gray-500 rounded-full" />
                  <span className="block w-2 h-2 bg-gray-500 rounded-full" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button (Mobile Only) */}
        {showScrollButton && (
          <button
            type="button"
            aria-label="Scroll to latest message"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

        {/* Jump to Unread Button (Mobile Only) */}
        {firstUnreadIndex !== -1 && (
          <button
            type="button"
            aria-label="Jump to unread messages"
            onClick={() => {
              firstUnreadMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
              setShowScrollButton(true);
              setIsUserScrolledUp(true);
            }}
            className="fixed bottom-24 left-6 z-50 md:hidden rounded-full bg-indigo-600 p-3 text-white shadow-lg hover:bg-indigo-700 transition-colors"
          >
            Jump to unread
          </button>
        )}

        {/* Live Region for New Message Announcements */}
        <div aria-live="polite" className="sr-only">{announceNewMessage}</div>

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
            <form
              onSubmit={handleSendMessage}
              className="sticky bottom-[56px] sm:bottom-0 bg-white border-t border-gray-100 flex items-center gap-x-2 px-3 py-2.5 shadow-lg pb-safe"
            >
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
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </label>
              {/* Textarea for auto-expansion and scrolling */}
              <textarea
                ref={textareaRef}
                value={newMessageContent}
                onChange={(e) => {
                  setNewMessageContent(e.target.value);
                }}
                onInput={autoResizeTextarea}
                rows={1}
                className="flex-grow rounded-xl px-3.5 py-1.5 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 shadow-sm resize-none overflow-y-auto text-xs font-medium"
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
                className="flex-shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md min-h-0 !min-w-0 !w-9 h-9 p-1"
                disabled={isUploadingAttachment || (!newMessageContent.trim() && !attachmentFile)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </Button>
            </form>

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

            {/* Modals */}
            <SendQuoteModal
              open={showQuoteModal} // Uses the prop value
              onClose={() => setShowQuoteModal(false)} // Uses the prop setter
              onSubmit={handleSendQuote}
              artistId={currentArtistId}
              clientId={currentClientId}
              bookingRequestId={bookingRequestId}
              serviceName={computedServiceName}
              initialBaseFee={initialBaseFee}
              initialTravelCost={initialTravelCost}
              initialSoundNeeded={initialSoundNeeded}
            />
            <QuoteReviewModal
              open={showReviewModal}
              quote={reviewQuote}
              onClose={() => setShowReviewModal(false)}
              onAccept={handleAcceptQuote}
              onDecline={handleDeclineQuote}
            />
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