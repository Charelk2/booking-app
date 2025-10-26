'use client';

import StickyInputDemo from '@/components/chat/StickyInputDemo';
import MainLayout from '@/components/layout/MainLayout';

export default function StickyInputPage() {
  // Hide demo route in production builds
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  return (
    <MainLayout>
      <StickyInputDemo />
    </MainLayout>
  );
}
