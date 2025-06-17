'use client';

import { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { createReviewForBooking } from '@/lib/api';
import { Review } from '@/types';
import { Button } from '@/components/ui';

interface Props {
  isOpen: boolean;
  bookingId: number;
  onClose: () => void;
  onSubmitted: (review: Review) => void;
}

interface FormData {
  rating: number;
  comment: string;
}

export default function ReviewFormModal({
  isOpen,
  bookingId,
  onClose,
  onSubmitted,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ defaultValues: { rating: 5, comment: '' } });

  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    setServerError(null);
    try {
      const res = await createReviewForBooking(bookingId, data);
      onSubmitted(res.data);
      reset();
      onClose();
    } catch (err: unknown) {
      console.error('Review submission error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to submit review.';
      setServerError(msg);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-md shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Leave a Review</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="rating" className="block text-sm font-medium text-gray-700">Rating</label>
            <select
              id="rating"
              {...register('rating', { required: true, valueAsNumber: true })}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              {[1,2,3,4,5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {errors.rating && (
              <p className="text-xs text-red-600 mt-1">Rating is required</p>
            )}
          </div>
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700">Comment</label>
            <textarea
              id="comment"
              rows={3}
              {...register('comment')}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            />
          </div>
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
