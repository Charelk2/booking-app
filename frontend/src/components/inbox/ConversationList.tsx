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
  query?: string;
}

export default function ConversationList({
  bookingRequests,
  selectedRequestId,
  onSelectRequest,
  currentUser,
  query = '',
}: ConversationListProps) {
  if (!currentUser) {
    return null;
  }
  const ROW_HEIGHT = 74;

  const q = query.trim().toLowerCase();
  const highlight = (text: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{match}</span>
        {after}
      </>
    );
  };
  return (
    <List
      height={Math.min(ROW_HEIGHT * bookingRequests.length, ROW_HEIGHT * 10)}
      itemCount={bookingRequests.length}
      itemSize={ROW_HEIGHT}
      width="100%"
      className="divide-y divide-gray-100"
      outerElementType={(props: any) => <div role="listbox" aria-label="Conversations" {...props} />}
    >
      {({ index, style }: ListChildComponentProps) => {
        const req = bookingRequests[index];
        const isActive = selectedRequestId === req.id;
        const isUnread = (() => {
          const v = (req as any).is_unread_by_current_user;
          if (v === true || v === 1 || v === '1' || v === 'true') return true;
          return false;
        })();
        const rawOtherName = (() => {
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
        const otherName = String(rawOtherName || '');

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

        const isQuote = (() => {
          const text = (req.last_message_content || '').toString();
          if (!text) return false;
          return /\bquote\b/i.test(text);
        })();

        return (
          <div
            style={style}
            key={req.id}
            role="option"
            aria-selected={isActive}
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
                ? 'bg-gray-100 ring-1 ring-gray-200'
                : 'hover:bg-gray-50'
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
                className={clsx('rounded-full object-cover flex-shrink-0 border border-gray-200')}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              <div className={clsx('h-10 w-10 rounded-full bg-black text-white flex-shrink-0 flex items-center justify-center font-medium text-lg')}>
                {otherName.charAt(0)}
              </div>
            )}
            
            <div className="flex-1 overflow-hidden min-w-0">
              <div className={clsx(
                'flex items-center justify-between',
                isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'
              )}>
                <span className="truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{q ? highlight(otherName) : otherName}</span>
                </span>
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
                  isUnread
                    ? 'font-semibold text-gray-800'
                    : 'text-gray-600' // Stronger font for unread message content
                )}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  {isQuote && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0">
                      QUOTE
                    </span>
                  )}
                  <span className="truncate">
                    {q ? highlight(previewMessage) : previewMessage}
                  </span>
                </span>
              </div>
            </div>
            {/* Unread dot (subtle) */}
            {isUnread && (
              <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 ml-2" aria-label="Unread message" />
            )}
          </div>
        );
      }}
    </List>
  );
}
