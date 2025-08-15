'use client';

import clsx from 'clsx';
import Image from 'next/image';
import { formatRelative } from 'date-fns';
import { BookingRequest, User } from '@/types';
import { getFullImageUrl } from '@/lib/utils'; // Import getFullImageUrl
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';

interface ConversationListProps {
  bookingRequests: BookingRequest[];
  selectedRequestId: number | null;
  onSelectRequest: (id: number) => void;
  currentUser?: User | null;
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
}: ConversationListProps) {
  if (!currentUser) {
    return null;
  }
  const ROW_HEIGHT = 72;
  return (
    <List
      height={Math.min(ROW_HEIGHT * bookingRequests.length, ROW_HEIGHT * 10)}
      itemCount={bookingRequests.length}
      itemSize={ROW_HEIGHT}
      width="100%"
      className="divide-y-2 divide-gray-100"
    >
      {({ index, style }: ListChildComponentProps) => {
        const req = bookingRequests[index];
        const isActive = selectedRequestId === req.id;
        const otherName = (() => {
          if (currentUser.user_type === 'service_provider') {
            return req.client?.first_name || 'Client';
          }
          const artistProfile = req.artist_profile;
          const artist = req.artist;
          if (!artistProfile && !artist) return 'Service Provider';
          return (
            artistProfile?.business_name ||
            artist?.business_name ||
            artist?.user?.first_name ||
            artist?.first_name ||
            'Service Provider'
          );
        })();

        const avatarUrl =
          currentUser.user_type === 'service_provider'
            ? req.client?.profile_picture_url
            : req.artist_profile?.profile_picture_url || req.artist?.profile_picture_url;

        const date =
          req.last_message_timestamp || req.updated_at || req.created_at;

        const previewMessage = (() => {
          if (
            req.last_message_content === 'Artist sent a quote' ||
            req.last_message_content === 'Service Provider sent a quote'
          ) {
            return currentUser.user_type === 'service_provider'
              ? 'You sent a quote'
              : `${otherName} sent a quote`;
          }
          return (
            req.last_message_content ??
            req.service?.title ??
            req.message ??
            'New Request'
          );
        })();

        return (
          <div
            style={style}
            key={req.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectRequest(req.id)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectRequest(req.id);
              }
            }}
            // Apply hover and active states clearly
            className={clsx(
              'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ease-in-out rounded-lg',
              isActive
                ? 'bg-gray-100 rounded-full' // Active state: light gray background
                : 'hover:bg-gray-50 rounded-full' // Hover state: slightly lighter gray
            )}
          >
            {/* Avatar Handling */}
            {avatarUrl ? (
              <Image
                src={getFullImageUrl(avatarUrl) as string}
                alt={`${otherName} avatar`}
                width={40}
                height={40}
                loading="lazy"
                className="rounded-full object-cover flex-shrink-0 border border-gray-200"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-black text-white flex-shrink-0 flex items-center justify-center font-medium text-lg">
                {otherName.charAt(0)}
              </div>
            )}
            
            <div className="flex-1 overflow-hidden">
              <div className={clsx(
                'flex items-center justify-between',
                req.is_unread_by_current_user ? 'font-semibold text-gray-900' : 'text-gray-700' // Stronger font for unread, clearer color
              )}>
                <span className="truncate">{otherName}</span>
                <time
                  dateTime={date}
                  className="text-xs text-gray-500 flex-shrink-0 ml-2" // Added ml-2 for spacing
                >
                  {formatRelative(new Date(date), new Date())}
                </time>
              </div>
              <div
                className={clsx(
                  'text-xs truncate',
                  req.is_unread_by_current_user
                    ? 'font-semibold text-gray-800'
                    : 'text-gray-600' // Stronger font for unread message content
                )}
              >
                {previewMessage}
              </div>
            </div>
            {/* Unread Indicator */}
            {req.is_unread_by_current_user && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 ml-2" aria-label="Unread message" /> // Adjusted color slightly, added flex-shrink-0 and ml-2
            )}
          </div>
        );
      }}
    </List>
  );
}