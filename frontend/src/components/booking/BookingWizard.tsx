'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format } from 'date-fns';
import {
  getArtistAvailability,
  createBookingRequest,
  updateBookingRequest,
  getArtist,
} from '@/lib/api';
import { BookingRequestCreate } from '@/types';
import { useBooking, EventDetails } from '@/contexts/BookingContext';
import DateTimeStep from './steps/DateTimeStep';
import LocationStep from './steps/LocationStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import NotesStep from './steps/NotesStep';
import SummarySidebar from './SummarySidebar';

const steps = ['Date & Time', 'Location', 'Attendees', 'Venue Type', 'Notes'];

const schema = yup.object({
  date: yup.date().required().min(new Date(), 'Pick a future date'),
  time: yup.string().required('Time is required'),
  location: yup.string().required('Location is required'),
  guests: yup.number().min(1).required(),
  venueType: yup.string().required(),
  notes: yup.string().optional(),
});

export default function BookingWizard({ artistId }: { artistId: number }) {
  const { step, setStep, details, setDetails, requestId, setRequestId } = useBooking();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EventDetails>({
    defaultValues: details,
    resolver: yupResolver(schema),
    mode: 'onChange',
  });

  useEffect(() => {
    const sub = watch((v) => setDetails(v as EventDetails));
    return () => sub.unsubscribe();
  }, [watch, setDetails]);

  useEffect(() => {
    if (!artistId) return;
    getArtistAvailability(artistId)
      .then((res) => setUnavailable(res.data.unavailable_dates))
      .catch(() => setUnavailable([]));
    getArtist(artistId)
      .then((res) => setArtistLocation(res.data.location || null))
      .catch(() => setArtistLocation(null));
  }, [artistId]);

  const next = handleSubmit(() => setStep(step + 1));
  const prev = () => setStep(step - 1);

  const saveDraft = handleSubmit(async (vals) => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      proposed_datetime_1:
        vals.date && vals.time
          ? new Date(`${format(vals.date, 'yyyy-MM-dd')}T${vals.time}`).toISOString()
          : undefined,
      message: vals.notes,
      status: 'draft',
    };
    try {
      if (requestId) {
        await updateBookingRequest(requestId, payload);
      } else {
        const res = await createBookingRequest(payload);
        setRequestId(res.data.id);
      }
      setError(null);
      alert('Draft saved');
    } catch (e) {
      setError('Failed to save draft');
    }
  });

  const renderStep = () => {
    switch (step) {
      case 0:
        return <DateTimeStep control={control} unavailable={unavailable} watch={watch} />;
      case 1:
        return (
          <LocationStep
            control={control}
            artistLocation={artistLocation || undefined}
            setWarning={setWarning}
          />
        );
      case 2:
        return <GuestsStep control={control} />;
      case 3:
        return <VenueStep control={control} />;
      default:
        return <NotesStep control={control} />;
    }
  };

  return (
    <div className="lg:flex lg:space-x-4">
      <div className="flex-1 space-y-4">
        <div className="flex" aria-label="Progress">
          {steps.map((label, i) => (
            <div
              key={label}
              className={`flex-1 text-center p-2 text-sm ${i === step ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
            >
              {label}
            </div>
          ))}
        </div>
        {renderStep()}
        {warning && <p className="text-orange-600 text-sm">{warning}</p>}
        {Object.values(errors).length > 0 && (
          <p className="text-red-600 text-sm">Please fix the errors above.</p>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-between pt-2">
          {step > 0 && (
            <button type="button" onClick={prev} className="px-4 py-2 bg-gray-200 rounded">
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button type="button" onClick={next} className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded">
              Next
            </button>
          ) : (
            <button type="button" onClick={saveDraft} className="ml-auto px-4 py-2 bg-green-600 text-white rounded">
              Save Draft
            </button>
          )}
        </div>
      </div>
      <div className="hidden lg:block w-64">
        <SummarySidebar />
      </div>
    </div>
  );
}
