import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import ReviewFormModal from '../ReviewFormModal';
import { createReviewForBooking } from '@/lib/api';

jest.mock('@/lib/api');

describe('ReviewFormModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits review and closes', async () => {
    (createReviewForBooking as jest.Mock).mockResolvedValue({
      data: { id: 1, booking_id: 1, rating: 5, comment: 'Great', created_at: '', updated_at: '' },
    });
    const onClose = jest.fn();
    const onSubmitted = jest.fn();
    const div = document.createElement('div');
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <ReviewFormModal isOpen bookingId={1} onClose={onClose} onSubmitted={onSubmitted} />,
      );
    });

    const select = div.querySelector('select') as HTMLSelectElement;
    const textarea = div.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      select.value = '5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.value = 'Great';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });

    expect(createReviewForBooking).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ rating: 5 }),
    );
    expect(onSubmitted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
