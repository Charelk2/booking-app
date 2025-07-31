'use client';

import clsx from 'clsx';
import Image from 'next/image';
import { format } from 'date-fns';
import { BookingRequest, User } from '@/types';
import Link from 'next/link';

interface ConversationListProps {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser: User;
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
}: ConversationListProps) {
  return (
    <div className="divide-y divide-gray-100">
      {bookingRequests.map((req) => {
        const isActive = selectedRequestId === req.id;
        const otherName =
          currentUser.user_type === 'artist'
            ? req.client?.first_name || 'Client'
            : req.artist?.first_name || 'Artist';
        const avatarUrl =
          currentUser.user_type === 'artist'
            ? req.client?.profile_picture_url
            : req.artist?.profile_picture_url;
        const date = req.updated_at || req.created_at;
        return (
          <div
            key={req.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectRequest(req.id)}
            onKeyPress={() => onSelectRequest(req.id)}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50',
              isActive && 'bg-gray-100'
            )}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="avatar"
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-medium">
                {otherName.charAt(0)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <div className={clsx('flex items-center justify-between', req.is_unread_by_current_user && 'font-semibold')}
              >
                <span className="truncate">{otherName}</span>
                <time
                  dateTime={date}
                  className="text-xs text-gray-500 flex-shrink-0"
                >
                  {format(new Date(date), 'MMM d, yyyy')}
                </time>
              </div>
              <div
                className={clsx(
                  'text-xs text-gray-600 truncate',
                  req.is_unread_by_current_user && 'font-semibold'
                )}
              >
                {req.last_message_content ??
                  req.service?.title ??
                  req.message ??
                  'New Request'}
              </div>
            </div>
            {req.is_unread_by_current_user && (
              <span className="w-2 h-2 bg-red-600 rounded-full" />
            )}
          </div>
        );
      })}
      {bookingRequests.length === 0 && (
        <p className="p-4 text-sm text-gray-500">No conversations yet.</p>
      )}
    </div>
  );
}
