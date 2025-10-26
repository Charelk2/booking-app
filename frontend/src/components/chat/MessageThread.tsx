// frontend/src/components/chat/MessageThread.tsx
// Legacy path delegating to the new web orchestrator for compatibility.
// This keeps existing imports (including tests) working after refactor.
'use client';
import * as React from 'react';
import MessageThreadWeb from './MessageThread/index.web';

export default function MessageThread(props: any) {
  return <MessageThreadWeb {...props} />;
}

