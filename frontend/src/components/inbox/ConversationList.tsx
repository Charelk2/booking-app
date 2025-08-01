'use client';

import clsx from 'clsx';
import Image from 'next/image';
import { formatRelative } from 'date-fns';
import { BookingRequest, User } from '@/types';
import { getFullImageUrl } from '@/lib/utils'; // Import getFullImageUrl

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
  return (
    <div className="divide-y-2 divide-gray-100">
      {bookingRequests.map((req) => {
        const isActive = selectedRequestId === req.id;
        const otherName = (() => {
          if (currentUser.user_type === 'artist') {
            return req.client?.first_name || 'Client';
          }
          const artist = req.artist;
          if (!artist) return 'Artist';
          if ('business_name' in artist && artist.business_name) {
            return artist.business_name;
          }
          if ('user' in artist && artist.user?.first_name) {
            return artist.user.first_name;
          }
          if ('first_name' in artist) {
            return (artist as User).first_name;
          }
          return 'Artist';
        })();
        // Use getFullImageUrl for avatarUrl to ensure correct paths and handling
        const fullAvatarUrl =
          (currentUser.user_type === 'artist'
            ? req.client?.profile_picture_url
            : req.artist?.profile_picture_url) || '/static/default-avatar.svg'; // Fallback to a default SVG if no URL

        const date =
          req.last_message_timestamp || req.updated_at || req.created_at;

        return (
          <div
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
              'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ease-in-out',
              isActive
                ? 'bg-gray-100' // Active state: light gray background
                : 'hover:bg-gray-50' // Hover state: slightly lighter gray
            )}
          >
            {/* Avatar Handling */}
            {fullAvatarUrl ? (
              <Image
                src={getFullImageUrl(fullAvatarUrl) as string} // Ensure getFullImageUrl is applied
                alt={`${otherName} avatar`} // More descriptive alt text
                width={40}
                height={40}
                loading="lazy" // Lazy load images
                className="rounded-full object-cover flex-shrink-0 border border-gray-200" // Added a subtle border
                onError={(e) => {
                  // Fallback to a generic avatar if the specific image fails to load
                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              // Fallback for no avatar URL (should ideally be covered by fullAvatarUrl logic)
              <div className="h-10 w-10 rounded-full bg-indigo-500 text-white flex-shrink-0 flex items-center justify-center font-medium text-lg">
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
                  req.is_unread_by_current_user ? 'font-semibold text-gray-800' : 'text-gray-600' // Stronger font for unread message content
                )}
              >
                {req.last_message_content ??
                  req.service?.title ??
                  req.message ??
                  'New Request'}
              </div>
            </div>
            {/* Unread Indicator */}
            {req.is_unread_by_current_user && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 ml-2" aria-label="Unread message" /> // Adjusted color slightly, added flex-shrink-0 and ml-2
            )}
          </div>
        );
      })}
    </div>
  );
}