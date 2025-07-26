'use client';
import React, { useMemo } from 'react';
import type { ArtistProfile } from '@/types';

const fields: (keyof ArtistProfile)[] = [
  'business_name',
  'description',
  'location',
  'profile_picture_url',
  'cover_photo_url',
];

export function computeProfileCompletion(profile?: Partial<ArtistProfile>): number {
  if (!profile) return 0;
  const filled = fields.reduce((acc, key) => acc + (profile[key] ? 1 : 0), 0);
  return Math.round((filled / fields.length) * 100);
}

interface ProfileProgressProps {
  profile: Partial<ArtistProfile> | null;
}

export default function ProfileProgress({ profile }: ProfileProgressProps) {
  const percentage = useMemo(() => computeProfileCompletion(profile || undefined), [profile]);
  return (
    <div className="w-full" data-testid="profile-progress-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" data-testid="profile-progress">
        <div
          className="h-2 rounded-full bg-[var(--color-accent)]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
