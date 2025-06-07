'use client';

import React from 'react';

interface ChatThreadViewProps {
  contactName: string;
  /** Rendered message list */
  children: React.ReactNode;
  /** Message input bar element */
  inputBar: React.ReactNode;
}

export default function ChatThreadView({
  contactName,
  children,
  inputBar,
}: ChatThreadViewProps) {
  return (
    <div className="h-screen flex flex-col">
      <header className="sticky top-0 bg-white shadow z-10 p-4">
        <h2 className="text-lg font-medium" data-testid="contact-name">
          {contactName}
        </h2>
      </header>
      <div
        className="flex-1 overflow-y-auto flex flex-col-reverse pb-[80px]"
        data-testid="message-container"
      >
        {children}
      </div>
      <div
        className="fixed bottom-0 w-full bg-white p-3 border-t flex space-x-2 items-center"
        data-testid="input-bar"
      >
        {inputBar}
      </div>
    </div>
  );
}
