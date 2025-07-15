'use client';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '@/hooks/useNotifications';

interface Props {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: Props) {
  return (
    <div
      className={clsx(
        'flex items-start justify-between p-3 rounded-xl transition-colors',
        notification.read ? 'bg-white border border-transparent' : 'bg-indigo-50 border-l-4 border-indigo-600',
      )}
    >
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">{notification.title}</h3>
          <span className="text-sm text-gray-400">
            {formatDistanceToNow(new Date(notification.timestamp))} ago
          </span>
        </div>
        <p className="mt-1 text-gray-600 text-sm">{notification.body}</p>
      </div>
      <div className="ml-4 flex flex-col space-y-2">
        {!notification.read && (
          <button
            onClick={() => onMarkRead(notification.id)}
            className="text-indigo-600 hover:text-indigo-800 text-sm"
            type="button"
          >
            Mark read
          </button>
        )}
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
