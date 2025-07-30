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
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import TimeAgo from '../ui/TimeAgo';
import {
  getFullImageUrl,
  formatCurrency,
  formatDepositReminder,
} from '@/lib/utils';
import AlertBanner from '../ui/AlertBanner';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Booking, Review, Message, MessageCreate, QuoteV2, QuoteV2Create } from '@/types';
import {
  getMessagesForBookingRequest,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  createQuoteV2,
  getQuoteV2,
  acceptQuoteV2,
  updateQuoteAsClient,
  getBookingDetails,
  downloadBookingIcs,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext'; // Corrected import path for AuthContext
import Button from '../ui/Button';
import TextInput from '../ui/TextInput';
import SendQuoteModal from './SendQuoteModal';
import usePaymentModal from '@/hooks/usePaymentModal';
import QuoteBubble from './QuoteBubble';
import useWebSocket from '@/hooks/useWebSocket';
import ReviewFormModal from '../review/ReviewFormModal';

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const wsBase =
  process.env.NEXT_PUBLIC_WS_URL || apiBase.replace(/^http/, 'ws');
const API_V1 = '/api/v1';

export interface MessageThreadHandle {
  refreshMessages: () => void;
}

// Define a type for the parsed booking details from the system message
interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string; // Keep as string for now, parse in parent if needed
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

interface MessageThreadProps {
  bookingRequestId: number;
  /** Optional callback invoked after a message is successfully sent */
  onMessageSent?: () => void;
  /** Optional callback invoked after a quote is successfully sent */
  onQuoteSent?: () => void;
  /** Service ID for accepting quotes when the request lacks one */
  serviceId?: number;
  clientName?: string;
  artistName?: string;
  clientId?: number;
  artistId?: number;
  artistAvatarUrl?: string | null;
  isSystemTyping?: boolean;
  serviceName?: string;
  /** Initial notes entered with the booking request. These may exist as a
   * message in older threads but should be hidden from the conversation view. */
  initialNotes?: string | null;
  /** Callback to pass parsed booking details from system message up to parent */
  onBookingDetailsParsed?: (details: ParsedBookingDetails) => void;
  // New props for initial quote data for artist to edit
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
}

const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(
  function MessageThread(
    {
      bookingRequestId,
      onMessageSent,
      onQuoteSent,
      serviceId,
      clientName = 'Client',
      artistName = 'Artist',
      clientId,
      artistId,
      artistAvatarUrl = null,
      isSystemTyping = false,
      serviceName,
      initialNotes = null,
      onBookingDetailsParsed,
      initialBaseFee,
      initialTravelCost,
      initialSoundNeeded,
    }: MessageThreadProps,
    ref,
  ) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [quotes, setQuotes] = useState<Record<number, QuoteV2>>({});
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [depositAmount] = useState<number | undefined>(undefined);
  const [bookingDetails, setBookingDetails] = useState<Booking | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const payDepositLabel = 'Pay deposit';
  const [wsFailed, setWsFailed] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [announceNewMessage, setAnnounceNewMessage] = useState('');
  const [openDetails, setOpenDetails] = useState<Record<number, boolean>>({});
  const prevLengthRef = useRef(0);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<number | null>(null);
  const computedServiceName = serviceName ?? bookingDetails?.service?.title;

  const { openPaymentModal, paymentModal } = usePaymentModal(
    ({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status);
      setPaymentAmount(amount);
      setReceiptUrl(url ?? null);
      setPaymentError(null);
    },
    (msg) => setPaymentError(msg),
  );

  // Helper to parse booking details from system message content
  const parseBookingDetailsFromMessage = useCallback((content: string): ParsedBookingDetails => {
    const details: ParsedBookingDetails = {};
    const lines = content.replace(BOOKING_DETAILS_PREFIX, '').trim().split('\n');
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim();
        switch (key) {
          case 'Event Type': details.eventType = value; break;
          case 'Description': details.description = value; break;
          case 'Date': details.date = value; break;
          case 'Location': details.location = value; break;
          case 'Guests': details.guests = value; break;
          case 'Venue': details.venueType = value; break;
          case 'Sound': details.soundNeeded = value; break;
          case 'Notes': details.notes = value; break;
        }
      }
    });
    return details;
  }, []);

  // Moved ensureQuoteLoaded declaration here to fix hoisting issue
  const ensureQuoteLoaded = useCallback(
    async (quoteId: number) => {
      if (quotes[quoteId]) return;
      try {
        const res = await getQuoteV2(quoteId);
        setQuotes((prev) => ({ ...prev, [quoteId]: res.data }));
        if (res.data.status === 'accepted') {
          setBookingConfirmed(true);
          if (!bookingDetails) {
            try {
              const details = await getBookingDetails(res.data.booking_id ?? 0);
              setBookingDetails(details.data);
            } catch (err2) {
              console.error('Failed to fetch booking details', err2);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch quote', err);
      }
    },
    [quotes, bookingDetails],
  );


  const fetchMessages = useCallback(async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      let parsedDetails: ParsedBookingDetails | undefined;

      const filtered = res.data.filter((m_item) => {
        if (m_item.message_type === 'system' && m_item.content.startsWith(BOOKING_DETAILS_PREFIX)) {
          parsedDetails = parseBookingDetailsFromMessage(m_item.content);
          return false;
        }
        if (m_item.message_type === 'text' && m_item.content.startsWith('Requesting ')) {
          return false;
        }
        if (initialNotes && m_item.message_type === 'text' && m_item.content.trim() === initialNotes.trim()) {
          return false;
        }
        return true;
      });

      setMessages(filtered);
      filtered.forEach((m_item) => {
        if (m_item.message_type === 'quote' && typeof m_item.quote_id === 'number') {
          void ensureQuoteLoaded(m_item.quote_id);
        }
      });

      if (parsedDetails && onBookingDetailsParsed) {
        onBookingDetailsParsed(parsedDetails);
      }

      setErrorMsg(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch messages', err);
      setErrorMsg((err as Error).message);
      setLoading(false);
    }
  }, [bookingRequestId, ensureQuoteLoaded, initialNotes, parseBookingDetailsFromMessage, onBookingDetailsParsed]);


  useImperativeHandle(ref, () => ({
    refreshMessages: async () => {
      await fetchMessages();
    },
  }));

  useEffect(() => {
    setLoading(true);
    fetchMessages();
  }, [bookingRequestId, fetchMessages]);

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('token') ||
        sessionStorage.getItem('token') ||
        ''
      : '';
  const { onMessage: onSocketMessage } = useWebSocket(
    `${wsBase}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
    (e) => {
      if (e?.code === 4401) {
        setErrorMsg('Authentication error. Please sign in again.');
      } else {
        setWsFailed(true);
      }
    },
  );

  useEffect(
    () =>
      onSocketMessage((event) => {
        const msg = JSON.parse(event.data) as Message;
        if (msg.message_type === 'system' && msg.content.startsWith(BOOKING_DETAILS_PREFIX)) {
          if (onBookingDetailsParsed) {
            onBookingDetailsParsed(parseBookingDetailsFromMessage(msg.content));
          }
          return;
        }

        setMessages((prev) => {
          if (
            prev.some((prevMsg) => prevMsg.id === msg.id) ||
            (initialNotes && msg.message_type === 'text' && msg.content.trim() === initialNotes.trim())
          ) {
            return prev;
          }
          return [...prev.slice(-199), msg];
        });
        if (msg.message_type === 'quote' && typeof msg.quote_id === 'number') {
          void ensureQuoteLoaded(msg.quote_id);
        }
      }),
    [onSocketMessage, ensureQuoteLoaded, initialNotes, onBookingDetailsParsed, parseBookingDetailsFromMessage],
  );

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return () => {};
  }, [file]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSystemTyping]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 20;
    setShowScrollButton(!atBottom);
  }, []);

  useEffect(() => {
    if (prevLengthRef.current && messages.length > prevLengthRef.current && showScrollButton) {
      setAnnounceNewMessage('New messages available');
    }
    prevLengthRef.current = messages.length;
  }, [messages, showScrollButton]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() && !file) return;
      try {
        let attachment_url: string | undefined;
        if (file) {
          setUploading(1);
          const res = await uploadMessageAttachment(
            bookingRequestId,
            file,
            (evt) => {
              if (evt.total) {
                setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
              }
            },
          );
          attachment_url = res.data.url;
        }
        const payload: MessageCreate = {
          content: newMessage.trim(),
          attachment_url,
        };
        await postMessageToBookingRequest(bookingRequestId, payload);
        setNewMessage('');
        setFile(null);
        setPreviewUrl(null);
        setUploadProgress(0);
        setUploading(0);
        void fetchMessages();
        if (onMessageSent) onMessageSent();
      } catch (err) {
        console.error('Failed to send message', err);
        setErrorMsg((err as Error).message);
        setUploading(0);
      }
    },
    [newMessage, file, bookingRequestId, fetchMessages, onMessageSent],
  );

  const handleSendQuote = useCallback(
    async (data: QuoteV2Create) => {
      try {
        await createQuoteV2(data);
        setShowQuoteModal(false);
        void fetchMessages();
        if (onMessageSent) onMessageSent();
        if (onQuoteSent) onQuoteSent();
      } catch (err) {
        console.error('Failed to send quote', err);
        setErrorMsg((err as Error).message);
      }
    },
    [fetchMessages, onMessageSent, onQuoteSent],
  );

  const handleAcceptQuote = useCallback(
    async (q: QuoteV2) => {
      setAcceptingQuoteId(q.id);
      let bookingId: number | undefined;
      try {
        const acceptRes = await acceptQuoteV2(q.id, serviceId);
        bookingId = acceptRes.data.id ?? undefined;
      } catch (err) {
        console.error('acceptQuoteV2 failed', err);
        setErrorMsg((err as Error).message);
        setAcceptingQuoteId(null);
        return;
      }
      try {
        const fresh = await getQuoteV2(q.id);
        setQuotes((prev) => ({ ...prev, [q.id]: fresh.data }));
        setBookingConfirmed(true);
        const details = await getBookingDetails(bookingId ?? fresh.data.booking_id ?? 0);
        setBookingDetails(details.data);
        openPaymentModal({
          bookingRequestId,
          depositAmount: details.data.deposit_amount ?? undefined,
          depositDueBy: details.data.deposit_due_by ?? undefined,
        });
        void fetchMessages();
      } catch (err3) {
        console.error('Failed to finalize acceptance', err3);
      } finally {
        setAcceptingQuoteId(null);
      }
  },
  [bookingRequestId, fetchMessages, openPaymentModal, serviceId],
);

  const handleDeclineQuote = useCallback(
    async (q: QuoteV2) => {
      try {
        await updateQuoteAsClient(q.id, { status: 'rejected_by_client' });
        const res = await getQuoteV2(q.id);
        setQuotes((prev) => ({ ...prev, [q.id]: res.data }));
      } catch (err) {
        console.error('Failed to decline quote', err);
        setErrorMsg('Failed to decline quote. Please refresh and try again.');
      }
    },
    [],
  );


  const handleDownloadCalendar = useCallback(async () => {
    if (!bookingDetails) return;
    try {
      const res = await downloadBookingIcs(bookingDetails.id);
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `booking-${bookingDetails.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Calendar download error', err);
    }
  }, [bookingDetails]);

  const visibleMessages = useMemo(
    () => messages.filter((m_item) =>
      m_item.content && m_item.content.trim().length > 0 &&
      !(m_item.message_type === 'system' && m_item.content.startsWith(BOOKING_DETAILS_PREFIX))
    ),
    [messages],
  );

  const TEN_MINUTES_MS = 10 * 60 * 1000;

  interface MessageGroup {
    sender_id: number | null;
    sender_type: string;
    messages: Message[];
    divider: boolean;
  }

  const shouldShowTimestampGroup = useCallback(
    (msg: Message, index: number, list: Message[]) => {
      if (index === 0) return true;
      const prev = list[index - 1];
      const sameSender =
        prev.sender_id === msg.sender_id && prev.sender_type === msg.sender_type;
      const prevTime = new Date(prev.timestamp).getTime();
      const currTime = new Date(msg.timestamp).getTime();
      const withinWindow = currTime - prevTime < TEN_MINUTES_MS;
      const sameDay =
        new Date(prev.timestamp).toDateString() ===
        new Date(msg.timestamp).toDateString();
      return !(sameSender && withinWindow && sameDay);
    },
    [TEN_MINUTES_MS],
  );

  const groupedMessages = useMemo(() => {
    const groups: MessageGroup[] = [];
    visibleMessages.forEach((msg, idx) => {
      const divider =
        idx > 0 &&
        new Date(msg.timestamp).toDateString() !==
          new Date(visibleMessages[idx - 1].timestamp).toDateString();
      if (shouldShowTimestampGroup(msg, idx, visibleMessages) || groups.length === 0) {
        groups.push({
          sender_id: msg.sender_id,
          sender_type: msg.sender_type,
          messages: [msg],
          divider,
        });
      } else {
        const last = groups[groups.length - 1];
        last.messages.push(msg);
        if (divider) {
          last.divider = true;
        }
      }
    });
    return groups;
  }, [visibleMessages, shouldShowTimestampGroup]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 font-inter">
      <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100 flex flex-col min-h-[70vh]">
        <header className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-indigo-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
          <span className="font-semibold text-lg sm:text-xl">
            Chat with {user?.user_type === 'artist' ? clientName : artistName}
          </span>
          {user?.user_type === 'artist' || !artistAvatarUrl ? (
            <div className="h-10 w-10 rounded-full bg-red-400 flex items-center justify-center text-base font-medium border-2 border-white shadow-sm">
              {(user?.user_type === 'artist' ? clientName : artistName)?.charAt(0)}
            </div>
          ) : artistId ? (
            <Link href={`/artists/${artistId}`} aria-label="Artist profile">
              <Image
                src={getFullImageUrl(artistAvatarUrl) as string}
                alt="avatar"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            </Link>
          ) : (
            <Image
              src={getFullImageUrl(artistAvatarUrl) as string}
              alt="avatar"
              width={40}
              height={40}
              loading="lazy"
              className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
            />
          )}
        </header>

        {bookingConfirmed && (
          <AlertBanner variant="success" data-testid="booking-confirmed-banner" className="mt-4 mx-4 rounded-lg">
            🎉 Booking confirmed for {artistName}!{' '}
            {bookingDetails && (
              <>
                {bookingDetails.service?.title} on{' '}
                {new Date(bookingDetails.start_time).toLocaleString()}.{' '}
                {formatDepositReminder(
                  depositAmount ?? bookingDetails.deposit_amount ?? 0,
                  bookingDetails.deposit_due_by ?? undefined,
                )}
              </>
            )}
          </AlertBanner>
        )}
        {bookingConfirmed && (
          <div className="flex flex-wrap gap-3 mx-4 mt-3">
            <Link
              href={
                bookingDetails
                  ? `/dashboard/client/bookings/${bookingDetails.id}`
                  : `/booking-requests/${bookingRequestId}`
              }
              aria-label="View booking details"
              data-testid="view-booking-link"
              className="inline-block text-indigo-600 hover:underline text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              View booking
            </Link>
            <button
              type="button"
              onClick={() =>
                openPaymentModal({
                  bookingRequestId,
                  depositAmount:
                    depositAmount !== undefined
                      ? depositAmount
                      : bookingDetails?.deposit_amount ?? undefined,
                  depositDueBy: bookingDetails?.deposit_due_by ?? undefined,
                })
              }
              data-testid="pay-deposit-button"
              className="inline-block text-indigo-600 underline text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {payDepositLabel}
            </button>
            {bookingDetails && (
              <button
                type="button"
                onClick={handleDownloadCalendar}
                data-testid="add-calendar-button"
                className="inline-block text-indigo-600 underline text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Add to calendar
              </button>
            )}
          </div>
        )}
        {paymentStatus && (
          <AlertBanner variant="info" data-testid="payment-status-banner" className="mt-2 mx-4 rounded-lg">
            {paymentStatus === 'paid'
              ? 'Payment completed.'
              : `Deposit of ${formatCurrency(paymentAmount ?? depositAmount ?? 0)} received.`}
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener"
                data-testid="booking-receipt-link"
                className="ml-2 underline text-indigo-600"
              >
                View receipt
              </a>
            )}
          </AlertBanner>
        )}
        {paymentError && (
          <p className="text-sm text-red-600 mx-4" role="alert">{paymentError}</p>
        )}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col gap-3 px-4 py-4 bg-gray-50"
        >
        {loading ? (
          <div className="flex justify-center py-6" aria-label="Loading messages">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
          </div>
        ) : (
          visibleMessages.length === 0 && !isSystemTyping && (
            <p className="text-sm text-gray-500 text-center py-4">No messages yet. Start the conversation below.</p>
          )
        )}
        {groupedMessages.map((group, idx) => {
          const firstMsg = group.messages[0];
          const isSystem = firstMsg.message_type === 'system';
          const isSelf = !isSystem && firstMsg.sender_id === user?.id;
          const anyUnread = group.messages.some((m_item) => m_item.unread);
          const groupClass = `${idx > 0 ? 'mt-4' : ''} ${anyUnread ? 'bg-indigo-50 rounded-xl p-3 shadow-sm' : ''}`;

          return (
            <div
              key={firstMsg.id}
              className={`relative flex flex-col ${isSelf ? 'items-end ml-auto' : 'items-start'} ${groupClass}`}
            >
              {group.divider && (
                <div className="flex items-center my-4 w-full" role="separator">
                  <hr className="flex-grow border-t border-gray-200" />
                  <span
                    className="px-3 text-xs text-gray-500 whitespace-nowrap"
                    data-testid="day-divider"
                  >
                    {new Date(firstMsg.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <hr className="flex-grow border-t border-gray-200" />
                </div>
              )}
              {/* Sender Name/Avatar for received messages (not system) */}
              {!isSelf && !isSystem && (
                <div className="flex items-center mb-1">
                  <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium mr-2">
                    {artistName?.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{artistName}</span>
                </div>
              )}
              {/* Timestamp for the first message in the group */}
              <TimeAgo
                timestamp={firstMsg.timestamp}
                className={`text-xs text-gray-500 mb-1 ${isSelf ? 'text-right' : 'text-left'}`}
              />
              {anyUnread && (
                <span
                  className="absolute right-0 top-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"
                  aria-label="Unread messages"
                />
              )}
              {group.messages.map((msg, mIdx) => {
                const bubbleClass = isSelf
                  ? 'bg-indigo-600 text-white rounded-br-none' // Sent message style
                  : isSystem
                    ? 'bg-gray-200 text-gray-800' // System message style
                    : 'bg-gray-200 text-gray-800 rounded-bl-none'; // Received message style
                const bubbleBase =
                  'relative inline-flex min-w-[fit-content] flex-shrink-0 rounded-2xl px-4 py-2 text-sm leading-snug max-w-[70%] shadow-sm';

                const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                const timeClass =
                  'absolute bottom-1 right-2 text-xs text-right text-gray-400 opacity-80';

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, translateY: 8 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    className={`flex flex-col ${mIdx < group.messages.length - 1 ? 'mb-1' : ''}`}
                  >
                    <div className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`${bubbleBase} whitespace-pre-wrap ${bubbleClass}`}
                      >
                        <div className="flex-1 pr-8"> {/* Added pr for timestamp space */}
                          {msg.message_type === 'quote' && typeof msg.quote_id === 'number' ? (
                            (() => {
                              const q = quotes[msg.quote_id];
                              if (!q) return null;
                              return (
                                <>
                                  <QuoteBubble
                                    description={q.services[0]?.description || ''}
                                    price={Number(q.services[0]?.price || 0)}
                                    soundFee={Number(q.sound_fee)}
                                    travelFee={Number(q.travel_fee)}
                                    accommodation={q.accommodation || undefined}
                                    discount={Number(q.discount) || undefined}
                                    subtotal={Number(q.subtotal)}
                                    total={Number(q.total)}
                                    status={
                                      q.status === 'pending'
                                        ? 'Pending'
                                        : q.status === 'accepted'
                                          ? 'Accepted'
                                          : q.status === 'rejected' || q.status === 'expired'
                                            ? 'Rejected'
                                            : 'Pending'
                                    }
                                  />
                                  {user?.user_type === 'client' &&
                                    q.status === 'pending' &&
                                    !bookingConfirmed && (
                                      <div className="mt-3 flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          isLoading={acceptingQuoteId === msg.quote_id}
                                          onClick={() => handleAcceptQuote(q)}
                                          className="bg-green-500 hover:bg-green-600 text-white rounded-full px-4 py-2 text-xs font-semibold shadow-md"
                                        >
                                          Accept
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => handleDeclineQuote(q)}
                                          className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-full px-4 py-2 text-xs font-semibold shadow-md"
                                        >
                                          Decline
                                        </Button>
                                      </div>
                                    )}
                                </>
                              );
                            })()
                          ) : (
                            msg.content
                          )}{' '}
                          {msg.attachment_url && (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              className="block text-indigo-400 underline mt-1 text-sm hover:text-indigo-300"
                              rel="noopener noreferrer"
                            >
                              View attachment
                            </a>
                          )}
                        </div>
                        <time
                          dateTime={msg.timestamp}
                          title={new Date(msg.timestamp).toLocaleString()}
                          className={timeClass}
                        >
                          <span className="sr-only">
                            {new Date(msg.timestamp).toLocaleString()}
                          </span>
                          {timeString}
                        </time>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          );
        })}
        {isSystemTyping && (
          <div className="flex items-end gap-3 self-start">
            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium shadow-sm">
              {artistName?.charAt(0)}
            </div>
            <div className="bg-gray-200 rounded-2xl px-4 py-2 shadow-sm">
              <div className="flex space-x-1 animate-pulse">
                <span className="block w-2.5 h-2.5 bg-gray-500 rounded-full" />
                <span className="block w-2.5 h-2.5 bg-gray-500 rounded-full" />
                <span className="block w-2.5 h-2.5 bg-gray-500 rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {showScrollButton && (
        <button
          type="button"
          aria-label="Scroll to latest message"
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
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
      <div aria-live="polite" className="sr-only">{announceNewMessage}</div>
      {user && (
        <>
          {previewUrl && (
            <div className="flex items-center gap-3 mb-2 bg-gray-100 rounded-xl p-3 mx-4 shadow-inner">
              {file && file.type.startsWith('image/') ? (
                <Image
                  src={previewUrl}
                  alt="preview"
                  width={50}
                  height={50}
                  loading="lazy"
                  className="w-12 h-12 object-cover rounded-md border border-gray-200"
                />
              ) : (
                <span className="text-sm text-gray-700 font-medium">{file?.name}</span>
              )}
              <button type="button" onClick={() => setFile(null)} className="text-sm text-red-600 hover:text-red-700 font-medium">
                Remove
              </button>
            </div>
          )}
          <form
            onSubmit={handleSend}
            className="sticky bottom-0 bg-white border-t border-gray-100 flex flex-row items-center gap-x-3 px-4 py-3 shadow-lg"
          >
            <label
              htmlFor="file-upload"
              aria-label="Upload attachment"
              className="w-10 h-10 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12.857v4.286A2.857 2.857 0 0 1 18.143 20H5.857A2.857 2.857 0 0 1 3 17.143V6.857A2.857 2.857 0 0 1 5.857 4h4.286"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 3h6m0 0v6m0-6L10 14"
                />
              </svg>
            </label>
            <TextInput
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow rounded-full px-4 py-2.5 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 shadow-sm"
              placeholder="Type your message..."
            />
            {uploading > 0 && (
              <div
                className="flex items-center gap-2"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                aria-valuetext={`${uploadProgress}%`}
                aria-live="polite"
              >
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs text-gray-600">{uploadProgress}%</span>
              </div>
            )}
            <Button
              type="submit"
              aria-label="Send message"
              variant="primary"
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 font-semibold shadow-md"
              disabled={uploading > 0 || (!newMessage.trim() && !file)}
            >
              {uploading > 0 ? 'Uploading…' : 'Send'}
            </Button>
          </form>
          {user.user_type === 'artist' && !bookingConfirmed && (
            <Button
              type="button"
              onClick={() => setShowQuoteModal(true)}
              className="mt-4 text-sm text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors rounded-full px-6 py-2 font-semibold shadow-sm fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:static sm:translate-x-0 sm:w-auto"
            >
              View Quote
            </Button>
          )}
          <SendQuoteModal
            open={showQuoteModal}
            onClose={() => setShowQuoteModal(false)}
            onSubmit={handleSendQuote}
            artistId={artistId ?? user.id}
            clientId={clientId ?? messages.find((m_item) => m_item.sender_type === 'client')?.sender_id ?? 0}
            bookingRequestId={bookingRequestId}
            serviceName={computedServiceName}
            initialBaseFee={initialBaseFee}
            initialTravelCost={initialTravelCost}
            initialSoundNeeded={initialSoundNeeded}
          />
          {paymentModal}
          {bookingDetails &&
            bookingDetails.status === 'completed' &&
            !(
              (
                bookingDetails as Booking & {
                  review?: Review;
                }
              ).review
            ) && (
              <Button
                type="button"
                onClick={() => setShowReviewModal(true)}
                className="mt-2 text-sm text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
              >
                Leave Review
              </Button>
            )}
          <ReviewFormModal
            isOpen={showReviewModal}
            bookingId={bookingDetails?.id ?? 0}
            onClose={() => setShowReviewModal(false)}
            onSubmitted={(rev) =>
              setBookingDetails((prev) =>
                prev ? { ...prev, review: rev } : prev,
              )
            }
          />
        </>
      )}
      {errorMsg && (
        <p className="text-sm text-red-600 mx-4 mt-2" role="alert">{errorMsg}</p>
      )}
      {wsFailed && (
        <p className="text-sm text-red-600 mx-4 mt-2" role="alert">
          Connection lost. Please refresh the page or sign in again.
        </p>
      )}
        </div>
      </div>
  );
});

export default React.memo(MessageThread);