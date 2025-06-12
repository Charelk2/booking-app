'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
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
  specialties?: string[] | null;
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
  verified = false,
  isAvailable,
  href,
  className,
  ...props
}: ArtistCardProps) {
  return (
    <Card className={clsx('overflow-hidden', className)} {...props}>
      <div className="aspect-w-16 aspect-h-9 bg-gray-200 flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} width={512} height={270} className="object-cover w-full h-48" />
        ) : (
          <span className="text-gray-400 text-sm">No Image</span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
          {verified && <Tag className="ml-2">Verified</Tag>}
        </div>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        {location && <p className="text-sm text-gray-600">{location}</p>}
        {price && <p className="text-sm font-medium text-gray-900">Starting at {price}</p>}
        {specialties && specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {specialties.map((s) => (
              <Tag key={`${id}-${s}`}>{s}</Tag>
            ))}
          </div>
        )}
        {isAvailable !== undefined && (
          <p className={clsx('text-sm', isAvailable ? 'text-green-600' : 'text-red-600')}>
            {isAvailable ? 'Available' : 'Unavailable'}
          </p>
        )}
        <Link href={href} className="block mt-2">
          <Button fullWidth>View Profile</Button>
        </Link>
      </div>
    </Card>
  );
}
