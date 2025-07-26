import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ProfileProgress, { computeProfileCompletion } from '@/components/dashboard/ProfileProgress';
import type { ArtistProfile } from '@/types';

describe('ProfileProgress component', () => {
  it('computes completion percentage correctly', () => {
    const profile: Partial<ArtistProfile> = {
      business_name: 'Studio',
      description: 'desc',
      location: null,
      profile_picture_url: 'pic',
      cover_photo_url: null,
    };
    expect(computeProfileCompletion(profile)).toBe(60);
  });

  it('renders progress bar with width', () => {
    const profile: Partial<ArtistProfile> = {
      business_name: 'Studio',
      description: 'desc',
      location: 'City',
      profile_picture_url: 'pic',
      cover_photo_url: 'cover',
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ProfileProgress profile={profile} />);
    });

    const inner = container.querySelector('[data-testid="profile-progress"] div') as HTMLDivElement;
    expect(inner.style.width).toBe('100%');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
