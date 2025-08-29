'use client';
import SafeImage from '@/components/ui/SafeImage';
import clsx from 'clsx';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';

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
        <SafeImage
          src={src}
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          loading="lazy"
          className="object-cover rounded-full"
        />
      ) : initials ? (
        <span>{initials}</span>
      ) : icon ? (
        icon
      ) : (
        <SafeImage
          src={'/static/default-avatar.svg'}
          alt={alt}
          width={size}
          height={size}
          sizes={`${size}px`}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          loading="lazy"
          className="object-cover rounded-full"
        />
      )}
    </div>
  );
}
