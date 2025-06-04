'use client';

import { useEffect, useState } from 'react';
import { Message, MessageCreate } from '@/types';
import { getMessagesForBookingRequest, postMessageToBookingRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface MessageThreadProps {
  bookingRequestId: number;
}

export default function MessageThread({ bookingRequestId }: MessageThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const fetchMessages = async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [bookingRequestId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      const payload: MessageCreate = { content: newMessage.trim() };
      await postMessageToBookingRequest(bookingRequestId, payload);
      setNewMessage('');
      fetchMessages();
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  return (
    <div className="border rounded-md p-4 bg-white">
      <div className="h-64 overflow-y-auto mb-4 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <span className="text-sm text-gray-500">
              {msg.sender_type === 'artist' ? 'Artist' : 'Client'} • {new Date(msg.timestamp).toLocaleString()}
            </span>
            <span className="bg-gray-100 p-2 rounded-md">{msg.content}</span>
          </div>
        ))}
      </div>
      {user && (
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-grow border rounded-md px-2 py-1"
            placeholder="Type a message"
          />
          <button type="submit" className="px-4 py-1 bg-indigo-600 text-white rounded-md">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
