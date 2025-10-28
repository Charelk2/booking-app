"use client";

import dynamic from 'next/dynamic';
import type { BookingRequest } from '@/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

type Props = {
  selectedThreadId: number | null;
  threads: BookingRequest[];
  isMobile?: boolean;
  onBack?: () => void;
  setShowReviewModal: (v: boolean) => void;
};

export default function ThreadPane({ selectedThreadId, threads, isMobile = false, onBack, setShowReviewModal }: Props) {
  const MessageThreadWrapper = dynamic(() => import('@/components/chat/MessageThreadWrapper'), {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-gray-400">Loading messages…</div>
    ),
  });
  return (
    <div id="chat-thread" className="flex-1 relative min-h-0 min-w-0 overflow-hidden">
      {isMobile && onBack && (
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="absolute top-2 left-2 z-20 p-2 bg-white rounded-full shadow-md md:hidden"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
        </button>
      )}
      {selectedThreadId ? (
        <MessageThreadWrapper
          key={`active-${selectedThreadId}`}
          bookingRequestId={selectedThreadId}
          bookingRequest={threads.find((r) => r.id === selectedThreadId) || null}
          setShowReviewModal={setShowReviewModal}
          isActive={true}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
          <p>Select a conversation to view messages.</p>
        </div>
      )}
    </div>
  );
}
