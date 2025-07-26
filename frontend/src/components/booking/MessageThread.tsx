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
import { Booking, Review, Message, MessageCreate, QuoteV2 } from '@/types';
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
import { useAuth } from '@/contexts/AuthContext';
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
  const [uploading, setUploading] = useState(false);
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
              const details = await getBookingDetails(res.data.booking_id);
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
      const filtered = res.data.filter((m) => {
        if (m.message_type === 'text' && m.content.startsWith('Requesting ')) {
          return false;
        }
        if (
          initialNotes &&
          m.message_type === 'text' &&
          m.content.trim() === initialNotes.trim()
        ) {
          return false;
        }
        return true;
      });
      setMessages(filtered);
      filtered.forEach((m) => {
        if (m.message_type === 'quote' && m.quote_id) {
          ensureQuoteLoaded(m.quote_id);
        }
      });
      setErrorMsg(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch messages', err);
      setErrorMsg((err as Error).message);
      setLoading(false);
    }
  }, [bookingRequestId, ensureQuoteLoaded, initialNotes]);

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
        const msg: Message = JSON.parse(event.data);
        // keep only the latest 200 messages to avoid excessive memory usage
        setMessages((prev) => {
          if (
            prev.some((m) => m.id === msg.id) ||
            (initialNotes &&
              msg.message_type === 'text' &&
              msg.content.trim() === initialNotes.trim())
          ) {
            return prev;
          }
          return [...prev.slice(-199), msg];
        });
        if (msg.message_type === 'quote' && msg.quote_id) {
          ensureQuoteLoaded(msg.quote_id);
        }
      }),
    [onSocketMessage, ensureQuoteLoaded, initialNotes],
  );

  // Create a preview URL whenever the file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return () => {};
  }, [file]);

  // Auto-scroll when messages or typing indicator change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSystemTyping]);

  // Show scroll-to-bottom button when not viewing the latest message
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
          setUploading(true);
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
        setUploading(false);
        fetchMessages();
        if (onMessageSent) onMessageSent();
      } catch (err) {
        console.error('Failed to send message', err);
        setErrorMsg((err as Error).message);
        setUploading(false);
      }
    },
    [newMessage, file, bookingRequestId, fetchMessages, onMessageSent],
  );

  const handleSendQuote = useCallback(
    async (data: QuoteV2Create) => {
      try {
        await createQuoteV2(data);
        setShowQuoteModal(false);
        fetchMessages();
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
        bookingId = acceptRes.data.id;
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
        const details = await getBookingDetails(bookingId || fresh.data.booking_id);
        setBookingDetails(details.data);
        openPaymentModal({
          bookingRequestId,
          depositAmount: details.data.deposit_amount,
          depositDueBy: details.data.deposit_due_by ?? undefined,
        });
        fetchMessages();
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

  // Filter out empty messages before rendering so even 1-character
  // messages like "ok" or "?" still show up
  const visibleMessages = useMemo(
    () => messages.filter((m) => m.content && m.content.trim().length > 0),
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
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6">
      <div className="bg-white shadow-lg rounded-2xl overflow-hidden border flex flex-col min-h-[70vh]">
        <header className="sticky top-0 z-10 bg-brand-dark text-white px-4 py-3 flex items-center justify-between">
          <span className="font-medium text-sm sm:text-base">
            Chat with {user?.user_type === 'artist' ? clientName : artistName}
          </span>
          {user?.user_type === 'artist' || !artistAvatarUrl ? (
            <div className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center text-sm font-medium">
              {(user?.user_type === 'artist' ? clientName : artistName)?.charAt(0)}
            </div>
          ) : artistId ? (
            <Link href={`/artists/${artistId}`} aria-label="Artist profile">
              <Image
                src={getFullImageUrl(artistAvatarUrl) as string}
                alt="avatar"
                width={32}
                height={32}
                loading="lazy"
                className="h-8 w-8 rounded-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
                }}
              />
            </Link>
          ) : (
            <Image
              src={getFullImageUrl(artistAvatarUrl) as string}
              alt="avatar"
              width={32}
              height={32}
              loading="lazy"
              className="h-8 w-8 rounded-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
              }}
            />
          )}
        </header>
        {bookingConfirmed && (
          <AlertBanner variant="success" data-testid="booking-confirmed-banner" className="mt-4">
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
          <>
            <Link
              href={
                bookingDetails
                  ? `/dashboard/client/bookings/${bookingDetails.id}`
                  : `/booking-requests/${bookingRequestId}`
              }
              aria-label="View booking details"
              data-testid="view-booking-link"
              className="mt-2 inline-block text-brand-dark hover:underline text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                      : bookingDetails?.deposit_amount,
                  depositDueBy: bookingDetails?.deposit_due_by ?? undefined,
                })
              }
              data-testid="pay-deposit-button"
              className="mt-2 ml-4 inline-block text-brand-dark underline text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {payDepositLabel}
            </button>
            {bookingDetails && (
              <button
                type="button"
                onClick={handleDownloadCalendar}
                data-testid="add-calendar-button"
                className="mt-2 ml-4 inline-block text-brand-dark underline text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Add to calendar
              </button>
            )}
          </>
        )}
        {paymentStatus && (
          <AlertBanner variant="info" data-testid="payment-status-banner" className="mt-2">
            {paymentStatus === 'paid'
              ? 'Payment completed.'
              : `Deposit of ${formatCurrency(paymentAmount ?? depositAmount ?? 0)} received.`}
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener"
                data-testid="booking-receipt-link"
                className="ml-2 underline"
              >
                View receipt
              </a>
            )}
          </AlertBanner>
        )}
        {paymentError && (
          <p className="text-sm text-red-600" role="alert">{paymentError}</p>
        )}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col gap-2 px-4 py-2"
        >
        {loading ? (
          <div className="flex justify-center py-4" aria-label="Loading messages">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-brand" />
          </div>
        ) : (
          visibleMessages.length === 0 && !isSystemTyping && (
            <p className="text-sm text-gray-500">No messages yet. Start the conversation below.</p>
          )
        )}
        {groupedMessages.map((group, idx) => {
          const firstMsg = group.messages[0];
          const isSystem = firstMsg.message_type === 'system';
          const isSelf = !isSystem && firstMsg.sender_id === user?.id;
          const anyUnread = group.messages.some((m) => m.unread);
          const groupClass = `${idx > 0 ? 'mt-1' : ''} ${anyUnread ? 'bg-indigo-50' : ''}`;

          return (
            <div
              key={firstMsg.id}
              className={`relative flex flex-col gap-0.5 ${isSelf ? 'items-end ml-auto' : 'items-start'} ${groupClass}`}
            >
              {group.divider && (
                <div className="flex items-center my-2" role="separator">
                  <hr className="flex-grow border-t border-gray-300" />
                  <span
                    className="px-2 text-xs text-gray-500 whitespace-nowrap"
                    data-testid="day-divider"
                  >
                    {new Date(firstMsg.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <hr className="flex-grow border-t border-gray-300" />
                </div>
              )}
              <TimeAgo
                timestamp={firstMsg.timestamp}
                className="text-xs text-gray-400 mb-1"
              />
              {anyUnread && (
                <span
                  className="absolute right-0 top-1 w-2 h-2 bg-indigo-600 rounded-full"
                  aria-label="Unread messages"
                />
              )}
              {group.messages.map((msg, mIdx) => {
                const bubbleClass = isSelf
                  ? 'bg-brand text-white self-end'
                  : isSystem
                    ? 'bg-gray-200 text-gray-900 self-start'
                    : 'bg-gray-100 text-gray-800 self-start';
                const bubbleBase =
                  'relative inline-flex min-w-[fit-content] flex-shrink-0 rounded-2xl px-4 py-2 pr-12 text-sm leading-snug max-w-[70%] sm:max-w-[60%]';

                const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                const timeClass =
                  'absolute bottom-1 right-2 text-xs text-right text-gray-400';

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, translateY: 8 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    className={`flex flex-col ${mIdx < group.messages.length - 1 ? 'mb-0.5' : ''}`}
                  >
                    <div className={`flex items-end gap-2 ${isSelf ? 'justify-end ml-auto' : 'justify-start'}`}>
                      <div
                        className={`${bubbleBase} whitespace-pre-wrap ${bubbleClass}`}
                      >
                        <div className="flex-1">
                          {msg.message_type === 'quote' && msg.quote_id && quotes[msg.quote_id] ? (
                            <>
                            <QuoteBubble
                              description={quotes[msg.quote_id].services[0]?.description || ''}
                              price={Number(quotes[msg.quote_id].services[0]?.price || 0)}
                              soundFee={Number(quotes[msg.quote_id].sound_fee)}
                              travelFee={Number(quotes[msg.quote_id].travel_fee)}
                              accommodation={quotes[msg.quote_id].accommodation || undefined}
                              discount={quotes[msg.quote_id].discount || undefined}
                              subtotal={Number(quotes[msg.quote_id].subtotal)}
                              total={Number(quotes[msg.quote_id].total)}
                              status={
                                {
                                  pending: 'Pending',
                                  accepted: 'Accepted',
                                  rejected: 'Rejected',
                                  expired: 'Rejected',
                                }[quotes[msg.quote_id].status]
                              }
                            />
                            {user?.user_type === 'client' &&
                              quotes[msg.quote_id].status === 'pending' &&
                              !bookingConfirmed && (
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    isLoading={acceptingQuoteId === msg.quote_id}
                                    onClick={() =>
                                      handleAcceptQuote(quotes[msg.quote_id])
                                    }
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      handleDeclineQuote(quotes[msg.quote_id])
                                    }
                                  >
                                    Decline
                                  </Button>
                                </div>
                              )}
                            </>
                          ) : msg.message_type === 'system' && msg.content.startsWith(BOOKING_DETAILS_PREFIX) ? (
                            <div data-testid="booking-details" className="rounded-lg border border-gray-300 bg-gray-100 mt-1">
                              <button
                                type="button"
                                data-testid="booking-details-button"
                                aria-expanded={openDetails[msg.id] ? 'true' : 'false'}
                                onClick={() =>
                                  setOpenDetails((prev) => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id],
                                  }))
                                }
                                className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
                              >
                                <span>Booking details</span>
                                <ChevronDownIcon
                                  className={`h-4 w-4 transition-transform ${openDetails[msg.id] ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              </button>
                              <div
                                className={`overflow-hidden transition-all ${openDetails[msg.id] ? 'max-h-96' : 'max-h-0'}`}
                                data-testid="booking-details-content"
                                aria-hidden={openDetails[msg.id] ? 'false' : 'true'}
                              >
                                <dl className="px-4 py-3 text-sm text-gray-800 grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
                                  {msg.content
                                    .slice(BOOKING_DETAILS_PREFIX.length)
                                    .trim()
                                    .split('\n')
                                    .map((line) => line.split(':'))
                                    .filter((parts) => parts.length === 2)
                                    .map(([label, value]) => (
                                      <React.Fragment key={label.trim()}>
                                        <dt className="font-medium">{label.trim()}</dt>
                                        <dd>{value.trim()}</dd>
                                      </React.Fragment>
                                    ))}
                                </dl>
                              </div>
                            </div>
                          ) : (
                            msg.content
                          )}{' '}
                          {msg.attachment_url && (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              className="block text-indigo-600 underline mt-1 text-sm"
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
          <div className="flex items-end gap-2">
            <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
              {artistName?.charAt(0)}
            </div>
            <div className="bg-gray-200 rounded-2xl px-3 py-2">
              <div className="flex space-x-1 animate-pulse">
                <span className="block w-2 h-2 bg-gray-500 rounded-full" />
                <span className="block w-2 h-2 bg-gray-500 rounded-full" />
                <span className="block w-2 h-2 bg-gray-500 rounded-full" />
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
          className="fixed bottom-20 right-4 z-50 md:hidden rounded-full bg-brand-dark p-2 text-white shadow"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
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
            <div className="flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2">
              {file && file.type.startsWith('image/') ? (
                <Image
                  src={previewUrl}
                  alt="preview"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="w-10 h-10 object-cover rounded"
                />
              ) : (
                <span className="text-sm">{file?.name}</span>
              )}
              <button type="button" onClick={() => setFile(null)} className="text-sm text-red-600">
                Remove
              </button>
            </div>
          )}
          <form
            onSubmit={handleSend}
            className="sticky bottom-0 bg-white border-t flex flex-row items-center gap-x-2 px-4 py-3"
          >
            <label
              htmlFor="file-upload"
              aria-label="Upload attachment"
              className="w-8 h-8 flex items-center justify-center text-gray-600 rounded-full hover:bg-gray-100"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
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
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
            <TextInput
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="rounded-full px-4 py-2"
              placeholder="Type a message"
            />
            {uploading && (
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
                <div className="w-16 bg-gray-200 rounded h-1">
                  <div className="bg-brand h-1 rounded" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs">{uploadProgress}%</span>
              </div>
            )}
            <Button
              type="submit"
              aria-label="Send message"
              variant="primary"
              className="rounded-full bg-brand"
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Send'}
            </Button>
          </form>
          {user.user_type === 'artist' && !bookingConfirmed && (
            <Button
              type="button"
              onClick={() => setShowQuoteModal(true)}
              className="mt-2 text-sm text-brand-dark underline hover:bg-indigo-600 hover:text-white transition-colors fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:static sm:translate-x-0 sm:w-auto"
            >
              Send Quote
            </Button>
          )}
          <SendQuoteModal
            open={showQuoteModal}
            onClose={() => setShowQuoteModal(false)}
            onSubmit={handleSendQuote}
            artistId={artistId ?? user.id}
            clientId={clientId ?? messages.find((m) => m.sender_type === 'client')?.sender_id ?? 0}
            bookingRequestId={bookingRequestId}
            serviceName={computedServiceName}
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
                className="mt-2 text-sm text-brand-dark underline"
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
        <p className="text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}
      {wsFailed && (
        <p className="text-sm text-red-600" role="alert">
          Connection lost. Please refresh the page or sign in again.
        </p>
      )}
        </div>
      </div>
  );
});

export default React.memo(MessageThread);
