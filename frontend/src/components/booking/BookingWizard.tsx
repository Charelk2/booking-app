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
  postMessageToBookingRequest,
  getArtist,
} from '@/lib/api';
import { BookingRequestCreate } from '@/types';
import { useBooking, EventDetails } from '@/contexts/BookingContext';
import DateTimeStep from './steps/DateTimeStep';
import LocationStep from './steps/LocationStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';
import SummarySidebar from './SummarySidebar';

const steps = [
  'Date & Time',
  'Location',
  'Attendees',
  'Venue Type',
  'Notes',
  'Review',
];

const schema = yup.object({
  date: yup.date().required().min(new Date(), 'Pick a future date'),
  time: yup.string().optional(),
  location: yup.string().required('Location is required'),
  guests: yup.number().min(1).required(),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'])
    .required(),
  notes: yup.string().optional(),
});

export default function BookingWizard({ artistId }: { artistId: number }) {
  const { step, setStep, details, setDetails, requestId, setRequestId } = useBooking();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    trigger,
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

  // Validate only the fields relevant to the current step. This prevents
  // "Please fix the errors above" from appearing when later steps haven't
  // been filled out yet.
  const next = async () => {
    let fields: (keyof EventDetails)[] = [];
    switch (step) {
      case 0:
        fields = ['date', 'time'];
        break;
      case 1:
        fields = ['location'];
        break;
      case 2:
        fields = ['guests'];
        break;
      case 3:
        fields = ['venueType'];
        break;
      default:
        fields = [];
    }
    const valid = await trigger(fields);
    if (valid) setStep(step + 1);
  };
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

  const submitRequest = handleSubmit(async (vals) => {
    setSubmitting(true);
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      proposed_datetime_1:
        vals.date && vals.time
          ? new Date(`${format(vals.date, 'yyyy-MM-dd')}T${vals.time}`).toISOString()
          : undefined,
      message: vals.notes,
      status: 'pending_quote',
    };
    try {
      let res;
      if (requestId) {
        res = await updateBookingRequest(requestId, payload);
      } else {
        res = await createBookingRequest(payload);
        setRequestId(res.data.id);
      }
      const idToUse = requestId || res.data.id;
      const detailLines = [
        `Date: ${format(vals.date, 'yyyy-MM-dd')}${vals.time ? ` ${vals.time}` : ''}`,
        `Location: ${vals.location}`,
        `Guests: ${vals.guests}`,
        `Venue Type: ${vals.venueType}`,
        vals.notes ? `Notes: ${vals.notes}` : null,
      ].filter(Boolean).join('\n');
      await postMessageToBookingRequest(idToUse, {
        content: `Booking details:\n${detailLines}`,
        message_type: 'system',
      });
      alert('Request submitted');
    } catch (e) {
      setError('Failed to submit request');
    } finally {
      setSubmitting(false);
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
      case 4:
        return <NotesStep control={control} />;
      default:
        return <ReviewStep />;
    }
  };

  return (
    <div className="lg:flex lg:space-x-4">
      <div className="flex-1 space-y-4">
        <div className="flex items-center" aria-label="Progress">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${i <= step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}
              >
                {i + 1}
              </div>
              <span className="ml-2 text-sm">{label}</span>
              {i < steps.length - 1 && (
                <div className="flex-1 border-t border-gray-200 mx-2" />
              )}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-200 rounded h-2" aria-hidden="true">
          <div
            className="bg-indigo-600 h-2 rounded"
            style={{ width: `${(step / (steps.length - 1)) * 100}%` }}
          />
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
            <button
              type="button"
              onClick={next}
              className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Next
            </button>
          ) : (
            <div className="flex space-x-2 ml-auto">
              <button
                type="button"
                onClick={saveDraft}
                className="px-4 py-2 bg-gray-200 rounded"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="hidden lg:block w-64">
        <SummarySidebar />
      </div>
    </div>
  );
}
