'use client';

import Image from 'next/image';
import { format } from 'date-fns';
import TimeAgo from '../ui/TimeAgo';
import { getFullImageUrl } from '@/lib/utils';
import type { UnifiedNotification } from '@/types';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export interface ParsedNotification {
  title: string;
  subtitle: string;
  icon: string;
  avatarUrl?: string | null;
  initials?: string;
  bookingType?: string;
  metadata?: string;
  unreadCount?: number;
}

export function parseItem(n: UnifiedNotification): ParsedNotification {
  const content = typeof n.content === 'string' ? n.content : '';
  if (n.type === 'message') {
    const cleaned = content.replace(/^New message:\s*/i, '').trim();
    const snippet = cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned;
    const titleRaw = n.name || '';
    const title = titleRaw.length > 36 ? `${titleRaw.slice(0, 36)}...` : titleRaw;
    const unreadCount = Number(n.unread_count) || 0;
    return {
      title,
      subtitle: `Last message: "${snippet}"`,
      icon: '💬',
      avatarUrl: n.avatar_url || undefined,
      initials: n.name
        ? n.name
            .split(' ')
            .map((w) => w[0])
            .join('')
        : undefined,
      unreadCount,
    };
  }
  if (n.type === 'new_booking_request') {
    const sender = n.sender_name || '';
    const btype = n.booking_type || '';
    const iconMap: Record<string, string> = {
      video: '🎥',
      song: '🎵',
    };
    const iconKey = btype ? btype.toLowerCase() : '';
    const icon = iconKey.includes('video')
      ? iconMap.video
      : iconKey.includes('song')
        ? iconMap.song
        : '📅';
    let formattedType = btype || '';
    if (formattedType) {
      formattedType = formattedType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const subtitleBase = formattedType
      ? `sent a new booking request for ${formattedType}`
      : 'sent a new booking request';
    const subtitle =
      subtitleBase.length > 36 ? `${subtitleBase.slice(0, 36)}...` : subtitleBase;
    const locMatch = content.match(/Location:\s*(.+)/i);
    const dateMatch = content.match(/Date:\s*(.+)/i);
    let metadata: string | undefined;
    if (locMatch || dateMatch) {
      const loc = locMatch ? locMatch[1].split('\n')[0].trim() : '';
      const d = dateMatch ? dateMatch[1].split('\n')[0].trim() : '';
      const parts = [] as string[];
      if (loc) parts.push(`\u{1F4CD} ${loc}`); // 📍
      if (d) {
        const formattedDate = format(new Date(d), 'MMM d, yyyy');
        parts.push(`\u{1F4C5} ${formattedDate}`); // 📅
      }
      metadata = parts.join(' \u2014 '); // —
    }
    const titleRaw = sender || 'New booking request';
    const title = titleRaw.length > 36 ? `${titleRaw.slice(0, 36)}...` : titleRaw;
    return {
      title,
      subtitle,
      icon,
      bookingType: formattedType,
      metadata,
    };
  }
  if (n.type === 'review_request') {
    const title = 'Review Request';
    const subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return { title, subtitle, icon: '🔔' };
  }
  if (/deposit.*due/i.test(content)) {
    let subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    const match = content.match(/deposit\s+(?:of\s*)?R?([\d.,]+)\s*due(?:\s*by\s*(\d{4}-\d{2}-\d{2}))?/i);
    if (match) {
      const [, amt, dateStr] = match;
      const parts: string[] = [];
      if (amt) {
        parts.push(`R${amt}`);
      }
      if (dateStr) {
        const formatted = format(new Date(dateStr), 'MMM d, yyyy');
        parts.push(`due by ${formatted}`);
      }
      subtitle = parts.join(' ');
    }
    return {
      title: 'Deposit Due',
      subtitle,
      icon: '💰',
    };
  }
  if (/new booking/i.test(content)) {
    const subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return {
      title: 'Booking Confirmed',
      subtitle,
      icon: '📅',
    };
  }
  if (/quote accepted/i.test(content)) {
    const match = content.match(/Quote accepted by (.+)/i);
    const rawTitle = match ? `Quote accepted by ${match[1]}` : 'Quote accepted';
    const title = rawTitle.length > 36 ? `${rawTitle.slice(0, 36)}...` : rawTitle;
    const subtitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return {
      title,
      subtitle,
      icon: '✅',
    };
  }
  const defaultTitle = content.length > 36 ? `${content.slice(0, 36)}...` : content;
  const typeTitle = n.type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return {
    title: defaultTitle || typeTitle || 'Notification',
    subtitle: '',
    icon: '🔔',
  };
}

interface NotificationListItemProps {
  n: UnifiedNotification;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function NotificationListItem({ n, onClick, style, className = '' }: NotificationListItemProps) {
  const parsed = parseItem(n);
  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      className={classNames(
        'group flex w-full items-start px-3 sm:px-4 py-2.5 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light hover:bg-gray-50 transition cursor-pointer border-b border-gray-200',
        n.is_read
          ? 'bg-background border-l border-transparent text-gray-600'
          : 'bg-brand-light border-l-4 border-brand text-gray-900 font-medium',
        className,
      )}
    >
      {parsed.avatarUrl || parsed.initials ? (
        parsed.avatarUrl ? (
          <Image
            src={getFullImageUrl(parsed.avatarUrl) as string}
            alt="avatar"
            width={40}
            height={40}
            loading="lazy"
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg';
            }}
          />
        ) : (
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-brand-light flex items-center justify-center text-brand-dark font-medium">
            {parsed.initials}
          </div>
        )
      ) : (
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-brand-light flex items-center justify-center text-brand-dark font-medium">
          {parsed.icon}
        </div>
      )}
      <div className="flex-1 text-left">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 truncate overflow-hidden">
            <span
              className="text-base font-medium text-gray-900 whitespace-nowrap"
              title={parsed.title}
            >
              {parsed.title}
            </span>
            {parsed.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
                {parsed.unreadCount > 99 ? '99+' : parsed.unreadCount}
              </span>
            )}
          </div>
          <TimeAgo
            timestamp={n.timestamp}
            className="text-xs text-gray-400 text-right"
          />
        </div>
        <p className="text-sm text-gray-700 truncate whitespace-nowrap overflow-hidden">{parsed.subtitle}</p>
        {parsed.metadata && (
          <p className="text-sm text-gray-500 truncate whitespace-nowrap overflow-hidden">{parsed.metadata}</p>
        )}
      </div>
    </button>
  );
}

