import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import AddServiceModal from '../AddServiceModal';
import * as api from '@/lib/api';
import { flushPromises } from '@/test/utils/flush';

describe('AddServiceModal wizard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(api, 'createService').mockResolvedValue({ data: { id: 1 } });
    jest.spyOn(api, 'getDashboardStats').mockResolvedValue({
      data: { monthly_new_inquiries: 1, profile_views: 0, response_rate: 0 },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('completes the flow and publishes the service', async () => {
    await act(async () => {
      root.render(
        React.createElement(AddServiceModal, {
          isOpen: true,
          onClose: jest.fn(),
          onServiceAdded: jest.fn(),
        }),
      );
    });

    const typeButton = container.querySelector('button[data-value="Live Performance"]') as HTMLButtonElement;
    act(() => {
      typeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const next1 = container.querySelector('button[data-testid="next"]') as HTMLButtonElement;
    act(() => {
      next1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const titleInput = container.querySelector('input[name="title"]') as HTMLInputElement;
    const descInput = container.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    const durationInput = container.querySelector('input[type="number"]') as HTMLInputElement;

    act(() => {
      titleInput.value = 'My Service';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      descInput.value = 'A great service description that is long enough.';
      descInput.dispatchEvent(new Event('input', { bubbles: true }));
      durationInput.value = '30';
      durationInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const next2 = container.querySelector('button[data-testid="next"]') as HTMLButtonElement;
    act(() => {
      next2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file] });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const next3 = container.querySelector('button[data-testid="next"]') as HTMLButtonElement;
    act(() => {
      next3.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const nameInput = container.querySelector('input[name="packages[0].name"]') as HTMLInputElement;
    const priceInput = container.querySelector('input[name="packages[0].price"]') as HTMLInputElement;
    act(() => {
      nameInput.value = 'Basic';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.value = '100';
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const next4 = container.querySelector('button[data-testid="next"]') as HTMLButtonElement;
    act(() => {
      next4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const publish = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      publish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(api.createService).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My Service',
        description: 'A great service description that is long enough.',
        service_type: 'Live Performance',
        duration_minutes: 30,
        price: 100,
      }),
    );
  });
});
