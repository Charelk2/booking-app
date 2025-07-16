'use client';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Notification } from '@/types';
import parseNotification from '@/hooks/parseNotification';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => Promise<void>;
  onDelete: (id: number) => void;
}

export default function NotificationItem({ notification, onMarkRead, onDelete }: Props) {
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
        'flex items-center gap-3 p-2 border-b cursor-pointer transition-colors',
        localRead ? 'bg-white border-transparent' : 'bg-indigo-50 border-l-4 border-indigo-500',
      )}
    >
      <div className="h-8 w-8 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center">
        {parsed.icon}
      </div>
      <div className="flex-1">
        <h3
          className={clsx(
            'text-sm font-medium truncate',
            localRead ? 'text-gray-500' : 'text-gray-800',
          )}
          title={parsed.title}
        >
          {parsed.title}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-700 truncate" title={parsed.subtitle}>
            {parsed.subtitle}
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatDistanceToNow(new Date(notification.timestamp))} ago
          </span>
        </div>
      </div>
      <button
        onClick={() => onDelete(notification.id)}
        className="ml-2 text-xs text-gray-500 hover:text-gray-700"
        type="button"
      >
        Delete
      </button>
    </div>
  );
}
