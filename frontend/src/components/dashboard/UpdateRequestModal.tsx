'use client';

import { useState } from 'react';
import { BookingRequest } from '@/types';
import { updateBookingRequestArtist, postMessageToBookingRequest } from '@/lib/api';

interface UpdateRequestModalProps {
  isOpen: boolean;
  request: BookingRequest;
  onClose: () => void;
  onUpdated: (req: BookingRequest) => void;
}

export default function UpdateRequestModal({
  isOpen,
  request,
  onClose,
  onUpdated,
}: UpdateRequestModalProps) {
  const [status, setStatus] = useState(request.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await updateBookingRequestArtist(request.id, { status });
      if (note.trim()) {
        await postMessageToBookingRequest(request.id, { content: note.trim() });
      }
      onUpdated(res.data);
      onClose();
    } catch (err) {
      console.error('Failed to update request', err);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center transition-opacity">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white transform transition-transform duration-200">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Update Request</h3>
          <form onSubmit={handleSubmit} className="mt-2 px-7 py-3 space-y-4 text-left">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="pending_quote">Pending Quote</option>
                <option value="quote_provided">Quote Provided</option>
                <option value="request_declined">Declined</option>
              </select>
            </div>
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700">Note to client</label>
              <textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="items-center px-4 py-3 space-x-2 text-right">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-base font-medium rounded-md shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-brand text-white text-base font-medium rounded-md shadow-sm hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
