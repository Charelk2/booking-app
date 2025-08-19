'use client';
import Image from 'next/image';
import Link, { LinkProps } from 'next/link';
import type { AnchorHTMLAttributes } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  StarIcon,
} from '@heroicons/react/24/solid';
import clsx from 'clsx';
import { getFullImageUrl, getCityFromAddress } from '@/lib/utils';
import { BREAKPOINT_MD } from '@/lib/breakpoints';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';

export interface ServiceProviderCardCompactProps
  extends LinkProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> {
  serviceProviderId: number;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  price?: number;
  rating?: number;
  ratingCount?: number;
  location?: string | null;
  categories?: string[];
  href: string;
}

export default function ServiceProviderCardCompact({
  serviceProviderId,
  name,
  subtitle,
  imageUrl,
  price,
  rating,
  ratingCount,
  location,
  categories,
  href,
  className,
  ...props
}: ServiceProviderCardCompactProps) {
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  void subtitle;
  void categories;
  return (
    <Link
      href={href}
      className={clsx(
        'group block rounded-xl overflow-hidden',
        'no-underline hover:no-underline',
        className,
      )}
      onMouseEnter={() => router.prefetch?.(href.toString())}
      onFocus={() => router.prefetch?.(href.toString())}
      {...props}
    >
      <div className="relative aspect-[4/4] rounded-xl bg-gray-100 overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        )}
          {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes={`(max-width:${BREAKPOINT_MD}px) 50vw, 33vw`}
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            loading="lazy"
            quality={60}
            className="object-cover w-full h-full  transition-transform"
            onLoad={() => setLoaded(true)}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
            }}
          />
        ) : (
          <Image
            src={getFullImageUrl('/static/default-avatar.svg') as string}
            alt={name}
            fill
            sizes={`(max-width:${BREAKPOINT_MD}px) 0vw, 33vw`}
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            loading="lazy"
            quality={60}
            className="object-cover w-full h-full"
            onLoad={() => setLoaded(true)}
          />
        )}
        {rating !== undefined && (
          <span className="absolute top-1 left-1 text-[10px] bg-white/90 rounded-full px-1.5 py-px flex items-center gap-0.5">
            <StarIcon className="h-3 w-3 text-yellow-400" />
            {rating}
            {ratingCount ? (
              <span className="text-gray-500 ml-0.5">({ratingCount})</span>
            ) : null}
          </span>
        )}
        {price !== undefined && (
          <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-gray-700/60 text-white rounded-full px-1.5 py-px">
            from R{Math.round(price)}
          </span>
        )}
      </div>
      <div className="p-1 space-y-0.5">
        <p className="text-sm font-semibold truncate text-black">{name}</p>
        {location && (
          <p className="text-xs text-gray-400 truncate">
            {getCityFromAddress(location)}
          </p>
        )}
      </div>
    </Link>
  );
}
