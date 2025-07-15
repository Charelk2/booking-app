'use client';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import type { Notification } from '@/types';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => Promise<void>;
  onDelete: (id: number) => void;
}

export default function NotificationItem({ notification, onMarkRead, onDelete }: Props) {
  const [localRead, setLocalRead] = useState(notification.is_read);

  useEffect(() => {
    setLocalRead(notification.is_read);
  }, [notification.is_read]);

  const handleClick = async () => {
    if (localRead) return;
    setLocalRead(true);
    try {
      await onMarkRead(notification.id);
    } catch {
      setLocalRead(false);
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
        'flex items-start justify-between p-3 rounded-xl transition-colors cursor-pointer',
        localRead ? 'bg-white border border-transparent' : 'bg-indigo-50 border-l-4 border-indigo-600',
      )}
    >
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h3 className={clsx('font-medium', localRead ? 'text-gray-500' : 'text-gray-800')}>
            {notification.title}
          </h3>
          <span className="text-sm text-gray-400">
            {formatDistanceToNow(new Date(notification.timestamp))} ago
          </span>
        </div>
        <p className={clsx('mt-1 text-sm', localRead ? 'text-gray-500' : 'text-gray-600')}>
          {notification.body}
        </p>
      </div>
      <div className="ml-4 flex flex-col space-y-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDelete(notification.id)}
          className="text-gray-500 hover:text-gray-700 text-sm"
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
