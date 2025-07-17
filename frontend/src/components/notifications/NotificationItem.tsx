'use client';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Notification } from '@/types';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import parseNotification from '@/hooks/parseNotification';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => Promise<void>;
}

export default function NotificationItem({ notification, onMarkRead }: Props) {
  const [localRead, setLocalRead] = useState(notification.is_read);
  const parsed = parseNotification(notification);
  const router = useRouter();

  useEffect(() => {
    setLocalRead(notification.is_read);
  }, [notification.is_read]);

  const handleClick = async () => {
    if (!localRead) {
      setLocalRead(true);
      try {
        await onMarkRead(notification.id);
      } catch {
        setLocalRead(false);
      }
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick();
      }}
      className={clsx(
        'group flex items-start gap-4 p-4 rounded-lg cursor-pointer transition',
        localRead
          ? 'bg-white/80 hover:shadow-md'
          : 'bg-indigo-50/70 border-l-4 border-indigo-500 shadow-sm',
      )}
    >
      <div className="h-11 w-11 rounded-full flex items-center justify-center ring-1 ring-white/50 bg-white/70">
        {parsed.icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-gray-800 truncate">{parsed.title}</h3>
          <span className="text-xs text-gray-500 ml-2">
            {formatDistanceToNow(new Date(notification.timestamp))} ago
          </span>
        </div>
        <p className="mt-1.5 text-sm text-gray-700 truncate">{parsed.subtitle}</p>
      </div>
      <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
    </div>
  );
}
