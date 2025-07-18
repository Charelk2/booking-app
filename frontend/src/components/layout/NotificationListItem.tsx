// NotificationListItem.tsx
'use client';

import { format } from 'date-fns';
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
  unreadCount: number;
  status?: 'confirmed' | 'reminder' | 'due';
}

function toInitials(name?: string): string | undefined {
  return name
    ? name
        .split(' ')
        .map(w => w[0])
        .join('')
    : undefined;
}

export function parseItem(n: UnifiedNotification): ParsedNotification {
  const content = typeof n.content === 'string' ? n.content : '';
  const base: Omit<ParsedNotification, 'title' | 'subtitle' | 'icon'> = {
    avatarUrl: n.avatar_url || undefined,
    initials: toInitials(n.sender_name || n.name),
    unreadCount: Number(n.unread_count) || 0,
  };

  if (n.type === 'message') {
    const cleaned = content.replace(
      /^new message(?: from [^:]+)?:\s*/i,
      ''
    ).trim();
    const snippet = cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned;
    const title = n.name || n.sender_name || 'Message';
    return { ...base, title, subtitle: snippet, icon: '💬' };
  }

  if (n.type === 'new_booking_request') {
    const sender = n.sender_name || n.name || 'New booking request';
    const b = (n.booking_type || '').replace(/_/g, ' ');
    const bookingType = b.replace(/\b\w/g, c => c.toUpperCase());
    const icon = /video/i.test(b) ? '🎥' : /song/i.test(b) ? '🎵' : '📅';

    const loc = content.match(/Location:\s*(.+)/i)?.[1].split('\n')[0].trim();
    const dateStr = content.match(/Date:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const metadataParts: string[] = [];
    if (loc) metadataParts.push(`📍 ${loc}`);
    if (dateStr) metadataParts.push(`📅 ${format(new Date(dateStr), 'MMM d, yyyy')}`);

    return {
      ...base,
      title: sender,
      subtitle: bookingType,
      icon,
      bookingType,
      metadata: metadataParts.join(' — '),
      status: 'reminder',
    };
  }

  if (n.type === 'review_request') {
    const trimmed = content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return { ...base, title: 'Review Request', subtitle: trimmed, icon: '🔔', status: 'reminder' };
  }

  if (/deposit.*due/i.test(content)) {
    const m = content.match(
      /deposit\s+(?:of\s*)?R?([\d.,]+)\s*due(?:\s*by\s*(\d{4}-\d{2}-\d{2}))?/i
    );
    if (m) {
      const [, amt, by] = m;
      const parts = [`R${amt}`];
      if (by) parts.push(`due by ${format(new Date(by), 'MMM d, yyyy')}`);
      return { ...base, title: 'Deposit Due', subtitle: parts.join(' '), icon: '💰', status: 'due' };
    }
  }

  if (/new booking/i.test(content)) {
    const trimmed = content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return { ...base, title: 'Booking Confirmed', subtitle: trimmed, icon: '📅', status: 'confirmed' };
  }

  if (n.type === 'quote_accepted' || /quote accepted/i.test(content)) {
    const who =
      n.sender_name ||
      n.name ||
      content.match(/Quote accepted by (.+)/i)?.[1] ||
      '';
    const title = who ? `Quote accepted by ${who}` : 'Quote accepted';
    const trimmed = content.length > 30 ? `${content.slice(0, 30)}...` : content;
    return { ...base, title, subtitle: trimmed, icon: '✅', status: 'confirmed' };
  }

  const defaultTitle =
    content.length > 36 ? `${content.slice(0, 36)}...` : content;
  const typeTitle = n.type
    .split('_')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return { ...base, title: defaultTitle || typeTitle || 'Notification', subtitle: '', icon: '🔔' };
}

interface NotificationListItemProps {
  n: UnifiedNotification;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function NotificationListItem({
  n,
  onClick,
  style,
  className = '',
}: NotificationListItemProps) {
  const p = parseItem(n);

  return (
    <div
      role="button"
      tabIndex={0}
      style={style}
      onClick={onClick}
      onKeyDown={e =>
        (e.key === 'Enter' || e.key === ' ') && onClick()
      }
      className={clsx(
        'flex items-center p-3 mb-2 rounded-xl cursor-pointer transition-shadow transition-colors',
        n.is_read
          ? 'bg-white shadow hover:shadow-lg'
          : 'bg-brand-light border-l-4 border-brand shadow-md hover:shadow-lg',
        'hover:bg-gray-50',
        className
      )}
    >
      <Avatar src={p.avatarUrl} initials={p.initials} icon={p.icon} size={44} />
      <div className="flex-1 mx-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-gray-900 line-clamp-2" title={p.title}>
              {p.title}
            </span>
            {p.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
                {p.unreadCount > 99 ? '99+' : p.unreadCount}
              </span>
            )}
          </div>
          <TimeAgo timestamp={n.timestamp} className="text-xs text-gray-500" />
        </div>
        <p className="mt-1 text-sm text-gray-700 line-clamp-2">{p.subtitle}</p>
        {p.metadata && <p className="text-sm text-gray-500 truncate">{p.metadata}</p>}
      </div>
    </div>
  );
}
