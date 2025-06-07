'use client';

import { useEffect, useRef, useState } from 'react';

export default function StickyInputDemo() {
  const [messages, setMessages] = useState<string[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setMessages((prev) => [...prev, text.trim()]);
    setText('');
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {messages.map((m, idx) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={idx}
            className="rounded-md bg-gray-100 p-2 text-sm"
          >
            {m}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 left-0 right-0 flex items-center gap-2 border-t bg-white p-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-grow rounded-full border px-3 py-2 text-sm"
          placeholder="Type a message"
        />
        <button
          type="submit"
          className="bg-purple-600 text-white rounded px-4 py-2 text-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}
