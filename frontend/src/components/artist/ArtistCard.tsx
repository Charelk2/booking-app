'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import { useLayoutEffect, useRef, useState, useMemo } from 'react';
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
  /** availability flag reserved for future indicator */
  isAvailable?: boolean;
  href: string;
}

// ratingCount and isAvailable are currently unused but may be utilized in the future.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  href,
  isAvailable,
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
  // Limit displayed tags so badges fit a single row. Up to four are shown when
  // space allows. If the container overflows, the list is reduced to two so the
  // row remains intact instead of disappearing entirely.
  const maxTagsFirstRow = 4;
  const maxTagsOverflow = 2;
  const [visibleCount, setVisibleCount] = useState(
    Math.min(tags.length, maxTagsFirstRow),
  );

  const tagRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = tagRef.current;
    if (!el) return;
    const update = () => {
      const fits = el.scrollWidth <= el.clientWidth;
      const next = fits
        ? Math.min(tags.length, maxTagsFirstRow)
        : Math.min(tags.length, maxTagsOverflow);
      setVisibleCount(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [tags]);

  const limitedTags = tags.slice(0, visibleCount);

  return (
    <div
      className={clsx(
        'rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition hover:shadow-md p-0 pb-4',
        className,
      )}
      {...props}
    >
      <div className="relative h-48 w-full overflow-hidden rounded-t-xl">
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
      <div className="flex flex-col flex-1 px-4">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-gray-900 truncate mt-3">{name}</h2>
          {verified && <CheckBadgeIcon className="h-4 w-4 text-brand" aria-label="Verified" />}
        </div>
        {subtitle && <p className="text-sm text-gray-500 leading-tight mt-0.5 line-clamp-2">{subtitle}</p>}
        {limitedTags.length > 0 && (
          <div
            ref={tagRef}
            className="flex flex-nowrap overflow-hidden gap-1 mt-2 whitespace-nowrap"
          >
            {limitedTags.map((s) => (
              <span
                key={`${id}-${s}`}
                className="text-xs px-2 py-1 bg-blue-50 text-gray-700 rounded-full"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <hr className="my-3 border-gray-200" />
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
        <div className="flex justify-between items-center mt-2">
          {location ? (
            <span className="text-sm text-gray-600 truncate">{location}</span>
          ) : (
            <span />
          )}
          <Link href={href} className="shrink-0">
            <button
              type="button"
              className="bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-md hover:bg-indigo-600"
            >
              View Profile
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
