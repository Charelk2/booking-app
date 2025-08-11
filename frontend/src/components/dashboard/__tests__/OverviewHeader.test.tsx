import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import OverviewHeader from '@/components/dashboard/artist/OverviewHeader';

describe('OverviewHeader component', () => {
  it('shows profile progress when completion below 100%', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const user = { first_name: 'A', user_type: 'service_provider' } as any;
    const profile = { business_name: 'x' } as any;
    act(() => {
      root.render(
        <OverviewHeader user={user} profile={profile} onAddService={() => {}} />,
      );
    });
    expect(
      container.querySelector('[data-testid="profile-progress-wrapper"]'),
    ).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('hides profile progress when completion is 100%', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const user = { first_name: 'A', user_type: 'service_provider' } as any;
    const profile = {
      business_name: 'x',
      description: 'd',
      location: 'l',
      profile_picture_url: 'p',
      cover_photo_url: 'c',
    } as any;
    act(() => {
      root.render(
        <OverviewHeader user={user} profile={profile} onAddService={() => {}} />,
      );
    });
    expect(
      container.querySelector('[data-testid="profile-progress-wrapper"]'),
    ).toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
