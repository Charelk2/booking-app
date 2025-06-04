'use client';
import { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format } from 'date-fns';
import { useBooking } from '@/contexts/BookingContext';
import { getArtistAvailability, createBookingRequest } from '@/lib/api';
import { BookingRequestCreate } from '@/types';

const steps = ['Date & Time', 'Location', 'Attendees', 'Venue Type', 'Notes'];

export default function BookingWizard({ artistId }: { artistId: number }) {
  const { step, setStep, details, setDetails } = useBooking();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!artistId) return;
    getArtistAvailability(artistId)
      .then((res) => setUnavailable(res.data.unavailable_dates))
      .catch(() => setUnavailable([]));
  }, [artistId]);

  const next = () => setStep(step + 1);
  const prev = () => setStep(step - 1);

  const saveDraft = async () => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      proposed_datetime_1: details.date && details.time ? new Date(
        `${format(details.date, 'yyyy-MM-dd')}T${details.time}`
      ).toISOString() : undefined,
      message: details.notes,
      status: 'draft',
    };
    try {
      await createBookingRequest(payload);
      setError(null);
      alert('Draft saved');
    } catch (e: any) {
      setError('Failed to save draft');
    }
  };

  const tileDisabled = ({ date }: { date: Date }) => {
    const day = format(date, 'yyyy-MM-dd');
    return unavailable.includes(day) || date < new Date();
  };

  return (
    <div className="space-y-4">
      <div className="flex">
        {steps.map((label, i) => (
          <div
            key={label}
            className={`flex-1 text-center p-2 text-sm ${
              i === step ? 'bg-indigo-600 text-white' : 'bg-gray-200'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <Calendar value={details.date} onChange={(d) => setDetails({ ...details, date: d as Date })} tileDisabled={tileDisabled} />
          {details.date && (
            <input
              type="time"
              value={details.time || ''}
              onChange={(e) => setDetails({ ...details, time: e.target.value })}
              className="border p-2 rounded w-full"
            />
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <label className="block text-sm font-medium">Event location</label>
          <input
            type="text"
            value={details.location || ''}
            onChange={(e) => setDetails({ ...details, location: e.target.value })}
            className="border p-2 rounded w-full"
            placeholder="Address"
          />
        </div>
      )}

      {step === 2 && (
        <div>
          <label className="block text-sm font-medium">Number of guests</label>
          <input
            type="number"
            min={1}
            value={details.guests}
            onChange={(e) => setDetails({ ...details, guests: parseInt(e.target.value, 10) })}
            className="border p-2 rounded w-full"
          />
        </div>
      )}

      {step === 3 && (
        <div>
          <label className="block text-sm font-medium">Venue type</label>
          <select
            value={details.venueType}
            onChange={(e) => setDetails({ ...details, venueType: e.target.value as any })}
            className="border p-2 rounded w-full"
          >
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      )}

      {step === 4 && (
        <div>
          <label className="block text-sm font-medium">Extra notes</label>
          <textarea
            value={details.notes || ''}
            onChange={(e) => setDetails({ ...details, notes: e.target.value })}
            className="border p-2 rounded w-full"
            rows={3}
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-between pt-2">
        {step > 0 && (
          <button onClick={prev} className="px-4 py-2 bg-gray-200 rounded">
            Back
          </button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={next} className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded">
            Next
          </button>
        ) : (
          <button onClick={saveDraft} className="ml-auto px-4 py-2 bg-green-600 text-white rounded">
            Save Draft
          </button>
        )}
      </div>
    </div>
  );
}
