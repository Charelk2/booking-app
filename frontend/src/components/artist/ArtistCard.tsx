'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import { Tag } from '@/components/ui';
import { getFullImageUrl } from '@/lib/utils';

export interface ArtistCardProps extends HTMLAttributes<HTMLDivElement> {
  artistId: number;
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
  /** availability flag reserved for future indicator */
  isAvailable?: boolean;
  /** prioritize image loading when above the fold */
  priority?: boolean;
  href: string;
}

// ratingCount and isAvailable are currently unused but may be utilized in the future.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ArtistCard({
  artistId,
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
  href,
  isAvailable,
  priority,
  className,
  ...props
}: ArtistCardProps) {
  // Ensure unused props don't trigger lint errors until availability features land
  void ratingCount;
  void isAvailable;
  const tags = useMemo(
    () => specialties || specialities || [],
    [specialties, specialities],
  );
  // Display at most two tags so pills remain compact.
  const maxTags = 2;
  const limitedTags = tags.slice(0, maxTags);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
      className={clsx(
        'rounded-2xl bg-white shadow-lg overflow-hidden transition-shadow',
        className,
      )}
      {...props}
    >
      <Link href={href} className="block group relative">
        <div className="relative h-48 w-full overflow-hidden rounded-t-2xl bg-gray-100">
          {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              width={512}
              height={512}
              className="object-cover w-full h-full"
              {...(priority ? {} : { loading: 'lazy' })}
              priority={priority}
              onLoad={() => setImgLoaded(true)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
              }}
            />
          ) : (
            <Image
              src={getFullImageUrl('/static/default-avatar.svg') as string}
              alt={name}
              width={512}
              height={512}
              className="object-cover w-full h-full"
              {...(priority ? {} : { loading: 'lazy' })}
              priority={priority}
              onLoad={() => setImgLoaded(true)}
            />
          )}
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition"
          >
            <button
              type="button"
              className="text-sm bg-brand text-white px-4 py-1.5 rounded-md focus:outline-none focus-visible:ring"
            >
              Book Now
            </button>
          </div>
        </div>
      </Link>
      <div className="flex flex-col flex-1 p-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-gray-900 truncate mt-4 mb-2">{name}</h2>
          {verified && <CheckBadgeIcon className="h-4 w-4 text-brand" aria-label="Verified" />}
        </div>
        {subtitle && <p className="text-sm text-gray-500 leading-tight line-clamp-2">{subtitle}</p>}
        {limitedTags.length > 0 && (
          <div className="flex flex-nowrap overflow-hidden gap-1 mt-2 whitespace-nowrap">
            {limitedTags.map((s) => (
              <Tag key={`${artistId}-${s}`} className="text-[10px]">
                {s}
              </Tag>
            ))}
          </div>
        )}
        <hr className="mt-4 mb-4 border-gray-200" />
        <div className="flex justify-between items-center text-sm text-gray-700">
          <span className="flex items-center">
            <StarIcon className="h-4 w-4 mr-1 text-yellow-400" />
            {rating !== undefined && rating !== null ? (
              <>{rating}</>
            ) : (
              <span className="text-gray-400">No ratings yet</span>
            )}
          </span>
          {priceVisible && price && (
            <span className="font-semibold text-gray-900 text-sm">
              from R{Math.round(Number(price))}
            </span>
          )}
        </div>
        <div className="flex justify-between items-center mt-4">
          {location ? (
            <span className="text-sm text-gray-600 truncate">{location}</span>
          ) : (
            <span />
          )}
          <Link href={href} className="shrink-0">
            <button
              type="button"
              className="bg-brand text-white text-sm px-4 py-1.5 rounded-md hover:bg-brand-dark"
            >
              View Profile
            </button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
