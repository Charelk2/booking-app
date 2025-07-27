'use client';
// Main wizard component controlling the multi-step booking flow.
// On mobile devices sections collapse into accordions and the
// progress indicator remains sticky as the user scrolls.
import { useEffect, useState, useRef } from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';
import { format } from 'date-fns';
import Stepper from '../ui/Stepper'; // progress indicator
import CollapsibleSection from '../ui/CollapsibleSection';
import Card from '../ui/Card';
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
import GuestsStep from './steps/GuestsStep';
import SoundStep from './steps/SoundStep';
import VenueStep from './steps/VenueStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';
import useIsMobile from '@/hooks/useIsMobile';

const steps = [
  'Date & Time',
  'Location',
  'Guests',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];

const schema = yup.object({
  date: yup.date().required().min(new Date(), 'Pick a future date'),
  location: yup.string().required('Location is required'),
  guests: yup
    .string()
    .required('Number of guests is required')
    .matches(/^\d+$/, 'Guests must be a number'),
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
    resetBooking,
  } = useBooking();
  const router = useRouter();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const isMobile = useIsMobile();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ensure maxStepCompleted always reflects the furthest step reached.
  useEffect(() => {
    setMaxStepCompleted((prev) => Math.max(prev, step));
  }, [step]);

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
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!artistId) return;
    setLoadingAvailability(true);
    getArtistAvailability(artistId)
      .then((res) => setUnavailable(res.data.unavailable_dates))
      .catch(() => setUnavailable([]))
      .finally(() => setLoadingAvailability(false));
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
        fields = ['guests'];
        break;
      case 3:
        fields = ['venueType'];
        break;
      case 4:
        fields = ['sound'];
        break;
      default:
        fields = [];
    }
    const valid = await trigger(fields);
    if (valid) {
      const newStep = step + 1;
      setStep(newStep);
      setMaxStepCompleted(Math.max(maxStepCompleted, newStep));
    }
  };
  const prev = () => setStep(step - 1);
  const handleStepClick = (i: number) => {
    if (i <= maxStepCompleted && i !== step) setStep(i);
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
      const err = e as Error;
      setError(err.message);
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
      const lines = [
        `Date: ${format(vals.date, 'yyyy-MM-dd')}`,
        `Location: ${vals.location}`,
        `Guests: ${vals.guests}`,
        `Sound: ${vals.sound}`,
        `Venue Type: ${vals.venueType}`,
      ];
      if (vals.notes) {
        lines.push(`Notes: ${vals.notes}`);
      }
      const detailLines = lines.join('\n');
      await postMessageToBookingRequest(idToUse, {
        content: `Booking details:\n${detailLines}`,
        message_type: 'system',
      });
      toast.success('Request submitted');
      resetBooking();
      router.push(`/booking-requests/${idToUse}`);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  });

  const renderStep = (index: number) => {
    switch (index) {
      case 0:
        return (
          <DateTimeStep
            control={control as unknown as Control<FieldValues>}
            unavailable={unavailable}
            loading={loadingAvailability}
            step={index}
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
            step={index}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 2:
        return (
          <GuestsStep
            control={control as unknown as Control<FieldValues>}
            step={index}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 3:
        return (
          <VenueStep
            control={control as unknown as Control<FieldValues>}
            step={index}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 4:
        return (
          <SoundStep
            control={control as unknown as Control<FieldValues>}
            step={index}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      case 5:
        return (
          <NotesStep
            control={control as unknown as Control<FieldValues>}
            setValue={setValue as unknown as (name: string, value: unknown) => void}
            step={index}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
            onNext={next}
          />
        );
      default:
        return (
          <ReviewStep
            step={index}
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
    <div className="px-4 py-16">
      <div
        className="sticky z-20 bg-white"
        style={{ top: isMobile ? '4rem' : 0 }}
        data-testid="progress-container"
      >
        <Stepper
          steps={steps}
          currentStep={step}
          maxStepCompleted={maxStepCompleted}
          onStepClick={handleStepClick}
          ariaLabel={`Progress: step ${step + 1} of ${steps.length}`}
          variant="neutral"
        />
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="progress-status"
        >
          {`Step ${step + 1} of ${steps.length}`}
        </div>
      </div>
      {isMobile ? (
        <div className="space-y-4">
          {steps.map((label, i) => (
            <CollapsibleSection
              key={label}
              title={label}
              open={i === step}
              onToggle={() => handleStepClick(i)}
            >
              {i === step && (
                <>
                  <h2
                    className="sr-only"
                    data-testid="step-heading"
                    tabIndex={-1}
                    ref={headingRef}
                  >
                    {label}
                  </h2>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card variant="wizard">{renderStep(i)}</Card>
                    </motion.div>
                  </AnimatePresence>
                  {warning && (
                    <p className="text-orange-600 text-sm">{warning}</p>
                  )}
                  {Object.values(errors).length > 0 && (
                    <p className="text-red-600 text-sm">Please fix the errors above.</p>
                  )}
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                </>
              )}
            </CollapsibleSection>
          ))}
        </div>
      ) : (
        <Card variant="wizard" className="space-y-6">
          <h2
            className="text-2xl font-bold"
            data-testid="step-heading"
            tabIndex={-1}
            ref={headingRef}
          >
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
              {renderStep(step)}
            </motion.div>
          </AnimatePresence>
          {warning && <p className="text-orange-600 text-sm">{warning}</p>}
          {Object.values(errors).length > 0 && (
            <p className="text-red-600 text-sm">Please fix the errors above.</p>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </Card>
      )}
    </div>
  );
}
