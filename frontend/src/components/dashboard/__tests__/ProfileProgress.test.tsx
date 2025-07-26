import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ProfileProgress, { computeProfileCompletion, getMissingProfileFields } from '../ProfileProgress';
import type { ArtistProfile } from '@/types';

describe('ProfileProgress component', () => {
  it('computes completion percentage correctly', () => {
    const profile: Partial<ArtistProfile> = { business_name: 'x', description: 'd' };
    expect(computeProfileCompletion(profile)).toBe(40);
  });

  it('computes missing fields correctly', () => {
    const profile: Partial<ArtistProfile> = { business_name: 'x' };
    const missing = getMissingProfileFields(profile);
    expect(missing).toContain('description');
    expect(missing).toContain('location');
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

    const inner = container.querySelector('[data-testid="profile-progress"] div') as HTMLDivElement;
    expect(inner.style.width).toBe('100%');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows missing field list when incomplete', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const profile: Partial<ArtistProfile> = { business_name: 'x' };
    act(() => {
      root.render(<ProfileProgress profile={profile} />);
    });

    const details = container.querySelector('[data-testid="profile-progress-details"]');
    expect(details).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
