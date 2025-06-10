'use client';
// Main wizard component controlling the multi-step booking flow. Comments
// marked TODO highlight planned mobile UX enhancements like collapsible
// sections and sticky progress indicators.
import { useEffect, useState } from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';
import { format } from 'date-fns';
import Stepper from '../ui/Stepper'; // progress indicator
import { AnimatePresence, motion } from 'framer-motion';
import toast from '../ui/Toast';
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
import SoundStep from './steps/SoundStep';
import VenueStep from './steps/VenueStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';

const steps = [
  'Date & Time',
  'Location',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];

const schema = yup.object({
  date: yup.date().required().min(new Date(), 'Pick a future date'),
  location: yup.string().required('Location is required'),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'])
    .required(),
  sound: yup.string().oneOf(['yes', 'no']).required(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
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

  const {
    control,
    handleSubmit,
    trigger,
    setValue,
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
        fields = ['date'];
        break;
      case 1:
        fields = ['location'];
        break;
      case 2:
        fields = ['venueType'];
        break;
      case 3:
        fields = ['sound'];
        break;
      default:
        fields = [];
    }
    const valid = await trigger(fields);
    if (valid) setStep(step + 1);
  };
  const prev = () => setStep(step - 1);
  const handleStepClick = (i: number) => {
    if (i < step) setStep(i);
  };

  const saveDraft = handleSubmit(async (vals) => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: contextServiceId,
      proposed_datetime_1: vals.date ? new Date(vals.date).toISOString() : undefined,
      message: vals.notes,
      attachment_url: vals.attachment_url,
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
      toast.success('Draft saved');
    } catch (e) {
      setError('Failed to save draft');
    }
  });

  const submitRequest = handleSubmit(async (vals) => {
    setSubmitting(true);
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: contextServiceId,
      proposed_datetime_1: vals.date ? new Date(vals.date).toISOString() : undefined,
      message: vals.notes,
      attachment_url: vals.attachment_url,
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
        `Date: ${format(vals.date, 'yyyy-MM-dd')}`,
        `Location: ${vals.location}`,
        `Sound: ${vals.sound}`,
        `Venue Type: ${vals.venueType}`,
        vals.notes ? `Notes: ${vals.notes}` : null,
      ].filter(Boolean).join('\n');
      await postMessageToBookingRequest(idToUse, {
        content: `Booking details:\n${detailLines}`,
        message_type: 'system',
      });
      toast.success('Request submitted');
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
            control={control as unknown as Control<FieldValues>}
            unavailable={unavailable}
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 1:
        return (
          <LocationStep
            control={control as unknown as Control<FieldValues>}
            artistLocation={artistLocation || undefined}
            setWarning={setWarning}
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 2:
        return (
          <VenueStep
            control={control as unknown as Control<FieldValues>}
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 3:
        return (
          <SoundStep
            control={control as unknown as Control<FieldValues>}
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 4:
        return (
          <NotesStep
            control={control as unknown as Control<FieldValues>}
            setValue={setValue as unknown as (name: string, value: unknown) => void}
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      default:
        return (
          <ReviewStep
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onSubmit={submitRequest}
            submitting={submitting}
          />
        );
    }
  };

  return (
    <div className="px-4">
      <Stepper steps={steps} currentStep={step} onStepClick={handleStepClick} />
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md space-y-6">
        <h2 className="text-2xl font-bold" data-testid="step-heading">
          {steps[step]}
        </h2>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
        {warning && <p className="text-orange-600 text-sm">{warning}</p>}
        {Object.values(errors).length > 0 && (
          <p className="text-red-600 text-sm">Please fix the errors above.</p>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}
