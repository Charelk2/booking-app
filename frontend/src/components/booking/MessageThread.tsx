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
import { formatDistanceToNow } from 'date-fns';
import { getFullImageUrl } from '@/lib/utils';
import { Message, MessageCreate, Quote } from '@/types';
import {
  getMessagesForBookingRequest,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  getQuotesForBookingRequest,
  createQuoteForRequest,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import Button from '../ui/Button';
import useWebSocket from '@/hooks/useWebSocket';

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
  clientName?: string;
  artistName?: string;
  artistAvatarUrl?: string | null;
  isSystemTyping?: boolean;
}

const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(
  function MessageThread(
    {
      bookingRequestId,
      onMessageSent,
      clientName = 'Client',
      artistName = 'Artist',
      artistAvatarUrl = null,
      isSystemTyping = false,
    }: MessageThreadProps,
    ref,
  ) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [quotes, setQuotes] = useState<Record<number, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState('');
  const [quotePrice, setQuotePrice] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [announceNewMessage, setAnnounceNewMessage] = useState('');
  const prevLengthRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      const filtered = res.data.filter(
        (m) =>
          !(
            (m.message_type === 'text' && m.content.startsWith('Requesting ')) ||
            (m.message_type === 'system' && m.content === 'Booking request sent')
          ),
      );
      setMessages(filtered);
      setErrorMsg(null);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch messages', err);
      setErrorMsg('Failed to load messages');
      setLoading(false);
    }
  }, [bookingRequestId]);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await getQuotesForBookingRequest(bookingRequestId);
      const map: Record<number, Quote> = {};
      res.data.forEach((q) => {
        map[q.id] = q;
      });
      setQuotes(map);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch quotes', err);
      setErrorMsg('Failed to load quotes');
      setLoading(false);
    }
  }, [bookingRequestId]);

  useImperativeHandle(ref, () => ({
    refreshMessages: async () => {
      await fetchMessages();
      await fetchQuotes();
    },
  }));

  useEffect(() => {
    setLoading(true);
    fetchMessages();
    fetchQuotes();
  }, [bookingRequestId, fetchMessages, fetchQuotes]);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const { onMessage: onSocketMessage } = useWebSocket(
    `${wsBase}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
  );

  useEffect(
    () =>
      onSocketMessage((event) => {
        const msg: Message = JSON.parse(event.data);
        // keep only the latest 200 messages to avoid excessive memory usage
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev;
          }
          return [...prev.slice(-199), msg];
        });
        if (msg.message_type === 'quote') {
          fetchQuotes();
        }
      }),
    [onSocketMessage, fetchQuotes],
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
        setErrorMsg('Failed to send message');
        setUploading(false);
      }
    },
    [newMessage, file, bookingRequestId, fetchMessages, onMessageSent],
  );

  const handleSendQuote = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await createQuoteForRequest(bookingRequestId, {
          booking_request_id: bookingRequestId,
          quote_details: quoteDetails,
          price: Number(quotePrice),
        });
        setShowQuoteForm(false);
        setQuoteDetails('');
        setQuotePrice('');
        fetchMessages();
        fetchQuotes();
        if (onMessageSent) onMessageSent();
      } catch (err) {
        console.error('Failed to send quote', err);
        setErrorMsg('Failed to send quote');
      }
    },
    [
      bookingRequestId,
      quoteDetails,
      quotePrice,
      fetchMessages,
      fetchQuotes,
      onMessageSent,
    ],
  );

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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="bg-white shadow-lg rounded-2xl overflow-hidden border flex flex-col min-h-[70vh]">
        <header className="sticky top-0 z-10 bg-[#2F2B5C] text-white px-4 py-3 flex items-center justify-between">
          <span className="font-medium">
            Chat with {user?.user_type === 'artist' ? clientName : artistName}
          </span>
          {user?.user_type === 'artist' || !artistAvatarUrl ? (
            <div className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center text-sm font-medium">
              {(user?.user_type === 'artist' ? clientName : artistName)?.charAt(0)}
            </div>
          ) : (
            <Image
              src={getFullImageUrl(artistAvatarUrl) as string}
              alt="avatar"
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          )}
        </header>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col gap-2 px-4 py-2"
        >
        {loading ? (
          <div className="flex justify-center py-4" aria-label="Loading messages">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600" />
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
          const groupClass = `${idx > 0 ? 'mt-1' : ''} ${anyUnread ? 'bg-purple-50' : ''}`;
          const groupDate = new Date(firstMsg.timestamp);
          const relativeGroupTime = formatDistanceToNow(groupDate, {
            addSuffix: true,
          });
          const fullGroupTime = groupDate.toLocaleString();

          return (
            <div
              key={firstMsg.id}
              className={`flex flex-col gap-0.5 ${isSelf ? 'items-end ml-auto' : 'items-start'} ${groupClass}`}
            >
              {group.divider && (
                <hr className="border-t border-gray-300 w-full my-2" />
              )}
              <time
                className="text-xs text-gray-400 mb-1"
                title={fullGroupTime}
              >
                {relativeGroupTime}
                <span className="sr-only">{fullGroupTime}</span>
              </time>
              {group.messages.map((msg, mIdx) => {
                const bubbleClass = isSelf
                  ? 'bg-[#4F46E5] text-white self-end'
                  : isSystem
                    ? 'bg-gray-200 text-gray-900 self-start'
                    : 'bg-gray-100 text-gray-800 self-start';
                const bubbleBase =
                  'relative inline-flex min-w-[fit-content] flex-shrink-0 rounded-2xl px-4 py-2 pr-12 text-sm leading-snug max-w-[70%] sm:max-w-[60%]';

                const msgDate = new Date(msg.timestamp);
                const timeString = msgDate.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                const fullTimeString = msgDate.toLocaleString();
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
                            <div className="text-gray-800">
                              <p className="font-medium">{quotes[msg.quote_id].quote_details}</p>
                              <p className="text-sm mt-1">
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: quotes[msg.quote_id].currency,
                                }).format(Number(quotes[msg.quote_id].price))}
                              </p>
                            </div>
                          ) : (
                            msg.content
                          )}{' '}
                          {msg.attachment_url && (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              className="block text-blue-600 underline mt-1 text-sm"
                              rel="noopener noreferrer"
                            >
                              View attachment
                            </a>
                          )}
                        </div>
                        <time className={timeClass} title={fullTimeString}>
                          {timeString}
                          <span className="sr-only">{fullTimeString}</span>
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
          className="fixed bottom-20 right-4 z-50 md:hidden rounded-full bg-indigo-600 p-2 text-white shadow"
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
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="w-full border rounded-full px-4 py-2 outline-none"
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
                  <div className="bg-blue-600 h-1 rounded" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs">{uploadProgress}%</span>
              </div>
            )}
            <Button
              type="submit"
              aria-label="Send message"
              disabled={uploading}
              className="rounded-full bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
            >
              {uploading ? 'Uploading…' : 'Send'}
            </Button>
          </form>
          {user.user_type === 'artist' && (
            <div>
              {showQuoteForm ? (
                <form onSubmit={handleSendQuote} className="mt-2 space-y-2">
                  <textarea
                    className="w-full border rounded-md p-1"
                    placeholder="Quote details"
                    value={quoteDetails}
                    onChange={(e) => setQuoteDetails(e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-full border rounded-md p-1"
                    placeholder="Price"
                    value={quotePrice}
                    onChange={(e) => setQuotePrice(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" className="px-3 py-1 bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white">
                      Send Quote
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowQuoteForm(false)}
                      className="px-3 py-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  onClick={() => setShowQuoteForm(true)}
                  className="mt-2 text-sm text-indigo-600 underline"
                >
                  Send Quote
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {errorMsg && (
        <p className="text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}
        </div>
      </div>
  );
});

export default React.memo(MessageThread);
