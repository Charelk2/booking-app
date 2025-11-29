'use client';
import SafeImage from '@/components/ui/SafeImage';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import {
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import { formatCityRegion } from '@/lib/shared/mappers/location';

export interface ServiceProviderCardProps extends HTMLMotionProps<'div'> {
  serviceProviderId: number;
  imageUrl?: string | null;
  name: string;
  subtitle?: string | null;
  location?: string | null;
  price?: string | number | null;
  /** service provider skill tags **/
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
export default function ServiceProviderCard({
  serviceProviderId,
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
}: ServiceProviderCardProps) {
  // Ensure unused props don't trigger lint errors until availability features land
  void ratingCount;
  void isAvailable;
  void subtitle;
  void specialties;
  void specialities;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);

  // Detect touch devices so the overlay can rely on tap rather than hover
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupportsHover(!window.matchMedia('(hover: none)').matches);
    }
  }, []);

  return (
    <motion.div
      whileHover={{ y: 'calc(-1 * var(--space-1))', boxShadow: 'var(--shadow-md)' }}
      className={clsx(
        'rounded-2xl bg-white shadow-lg overflow-hidden transition-shadow',
        className,
      )}
      {...props}
    >
      <Link href={href} className="block group relative">
        <div className="relative h-48 w-full overflow-hidden rounded-t-2xl bg-gray-100">
          {imageUrl ? (
            <SafeImage
              src={imageUrl}
              alt={name}
              width={512}
              height={512}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 512px"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
              className="object-cover w-full h-full"
              {...(priority ? {} : { loading: 'lazy' })}
              priority={priority}
              onLoad={() => setImgLoaded(true)}
            />
          ) : (
            <SafeImage
              src={'/default-avatar.svg'}
              alt={name}
              width={512}
              height={512}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 512px"
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
              className="object-cover w-full h-full"
              {...(priority ? {} : { loading: 'lazy' })}
              priority={priority}
              onLoad={() => setImgLoaded(true)}
            />
          )}
          <div
            className={clsx(
              'absolute inset-0 flex items-center justify-center bg-black/60',
              supportsHover
                ? 'opacity-0 group-hover:opacity-100 transition'
                : 'opacity-100 pointer-events-none',
            )}
            // On touch screens, show the CTA without relying on hover
          >
            <button
              type="button"
              className="pointer-events-auto text-sm bg-brand text-white px-4 py-1.5 rounded-md focus:outline-none focus-visible:ring"
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
            <span className="text-sm text-gray-600 truncate">
              {formatCityRegion(location)}
            </span>
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
