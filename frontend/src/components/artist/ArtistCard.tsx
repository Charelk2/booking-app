'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import {
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import Card from '@/components/ui/Card';
import Tag from '@/components/ui/Tag';
import Button from '@/components/ui/Button';

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
    <Card
      className={clsx(
        'rounded-2xl shadow-md hover:shadow-lg transition-all overflow-hidden p-4 lg:p-6',
        className,
      )}
      {...props}
    >
      <div className="aspect-square bg-gray-200 flex items-center justify-center">
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
          <span className="text-gray-400 text-sm">No Image</span>
        )}
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900 mr-1">{name}</h2>
            {verified && (
              <CheckBadgeIcon className="h-4 w-4 text-brand" aria-label="Verified" />
            )}
          </div>
          {rating !== undefined && rating !== null && (
            <div className="flex items-center text-sm text-gray-600">
              <StarIcon className="h-4 w-4 mr-1 text-yellow-400" />
              {rating}
              {ratingCount !== undefined && ratingCount !== null && (
                <span className="ml-1">({ratingCount})</span>
              )}
            </div>
          )}
        </div>
        {subtitle && <p className="text-sm text-gray-600 line-clamp-2">{subtitle}</p>}
        {location && <p className="text-sm text-gray-600">{location}</p>}
        {price && priceVisible && (
          <p className="text-sm font-medium text-gray-900">Starting at {price}</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((s) => (
              <Tag key={`${id}-${s}`}>{s}</Tag>
            ))}
          </div>
        )}
        {isAvailable !== undefined && (
          <Tag
            className={clsx(
              isAvailable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
            )}
          >
            {isAvailable ? 'Available' : 'Unavailable'}
          </Tag>
        )}
        <Link href={href} className="block mt-3">
          <Button fullWidth>View Profile</Button>
        </Link>
      </div>
    </Card>
  );
}
