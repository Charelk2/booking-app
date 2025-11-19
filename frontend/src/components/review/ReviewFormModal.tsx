'use client';

import { useState } from 'react';
import { createReviewForBooking } from '@/lib/api';
import { Review } from '@/types';
import { Button } from '@/components/ui';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { XMarkIcon, UserIcon } from '@heroicons/react/24/outline';

interface Props {
  isOpen: boolean;
  bookingId: number;
  providerName?: string | null;
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
  providerName,
  onClose,
  onSubmitted,
}: Props) {
  const [form, setForm] = useState<FormData>({ rating: 5, comment: '' });
  const [submitting, setSubmitting] = useState(false);

  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId) return;
    if (!form.rating || form.rating < 1 || form.rating > 5) {
      setServerError('Rating is required');
      return;
    }
    setServerError(null);
    setSubmitting(true);
    try {
      const res = await createReviewForBooking(bookingId, form);
      onSubmitted(res.data);
      onClose();
    } catch (err: unknown) {
      console.error('Review submission error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to submit review.';
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-gray-600" />
            <p className="text-sm font-semibold text-gray-900">
              {providerName ? `Review ${providerName}` : 'Leave a review'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            aria-label="Close review form"
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Rating</p>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => {
                const v = i + 1;
                const active = v <= form.rating;
                return (
                  <button
                    key={v}
                    type="button"
                    className="p-0.5"
                    onClick={() => setForm((f) => ({ ...f, rating: v }))}
                  >
                    <StarSolidIcon
                      className={`h-4 w-4 ${
                        active ? 'text-yellow-400' : 'text-gray-200'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Comment (optional)
            </label>
            <textarea
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-0"
              rows={3}
              value={form.comment}
              onChange={(e) =>
                setForm((f) => ({ ...f, comment: e.target.value }))
              }
            />
          </div>
          {serverError && (
            <p className="text-xs text-red-600">{serverError}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
