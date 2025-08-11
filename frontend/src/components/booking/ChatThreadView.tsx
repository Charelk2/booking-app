import React, { ReactNode } from 'react';

interface ChatThreadViewProps {
  contactName: string;
  children: ReactNode;
  inputBar: ReactNode;
}

export default function ChatThreadView({ contactName, children, inputBar }: ChatThreadViewProps) {
  return (
    <div className="h-screen flex flex-col" data-testid="chat-thread-view">
      <header
        className="flex-shrink-0 p-4 border-b border-gray-200"
        data-testid="contact-name"
      >
        Chat with {contactName}
      </header>
      <div className="flex-1 overflow-y-auto" data-testid="message-container">
        {children}
      </div>
      <div className="flex-shrink-0" data-testid="input-bar">
        {inputBar}
      </div>
    </div>
  );
}
