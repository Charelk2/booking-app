'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
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
  isSystemTyping?: boolean;
}

const MessageThread = forwardRef<MessageThreadHandle, MessageThreadProps>(
  function MessageThread(
    {
      bookingRequestId,
      onMessageSent,
      clientName = 'Client',
      artistName = 'Artist',
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

  const fetchMessages = async () => {
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
  };

  const fetchQuotes = async () => {
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
  };

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

    const token = localStorage.getItem('token');
    const socket = new WebSocket(
      `${wsBase}${API_V1}/ws/booking-requests/${bookingRequestId}?token=${token}`,
    );

    socket.onopen = () => {
      setLoading(false);
    };

    socket.onmessage = (event) => {
      const msg: Message = JSON.parse(event.data);
      setMessages((prev) => [...prev, msg]);
      if (msg.message_type === 'quote') {
        fetchQuotes();
      }
    };

    socket.onerror = () => {
      setErrorMsg('WebSocket connection error');
    };

    return () => {
      socket.close();
    };
  }, [bookingRequestId]);

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
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 20;
    setShowScrollButton(!atBottom);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;
    try {
      let attachment_url: string | undefined;
      if (file) {
        const res = await uploadMessageAttachment(bookingRequestId, file);
        attachment_url = res.data.url;
      }
      const payload: MessageCreate = { content: newMessage.trim(), attachment_url };
      await postMessageToBookingRequest(bookingRequestId, payload);
      setNewMessage('');
      setFile(null);
      setPreviewUrl(null);
      fetchMessages();
      if (onMessageSent) onMessageSent();
    } catch (err) {
      console.error('Failed to send message', err);
      setErrorMsg('Failed to send message');
    }
  };

  const handleSendQuote = async (e: React.FormEvent) => {
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
  };

  return (
    <div
      className="border rounded-md p-4 bg-white flex flex-col min-h-[70vh] space-y-2"
    >
      <div className="sticky top-0 z-10 bg-white border-b pb-2 mb-2">
        <span className="text-sm font-medium">
          {clientName} ↔ {artistName}
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-3"
      >
        {loading ? (
          <div className="flex justify-center py-4" aria-label="Loading messages">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600" />
          </div>
        ) : (
          messages.length === 0 && !isSystemTyping && (
            <p className="text-sm text-gray-500">No messages yet. Start the conversation below.</p>
          )
        )}
        {messages.map((msg) => {
          const isSystem = msg.message_type === 'system';
          // Bubble alignment still depends on the logged in user
          const isSelf = !isSystem && msg.sender_id === user?.id;

          const bubbleClass = isSelf
            ? 'bg-indigo-500 text-white'
            : isSystem
              ? 'bg-gray-200'
              : 'bg-gray-100';

          const avatar = isSystem
            ? artistName?.charAt(0)
            : msg.sender_type === 'artist'
              ? artistName?.charAt(0)
              : clientName?.charAt(0);

          const senderDisplayName = isSystem
            ? artistName
            : msg.sender_type === 'artist'
              ? artistName
              : clientName;

          const relativeTime = formatDistanceToNow(new Date(msg.timestamp), {
            addSuffix: true,
          });

          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const timeClass =
            'ml-2 text-[10px] font-light self-end ' +
            (isSelf ? 'text-white' : 'text-gray-500');

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} gap-1 ${msg.unread ? 'bg-purple-50' : ''}`}
            >
              <span className={`text-sm ${msg.unread ? 'font-semibold' : 'font-medium'}`}>{senderDisplayName}</span>
              <div className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                {!isSelf && (
                  <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                    {avatar}
                  </div>
                )}
                <div
                  className={`max-w-xs rounded-2xl px-3 py-2 whitespace-pre-wrap flex ${bubbleClass}`}
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
                  <span className={timeClass}>{timeString}</span>
                </div>
                {isSelf && (
                  <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                    {avatar}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1">{relativeTime}</span>
              {/* Timestamps now appear inside each bubble instead of beside it. */}
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
      {user && (
        <>
          {previewUrl && (
            <div className="flex items-center gap-2 mb-1">
              {file && file.type.startsWith('image/') ? (
                <img src={previewUrl} alt="preview" className="w-10 h-10 object-cover rounded" />
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
            className="sticky bottom-0 relative flex items-center border rounded-md bg-white focus-within:ring-2 focus-within:ring-indigo-300"
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow border-none rounded-md py-2 pl-10 pr-12 focus:outline-none focus:ring-0"
              placeholder="Type a message"
            />
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
            <label
              htmlFor="file-upload"
              className="absolute left-2 p-1 text-gray-600 rounded hover:bg-gray-100"
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
            <Button type="submit" className="absolute right-2 p-1">Send</Button>
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
  );
});

export default MessageThread;
