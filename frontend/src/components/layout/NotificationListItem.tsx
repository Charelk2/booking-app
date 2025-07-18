'use client';

import { format } from 'date-fns';
import {
  CheckCircleIcon,
  CalendarIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import TimeAgo from '../ui/TimeAgo';
import { Avatar } from '../ui';
import type { UnifiedNotification } from '@/types';

export interface ParsedNotification {
  title: string;
  subtitle: string;
  icon: string;
  avatarUrl?: string | null;
  initials?: string;
  bookingType?: string;
  metadata?: string;
  unreadCount?: number;
  status?: 'confirmed' | 'reminder' | 'due';
}

function toInitials(name?: string): string | undefined {
  return name
    ? name
        .split(' ')
        .map((w) => w[0])
        .join('')
    : undefined;
}

export function parseItem(n: UnifiedNotification): ParsedNotification {
  const content = typeof n.content === 'string' ? n.content : '';
  if (n.type === 'message') {
    const cleaned = content.replace(/^New message:\s*/i, '').trim();
    const snippet = cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned;
    const title = n.name || n.sender_name || 'Message';
    const unreadCount = Number(n.unread_count) || 0;
    return {
      title,
      subtitle: snippet,
      icon: '💬',
      avatarUrl: n.avatar_url || undefined,
      initials: toInitials(n.name || n.sender_name),
      unreadCount,
    };
  }
  if (n.type === 'new_booking_request') {
    const sender = n.sender_name || n.name || '';
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
    const subtitle = formattedType;
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
    const title = sender || 'New booking request';
    return {
      title,
      subtitle,
      icon,
      avatarUrl: n.avatar_url || undefined,
      initials: toInitials(sender),
      bookingType: formattedType,
      metadata,
      status: 'reminder',
    };
  }
  if (n.type === 'review_request') {
    const title = 'Review Request';
    const subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return { title, subtitle, icon: '🔔', status: 'reminder' };
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
      avatarUrl: n.avatar_url || undefined,
      initials: toInitials(n.sender_name || n.name),
      status: 'due',
    };
  }
  if (/new booking/i.test(content)) {
    const subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return {
      title: 'Booking Confirmed',
      subtitle,
      icon: '📅',
      avatarUrl: n.avatar_url || undefined,
      initials: toInitials(n.sender_name || n.name),
      status: 'confirmed',
    };
  }
  if (n.type === 'quote_accepted' || /quote accepted/i.test(content)) {
    const name =
      n.sender_name || n.name || content.match(/Quote accepted by (.+)/i)?.[1];
    const title = name ? `Quote accepted by ${name}` : 'Quote accepted';
    const subtitle =
      content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return {
      title,
      subtitle,
      icon: '✅',
      avatarUrl: n.avatar_url || undefined,
      initials: toInitials(name),
      status: 'confirmed',
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
    avatarUrl: n.avatar_url || undefined,
    initials: toInitials(n.sender_name || n.name),
    status: undefined,
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
    <div
      role="button"
      tabIndex={0}
      style={style}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className={clsx(
        'flex items-center p-3 mb-2 rounded-xl transition-shadow cursor-pointer',
        n.is_read
          ? 'bg-white shadow'
          : 'bg-brand-light border-l-4 border-brand shadow-md',
        className,
      )}
    >
      <Avatar src={parsed.avatarUrl} initials={parsed.initials} icon={parsed.icon} size={44} />
      <div className="flex-1 mx-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-gray-900 line-clamp-2" title={parsed.title}>{parsed.title}</span>
            {parsed.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
                {parsed.unreadCount > 99 ? '99+' : parsed.unreadCount}
              </span>
            )}
          </div>
          <TimeAgo timestamp={n.timestamp} className="text-xs text-gray-500" />
        </div>
        <p className="mt-1 text-sm text-gray-700 line-clamp-2">{parsed.subtitle}</p>
        {parsed.metadata && (
          <p className="text-sm text-gray-500 truncate">{parsed.metadata}</p>
        )}
      </div>
      {parsed.status === 'confirmed' && (
        <CheckCircleIcon className="h-5 w-5 text-green-600" />
      )}
      {parsed.status === 'reminder' && (
        <CalendarIcon className="h-5 w-5 text-indigo-600" />
      )}
      {parsed.status === 'due' && (
        <ExclamationCircleIcon className="h-5 w-5 text-amber-500" />
      )}
    </div>
  );
}

