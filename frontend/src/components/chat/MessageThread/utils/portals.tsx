// components/chat/MessageThread/utils/portals.tsx
import * as React from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  const el = document.body;
  return createPortal(children, el);
}

