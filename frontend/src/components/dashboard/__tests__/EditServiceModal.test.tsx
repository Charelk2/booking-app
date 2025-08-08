import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import EditServiceModal from '../EditServiceModal';
import * as api from '@/lib/api';
import { flushPromises } from '@/test/utils/flush';
import { Service, ArtistProfile, User } from '@/types';

describe('EditServiceModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const artistUser: User = {
    id: 1,
    email: 'a@band.com',
    user_type: 'service_provider',
    first_name: 'Artist',
    last_name: 'User',
    phone_number: '',
    is_active: true,
    is_verified: true,
    profile_picture_url: null,
  };

  const artistProfile: ArtistProfile = {
    id: 1,
    user_id: 1,
    business_name: 'Biz',
    profile_picture_url: null,
    user: artistUser,
    created_at: '',
    updated_at: '',
  };

  const service: Service = {
    id: 1,
    artist_id: 1,
    title: 'Old Title',
    description: 'Desc',
    media_url: 'img.jpg',
    price: 100,
    duration_minutes: 60,
    service_type: 'Live Performance',
    travel_rate: 3,
    travel_members: 2,
    car_rental_price: 1000,
    flight_price: 2780,
    display_order: 0,
    artist: artistProfile,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(api, 'updateService').mockResolvedValue({ data: service });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('submits updated fields', async () => {
    await act(async () => {
      root.render(
        React.createElement(EditServiceModal, {
          isOpen: true,
          service,
          onClose: jest.fn(),
          onServiceUpdated: jest.fn(),
        }),
      );
    });

    const saveBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(api.updateService).toHaveBeenCalledWith(1, expect.any(Object));
  });
});
