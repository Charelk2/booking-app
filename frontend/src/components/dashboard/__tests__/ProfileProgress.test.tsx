import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { ProfileProgress, computeProfileCompletion } from '..';
import type { ArtistProfile } from '@/types';

describe('ProfileProgress component', () => {
  it('computes completion percentage correctly', () => {
    const profile: Partial<ArtistProfile> = { business_name: 'x', description: 'd' };
    expect(computeProfileCompletion(profile)).toBe(40);
  });

  it('renders progress bar with width', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const profile: Partial<ArtistProfile> = {
      business_name: 'x',
      description: 'd',
      location: 'loc',
      profile_picture_url: 'p',
      cover_photo_url: 'c',
    };
    act(() => {
      root.render(<ProfileProgress profile={profile} />);
    });

    const inner = container.querySelector(
      '[data-testid="profile-progress"] .progress-bar-fill'
    ) as HTMLDivElement;
    expect(inner.style.width).toBe('100%');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
