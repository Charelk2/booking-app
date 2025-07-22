'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import {
  StarIcon,
} from '@heroicons/react/24/solid';
import clsx from 'clsx';

export interface ArtistCardCompactProps extends HTMLAttributes<HTMLDivElement> {
  id: number;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  price?: number;
  rating?: number;
  ratingCount?: number;
  location?: string | null;
  href: string;
}

export default function ArtistCardCompact({
  id,
  name,
  subtitle,
  imageUrl,
  price,
  rating,
  ratingCount,
  location,
  href,
  className,
  ...props
}: ArtistCardCompactProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Link
      href={href}
      className={clsx(
        'group block rounded-xl overflow-hidden bg-white hover:shadow-md transition',
        className,
      )}
      {...props}
    >
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        )}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width:768px) 50vw, 33vw"
            className="object-cover w-full h-full group-hover:scale-105 transition-transform"
            onLoad={() => setLoaded(true)}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg';
            }}
          />
        ) : (
          <Image
            src="/default-avatar.svg"
            alt={name}
            fill
            sizes="(max-width:768px) 50vw, 33vw"
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
          <span className="absolute bottom-1 left-1 text-[10px] bg-white/90 rounded-full px-1.5 py-px">
            from R{Math.round(price)}
          </span>
        )}
      </div>
      <div className="p-3 space-y-0.5">
        <p className="text-sm font-semibold truncate">{name}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        {location && (
          <p className="text-xs text-gray-400 truncate">{location}</p>
        )}
      </div>
    </Link>
  );
}
