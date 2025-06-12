'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import {
  StarIcon,
  CheckBadgeIcon,
  MapPinIcon,
} from '@heroicons/react/24/solid';

export interface ArtistCardProps extends HTMLAttributes<HTMLDivElement> {
  id: number;
  imageUrl?: string | null;
  name: string;
  subtitle?: string | null;
  location?: string | null;
  price?: string | number | null;
  /** artist skill tags */
  specialties?: string[] | null;
  /** alias for specialties */
  specialities?: string[] | null;
  /** average rating 1-5 */
  rating?: number | null;
  /** total number of reviews */
  ratingCount?: number | null;
  /** explicitly controls if price is shown */
  priceVisible?: boolean;
  verified?: boolean;
  isAvailable?: boolean;
  href: string;
}

export default function ArtistCard({
  id,
  imageUrl,
  name,
  subtitle,
  location,
  price,
  specialties,
  specialities,
  rating,
  ratingCount,
  priceVisible = true,
  verified = false,
  isAvailable,
  href,
  className,
  ...props
}: ArtistCardProps) {
  const tags = specialties || specialities || [];

  return (
    <div
      className={clsx(
        'p-4 flex flex-col gap-2 rounded-xl border border-gray-200 shadow-sm bg-white transition hover:shadow-md',
        className,
      )}
      {...props}
    >
      <div className="relative h-48 w-full overflow-hidden rounded-lg">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            width={512}
            height={512}
            className="object-cover w-full h-full"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/default-avatar.svg';
            }}
          />
        ) : (
          <Image
            src="/default-avatar.svg"
            alt={name}
            width={512}
            height={512}
            className="object-cover w-full h-full"
          />
        )}
      </div>
      <div className="flex flex-col gap-2 flex-1 mt-2">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-gray-900 truncate">{name}</h2>
          {verified && <CheckBadgeIcon className="h-4 w-4 text-brand" aria-label="Verified" />}
        </div>
        {subtitle && <p className="text-sm text-gray-500 leading-tight line-clamp-2">{subtitle}</p>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 text-xs">
            {tags.map((s) => (
              <span
                key={`${id}-${s}`}
                className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <hr className="border-t border-gray-200 my-2" />
        <div className="flex justify-between items-center text-sm text-gray-700">
          <span className="flex items-center">
            <StarIcon className="h-4 w-4 mr-1 text-yellow-400" />
            {rating !== undefined && rating !== null && ratingCount !== undefined && ratingCount !== null ? (
              <>
                {rating} <span className="ml-1">({ratingCount})</span>
              </>
            ) : (
              <span className="text-gray-400">No ratings yet</span>
            )}
          </span>
          {priceVisible && price && (
            <span className="font-semibold">{price}</span>
          )}
        </div>
        <div className="flex justify-between items-center mt-1">
          {location ? (
            <span className="text-gray-700 truncate">{location}</span>
          ) : (
            <span />
          )}
          <Link href={href} className="shrink-0">
            <button
              type="button"
              className="bg-indigo-500 text-white text-sm px-4 py-1 rounded-md hover:bg-indigo-600"
            >
              View Profile
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
