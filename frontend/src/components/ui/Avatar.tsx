'use client';
import Image from 'next/image';
import clsx from 'clsx';
import { getFullImageUrl } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  initials?: string;
  icon?: React.ReactNode;
  alt?: string;
  className?: string;
  size?: number; // width/height in pixels
}

export default function Avatar({
  src,
  initials,
  icon,
  alt = 'avatar',
  className,
  size = 40,
}: AvatarProps) {
  const dimension = `${size}px`;
  return (
    <div
      className={clsx(
        'flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-gray-700 font-medium overflow-hidden',
        className,
      )}
      style={{ width: dimension, height: dimension }}
    >
      {src ? (
        <Image
          src={getFullImageUrl(src) as string}
          alt={alt}
          width={size}
          height={size}
          className="object-cover rounded-full"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
          }}
        />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        icon
      )}
    </div>
  );
}
