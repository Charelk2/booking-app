'use client';

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
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState('');
  const [quotePrice, setQuotePrice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    } catch (err) {
      console.error('Failed to fetch messages', err);
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
    } catch (err) {
      console.error('Failed to fetch quotes', err);
    }
  };

  useImperativeHandle(ref, () => ({
    refreshMessages: async () => {
      await fetchMessages();
      await fetchQuotes();
    },
  }));

  useEffect(() => {
    fetchMessages();
    fetchQuotes();
    const interval = setInterval(() => {
      fetchMessages();
      fetchQuotes();
    }, 5000);
    return () => clearInterval(interval);
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
    }
  };

  return (
    <div className="border rounded-md p-4 bg-white flex flex-col h-96 space-y-2">
      <div className="flex-1 overflow-y-auto space-y-3">
        {messages.map((msg) => {
          const isSystem = msg.message_type === 'system';
          // Bubble alignment still depends on the logged in user
          const isSelf = !isSystem && msg.sender_id === user?.id;

          const isClientMessage = msg.sender_type === 'client';
          const bubbleClass = isClientMessage
            ? 'bg-indigo-500 text-white'
            : isSystem
              ? 'bg-gray-200'
              : 'bg-gray-100';

          const avatar = isSystem
            ? artistName?.charAt(0)
            : msg.sender_type === 'artist'
            ? artistName?.charAt(0)
            : clientName?.charAt(0);

          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const timeClass = 'block mt-1 text-[10px] font-light text-gray-500 text-right';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} gap-1`}
            >
              <div className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                {!isSelf && (
                  <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                    {avatar}
                  </div>
                )}
                <div
                  className={`max-w-xs rounded-2xl px-3 py-2 whitespace-pre-wrap ${bubbleClass}`}
                >
                  {msg.message_type === 'quote' && msg.quote_id && quotes[msg.quote_id] ? (
                    <div className="text-gray-800">
                      <p className="font-medium">{quotes[msg.quote_id].quote_details}</p>
                      <p className="text-sm mt-1">
                        ${Number(quotes[msg.quote_id].price).toFixed(2)} {quotes[msg.quote_id].currency}
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
                  <span className={timeClass}>{timeString}</span>
                </div>
                {isSelf && (
                  <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                    {avatar}
                  </div>
                )}
              </div>
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
            className="sticky bottom-0 flex items-center gap-2 border rounded-md p-2 bg-white focus-within:ring-2 focus-within:ring-indigo-300"
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Type a message"
            />
            <input type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
            <button type="submit" className="px-4 py-1 bg-indigo-600 text-white rounded-md">
              Send
            </button>
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
                    <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded-md">
                      Send Quote
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuoteForm(false)}
                      className="px-3 py-1 rounded-md border"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQuoteForm(true)}
                  className="mt-2 text-sm text-indigo-600 underline"
                >
                  Send Quote
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default MessageThread;
