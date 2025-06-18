'use client';

import Link from 'next/link';
import { ClipboardIcon } from '@heroicons/react/24/outline';
import useNotifications from '@/hooks/useNotifications';

export default function BookingRequestIcon() {
  const { items } = useNotifications();
  const unreadIds = new Set<number>();
  items.forEach((n) => {
    if (n.type === 'message' && n.booking_request_id && (n.unread_count ?? 0) > 0) {
      unreadIds.add(n.booking_request_id);
    }
    if (n.type === 'new_booking_request' && !n.is_read) {
      const match = n.link?.match(/booking-requests\/(\d+)/);
      if (match) unreadIds.add(Number(match[1]));
    }
  });
  const unreadCount = unreadIds.size;
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="relative ml-3" aria-live="polite">
      <Link
        href="/booking-requests"
        className="flex text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="sr-only">View booking requests</span>
        <ClipboardIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
            {badge}
          </span>
        )}
      </Link>
    </div>
  );
}
