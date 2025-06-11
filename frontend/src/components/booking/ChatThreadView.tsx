'use client';

import React from 'react';

interface ChatThreadViewProps {
  contactName: string;
  /** Optional avatar or initials shown in the header */
  avatar?: React.ReactNode;
  /** Rendered message list */
  children: React.ReactNode;
  /** Message input bar element */
  inputBar: React.ReactNode;
}

export default function ChatThreadView({
  contactName,
  avatar,
  children,
  inputBar,
}: ChatThreadViewProps) {
  return (
    <div className="h-screen flex justify-center px-4 sm:px-6 py-6">
      <div className="max-w-2xl w-full mx-auto bg-white shadow-lg rounded-2xl overflow-hidden border flex flex-col">
        <header
          className="sticky top-0 z-10 bg-[#2F2B5C] text-white px-4 py-3 flex items-center justify-between rounded-t-2xl"
        >
          <h2 className="font-medium" data-testid="contact-name">
            Chat with {contactName}
          </h2>
          <div className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center text-sm font-medium">
            {avatar}
          </div>
        </header>
        <div
          className="flex-1 overflow-y-auto flex flex-col-reverse gap-2 p-4 max-w-[90vw] mx-auto"
          data-testid="message-container"
        >
          {children}
        </div>
        <div
          className="sticky bottom-0 bg-white px-4 py-3 border-t"
          data-testid="input-bar"
        >
          {inputBar}
        </div>
      </div>
    </div>
  );
}
