'use client';

import clsx from 'clsx';
import {
  BellAlertIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import Avatar from './Avatar';
import TimeAgo from './TimeAgo';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

interface NotificationCardProps {
  /** Status type controls the icon colour*/
  type: 'confirmed' | 'reminder' | 'due' | string;
  /** Sender or the source name */
  from: string;
  /** the ISO timestamp */
  createdAt: string | number | Date;
  /** If true, then show brand-coloured strip */
  unread: boolean;
  onClick: () => void;
  avatarUrl?: string | null;
  /** Short optional subtitle */
  subtitle?: string;
  /** Additional meta text */
  metadata?: string;
}

const iconMap = {
  confirmed: (
    <CheckCircleIcon className="w-5 h-5 text-green-600" />
  ),
  reminder: (
    <CalendarDaysIcon className="w-5 h-5 text-indigo-600" />
  ),
  due: (
    <BellAlertIcon className="w-5 h-5 text-amber-500" />
  ),
} as const;

export default function NotificationCard({
  type,
  from,
  createdAt,
  unread,
  onClick,
  avatarUrl,
  subtitle,
  metadata,
}: NotificationCardProps) {
  const initials = getInitials(from);
  const icon =
    iconMap[type as keyof typeof iconMap] || (
      <BellAlertIcon className="w-5 h-5 text-gray-400" />
    );

  // Always display an image avatar; fall back to a generic placeholder when
  // the sender has not uploaded a profile picture. This ensures notifications
  // consistently show a profile photo rather than initials.
  const avatarSrc = avatarUrl || '/default-avatar.svg';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={clsx(
        'flex items-center p-3 mb-2 rounded-xl cursor-pointer transition-shadow hover:shadow-lg',
        unread
          ? 'bg-brand-light border-l-4 border-brand shadow-md'
          : 'bg-white shadow',
        'hover:bg-gray-50',
      )}
    >
      <Avatar src={avatarSrc} initials={initials} size={44} />
      <div className="flex-1 mx-3">
        <div className="flex items-start justify-between">
          <span className="font-semibold text-gray-900 line-clamp-2" title={from}>
            {from}
          </span>
          <TimeAgo timestamp={createdAt} className="text-xs text-gray-500" />
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-700 line-clamp-2">{subtitle}</p>
        )}
        {metadata && (
          <p className="text-sm text-gray-500 truncate">{metadata}</p>
        )}
      </div>
      {icon}
    </div>
  );
}
