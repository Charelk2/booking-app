'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ArtistProfile } from '@/types';
import CollapsibleSection from '../ui/CollapsibleSection';

const fields: (keyof ArtistProfile)[] = [
  'business_name',
  'description',
  'location',
  'profile_picture_url',
  'cover_photo_url',
];

const fieldLabels: Record<keyof ArtistProfile, string> = {
  business_name: 'Business name',
  description: 'Description',
  location: 'Location',
  profile_picture_url: 'Profile picture',
  cover_photo_url: 'Cover photo',
  user_id: 'User',
  created_at: 'Created at',
  updated_at: 'Updated at',
};

export function computeProfileCompletion(profile?: Partial<ArtistProfile>): number {
  if (!profile) return 0;
  const filled = fields.reduce((acc, key) => acc + (profile[key] ? 1 : 0), 0);
  return Math.round((filled / fields.length) * 100);
}

export function getMissingProfileFields(profile?: Partial<ArtistProfile>): (keyof ArtistProfile)[] {
  if (!profile) return fields;
  return fields.filter((key) => !profile[key]);
}

interface ProfileProgressProps {
  profile: Partial<ArtistProfile> | null;
}

export default function ProfileProgress({ profile }: ProfileProgressProps) {
  const [open, setOpen] = useState(false);
  const percentage = useMemo(() => computeProfileCompletion(profile || undefined), [profile]);
  const missing = useMemo(() => getMissingProfileFields(profile || undefined), [profile]);

  return (
    <div className="w-full" data-testid="profile-progress-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" data-testid="profile-progress">
        <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${percentage}%` }} />
      </div>
      {percentage < 100 && missing.length > 0 && (
        <CollapsibleSection
          className="mt-2 border border-gray-200"
          title="Finish setting up your profile"
          open={open}
          onToggle={() => setOpen(!open)}
          testId="profile-progress-details"
        >
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {missing.map((field) => (
              <li key={field}>
                <Link href="/dashboard/profile/edit" className="text-brand-dark hover:underline">
                  {fieldLabels[field]}
                </Link>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
