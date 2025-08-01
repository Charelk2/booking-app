import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import EditServiceModal from '../EditServiceModal';
import * as api from '@/lib/api';
import { flushPromises } from '@/test/utils/flush';
import { Service } from '@/types';

describe('EditServiceModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const service: Service = {
    id: 1,
    artist_id: 1,
    title: 'Old Title',
    description: 'Desc',
    price: 100,
    duration_minutes: 60,
    service_type: 'Live Performance',
    travel_rate: 3,
    travel_members: 2,
    display_order: 0,
    artist: {} as any,
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

    const titleInput = container.querySelector('#title') as HTMLInputElement;
    const travelRateInput = container.querySelector('#travel_rate') as HTMLInputElement;
    const membersInput = container.querySelector('#travel_members') as HTMLInputElement;

    act(() => {
      titleInput.value = 'New Title';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      travelRateInput.value = '4';
      travelRateInput.dispatchEvent(new Event('input', { bubbles: true }));
      membersInput.value = '3';
      membersInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(api.updateService).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: 'New Title',
        travel_rate: 4,
        travel_members: 3,
      }),
    );
  });
});
