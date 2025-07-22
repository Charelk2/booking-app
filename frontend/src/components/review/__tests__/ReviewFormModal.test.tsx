import { flushPromises } from "@/test/utils/flush";
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

  it('renders labels and input classes correctly', () => {
    const div = document.createElement('div');
    const root = createRoot(div);

    act(() => {
      root.render(
        <ReviewFormModal isOpen bookingId={1} onClose={() => {}} onSubmitted={() => {}} />,
      );
    });

    const ratingLabel = div.querySelector('label[for="rating"]');
    const ratingInput = div.querySelector('input#rating') as HTMLInputElement;
    const commentLabel = div.querySelector('label[for="comment"]');
    const textarea = div.querySelector('textarea');

    expect(ratingLabel?.textContent).toBe('Rating');
    expect(ratingInput.className).toContain('rounded-md');
    expect(commentLabel?.textContent).toBe('Comment');
    expect(textarea?.className).toContain('rounded-md');

    act(() => {
      root.unmount();
    });
    div.remove();
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

    const ratingInput = div.querySelector('input#rating') as HTMLInputElement;
    const textarea = div.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      ratingInput.value = '5';
      ratingInput.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.value = 'Great';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = div.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

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
