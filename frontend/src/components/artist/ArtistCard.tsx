'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import {
  StarIcon,
  CheckBadgeIcon,
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
        'p-4 flex flex-col gap-2 rounded-2xl bg-white shadow-sm transition lg:hover:shadow-lg lg:hover:scale-[1.01]',
        className,
      )}
      {...props}
    >
      <div className="relative h-48 w-full overflow-hidden rounded-t-2xl">
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
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold truncate">{name}</h2>
          {verified && <CheckBadgeIcon className="h-4 w-4 text-brand" aria-label="Verified" />}
        </div>
        {subtitle && <p className="text-sm text-gray-600 line-clamp-2">{subtitle}</p>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((s) => (
              <span
                key={`${id}-${s}`}
                className="bg-indigo-100 text-indigo-600 px-2 py-1 text-xs rounded-full"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
          {location && <span className="text-gray-500">{location}</span>}
          {rating !== undefined && rating !== null && ratingCount !== undefined && ratingCount !== null && (
            <span className="flex items-center">
              <StarIcon className="h-4 w-4 mr-1 text-yellow-400" />
              {rating}
              <span className="ml-1">({ratingCount})</span>
            </span>
          )}
          {priceVisible ? (
            price ? (
              <span className="font-medium text-gray-900">Starting at R{price}</span>
            ) : null
          ) : (
            <span className="text-gray-500">Price available after request</span>
          )}
          {isAvailable !== undefined && (
            <span
              className={clsx(
                'px-2 py-1 text-xs rounded-full',
                isAvailable ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500',
              )}
            >
              {isAvailable ? 'Available' : 'Currently unavailable'}
            </span>
          )}
        </div>
        <Link href={href} className="mt-2 self-end w-full sm:w-auto group">
          <button
            type="button"
            className="w-full sm:w-auto text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 text-sm font-medium"
          >
            <span className="group-hover:hidden">View Profile</span>
            <span className="hidden group-hover:inline">Book Now</span>
          </button>
        </Link>
      </div>
    </div>
  );
}
