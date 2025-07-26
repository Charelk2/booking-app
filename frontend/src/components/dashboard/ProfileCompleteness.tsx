'use client';
import React, { useMemo } from 'react';
import type { ArtistProfile } from '@/types';

// Fields considered for Phase 1 profile completeness calculation
const completenessFields: (keyof ArtistProfile)[] = [
  'business_name',
  'description',
  'location',
  'profile_picture_url',
  'cover_photo_url',
];

export function computeProfileCompleteness(profile?: Partial<ArtistProfile>): number {
  if (!profile) return 0;
  const filled = completenessFields.reduce(
    (acc, key) => acc + (profile[key] ? 1 : 0),
    0,
  );
  return Math.round((filled / completenessFields.length) * 100);
}

interface ProfileCompletenessProps {
  profile: Partial<ArtistProfile> | null;
}

export default function ProfileCompleteness({ profile }: ProfileCompletenessProps) {
  const percentage = useMemo(
    () => computeProfileCompleteness(profile || undefined),
    [profile],
  );

  return (
    <div className="w-full" data-testid="profile-completeness-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" data-testid="profile-completeness">
        <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
