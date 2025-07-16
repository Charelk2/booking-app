'use client';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Notification } from '@/types';
import { TrashIcon } from '@heroicons/react/24/outline';
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
        'flex items-center gap-3 p-3 rounded-lg transition-shadow cursor-pointer',
        localRead
          ? 'bg-white/80 shadow-sm'
          : 'bg-indigo-50/70 border-l-4 border-indigo-500 shadow-md hover:shadow-lg',
      )}
    >
      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-100">
        {parsed.icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold truncate">{parsed.title}</h3>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(notification.timestamp))} ago
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-700 truncate">{parsed.subtitle}</p>
      </div>
      <button
        onClick={() => onDelete(notification.id)}
        className="ml-2 text-gray-500 hover:text-gray-700"
        type="button"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
