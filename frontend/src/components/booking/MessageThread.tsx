'use client';

import { useEffect, useState } from 'react';
import { Message, MessageCreate, Quote } from '@/types';
import {
  getMessagesForBookingRequest,
  postMessageToBookingRequest,
  uploadMessageAttachment,
  getQuotesForBookingRequest,
  createQuoteForRequest,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface MessageThreadProps {
  bookingRequestId: number;
  /** Optional callback invoked after a message is successfully sent */
  onMessageSent?: () => void;
}

export default function MessageThread({ bookingRequestId, onMessageSent }: MessageThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [quotes, setQuotes] = useState<Record<number, Quote>>({});
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState('');
  const [quotePrice, setQuotePrice] = useState('');

  const fetchMessages = async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      setMessages(res.data);
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

  useEffect(() => {
    fetchMessages();
    fetchQuotes();
    const interval = setInterval(() => {
      fetchMessages();
      fetchQuotes();
    }, 5000);
    return () => clearInterval(interval);
  }, [bookingRequestId]);

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
    <div className="border rounded-md p-4 bg-white space-y-3">
      <div className="h-80 overflow-y-auto mb-2 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender_id === user?.id ? 'items-end text-right' : 'items-start'}`}
          >
            <span className="text-xs text-gray-500 mb-1">
              {msg.sender_type === 'artist' ? 'Artist' : 'Client'} •{' '}
              {new Date(msg.timestamp).toLocaleString()}
            </span>
            {msg.message_type === 'quote' && msg.quote_id && quotes[msg.quote_id] ? (
              <div className="bg-yellow-50 p-2 rounded-md border max-w-xs">
                <p className="font-medium">{quotes[msg.quote_id].quote_details}</p>
                <p className="text-sm text-gray-700 mt-1">
                  ${Number(quotes[msg.quote_id].price).toFixed(2)}{' '}
                  {quotes[msg.quote_id].currency}
                </p>
              </div>
            ) : (
              <span
                className={`px-3 py-2 rounded-lg whitespace-pre-wrap max-w-xs ${msg.sender_id === user?.id ? 'bg-indigo-100' : 'bg-gray-100'}`}
              >
                {msg.content}
              </span>
            )}
            {msg.attachment_url && (
              <a
                href={msg.attachment_url}
                target="_blank"
                className="text-blue-600 underline mt-1 text-sm"
                rel="noopener noreferrer"
              >
                View attachment
              </a>
            )}
          </div>
        ))}
      </div>
      {user && (
        <>
          <form onSubmit={handleSend} className="flex items-center gap-2 border rounded-md p-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow border rounded-md px-2 py-1"
              placeholder="Type a message"
            />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
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
                    <button type="button" onClick={() => setShowQuoteForm(false)} className="px-3 py-1 rounded-md border">
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
}
