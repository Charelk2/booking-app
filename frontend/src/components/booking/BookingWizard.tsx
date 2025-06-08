'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';
import { format } from 'date-fns';
import Button from '../ui/Button';
import Stepper from '../ui/Stepper';
import useIsMobile from '@/hooks/useIsMobile';
import MobileActionBar from './MobileActionBar';
import {
  getArtistAvailability,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
  getArtist,
} from '@/lib/api';
import { BookingRequestCreate } from '@/types';
import { useBooking, EventDetails } from '@/contexts/BookingContext';
import useBookingForm from '@/hooks/useBookingForm';
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

export default function BookingWizard({
  artistId,
  serviceId,
}: {
  artistId: number;
  serviceId?: number;
}) {
  const {
    step,
    setStep,
    details,
    setDetails,
    serviceId: contextServiceId,
    setServiceId,
    requestId,
    setRequestId,
  } = useBooking();
  const router = useRouter();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();

  const {
    control,
    handleSubmit,
    trigger,
    watch,
    errors,
  } = useBookingForm(schema, details, setDetails);

  // Keep the start of each step visible on small screens
  // so navigation feels smooth on mobile devices.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  useEffect(() => {
    if (!artistId) return;
    getArtistAvailability(artistId)
      .then((res) => setUnavailable(res.data.unavailable_dates))
      .catch(() => setUnavailable([]));
    getArtist(artistId)
      .then((res) => setArtistLocation(res.data.location || null))
      .catch(() => setArtistLocation(null));
  }, [artistId]);

  useEffect(() => {
    if (serviceId) setServiceId(serviceId);
  }, [serviceId, setServiceId]);

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
      service_id: contextServiceId,
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
      service_id: contextServiceId,
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
      router.push(`/booking-requests/${idToUse}`);
    } catch (e) {
      setError('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  });

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <DateTimeStep
            control={control}
            unavailable={unavailable}
            watch={watch}
            onNext={next}
          />
        );
      case 1:
        return (
          <LocationStep
            control={control}
            artistLocation={artistLocation || undefined}
            setWarning={setWarning}
            onNext={next}
          />
        );
      case 2:
        return <GuestsStep control={control} onNext={next} />;
      case 3:
        return <VenueStep control={control} onNext={next} />;
      case 4:
        return <NotesStep control={control} onNext={next} />;
      default:
        return (
          <ReviewStep
            onSaveDraft={saveDraft}
            onSubmit={submitRequest}
            submitting={submitting}
          />
        );
    }
  };

  return (
    <div className="lg:flex lg:space-x-4">
      <div className="flex-1 space-y-4 pb-16 lg:pb-0">
        <Stepper steps={steps} currentStep={step} />
        <h2 className="text-xl font-semibold" data-testid="step-heading">
          {steps[step]}
        </h2>
        {renderStep()}
        {warning && <p className="text-orange-600 text-sm">{warning}</p>}
        {Object.values(errors).length > 0 && (
          <p className="text-red-600 text-sm">Please fix the errors above.</p>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!isMobile && (
          <div className="flex justify-between pt-2">
            {step > 0 && (
              <Button variant="secondary" type="button" onClick={prev}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button type="button" onClick={next} className="ml-auto">
                Next
              </Button>
            ) : (
              <div className="flex space-x-2 ml-auto">
                <Button variant="secondary" type="button" onClick={saveDraft}>
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={submitRequest}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="hidden lg:block w-64">
        <SummarySidebar />
      </div>
      <div className="lg:hidden mt-4">
        <SummarySidebar />
      </div>
      {isMobile && (
        <MobileActionBar
          showBack={step > 0}
          onBack={prev}
          showNext={step < steps.length - 1}
          onNext={next}
          onSaveDraft={saveDraft}
          onSubmit={submitRequest}
          submitting={submitting}
        />
      )}
    </div>
  );
}
