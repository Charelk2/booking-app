'use client';

import React, { useEffect, useState, useRef, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';

import { useBooking } from '@/contexts/BookingContext';
import useIsMobile from '@/hooks/useIsMobile';
import useBookingForm from '@/hooks/useBookingForm';
import {
  getArtistAvailability,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
  getArtist,
} from '@/lib/api';

import { BookingRequestCreate } from '@/types';
import Stepper from '../ui/Stepper';
import Button from '../ui/Button';
import toast from '../ui/Toast';

import EventTypeStep from './steps/EventTypeStep';
import EventDescriptionStep from './steps/EventDescriptionStep';
import DateTimeStep from './steps/DateTimeStep';
import LocationStep from './steps/LocationStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import SoundStep from './steps/SoundStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';

type EventDetails = {
  eventType?: string;
  eventDescription?: string;
  date?: Date;
  location?: string;
  guests?: string;
  venueType?: 'indoor' | 'outdoor' | 'hybrid';
  sound?: 'yes' | 'no';
  notes?: string;
  attachment_url?: string;
};

const schema = yup.object<EventDetails>().shape({
  eventType: yup.string().required(),
  eventDescription: yup.string().required().min(5),
  date: yup.date().required().min(new Date()),
  location: yup.string().required(),
  guests: yup.string().required().matches(/^\d+$/, 'Must be a number'),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'])
    .required(),
  sound: yup.string().oneOf(['yes', 'no']).required(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
});

const steps = [
  'Event Type',
  'Event Details',
  'Date & Time',
  'Location',
  'Guests',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];

const instructions = [
  'What type of event are you planning?',
  'Tell us a little bit more about your event.',
  'When should we perform?',
  'Where is the show?',
  'How many people?',
  'What type of venue is it?',
  'Will sound equipment be needed?',
  'Anything else we should know?',
  'Please confirm the information above before sending your request.',
];

const stepVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
  transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const },
};

interface BookingWizardProps {
  artistId: number;
  serviceId?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function BookingWizard({ artistId, serviceId, isOpen, onClose }: BookingWizardProps) {
  const router = useRouter();
  const {
    step,
    setStep,
    details,
    setDetails,
    requestId,
    setRequestId,
    setServiceId,
    resetBooking,
    loadSavedProgress,
  } = useBooking();

  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isMobile = useIsMobile();
  const hasLoaded = useRef(false);

  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    errors,
  } = useBookingForm(schema, details, setDetails);

  useEffect(() => {
    setMaxStepCompleted((prev) => Math.max(prev, step));
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!artistId) return;
    getArtistAvailability(artistId).then((res) => setUnavailable(res.data.unavailable_dates));
    getArtist(artistId).then((res) => setArtistLocation(res.data.location || null));
  }, [artistId]);

  // Prompt to restore saved progress only when the wizard first opens
  useEffect(() => {
    if (!isOpen || hasLoaded.current) return;
    loadSavedProgress();
    hasLoaded.current = true;
  }, [isOpen, loadSavedProgress]);

  useEffect(() => {
    if (serviceId) setServiceId(serviceId);
  }, [serviceId, setServiceId]);

  const next = async () => {
    const stepFields: (keyof EventDetails)[][] = [
      ['eventType'],
      ['eventDescription'],
      ['date'],
      ['location'],
      ['guests'],
      ['venueType'],
      ['sound'],
      [],
      [],
    ];
    const fields = stepFields[step] as (keyof EventDetails)[];
    const valid = fields.length > 0 ? await trigger(fields) : true;
    if (valid) {
      const newStep = step + 1;
      setStep(newStep);
      setMaxStepCompleted(Math.max(maxStepCompleted, newStep));
    } else {
      setError('Please fix the errors above to continue.');
    }
  };

  const prev = () => setStep(step - 1);

  const saveDraft = handleSubmit(async (vals: EventDetails) => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'draft',
    };
    try {
      if (requestId) await updateBookingRequest(requestId, payload);
      else {
        const res = await createBookingRequest(payload);
        setRequestId(res.data.id);
      }
      toast.success('Draft saved');
    } catch (e) {
      setError((e as Error).message);
    }
  });

  const submitRequest = handleSubmit(async (vals: EventDetails) => {
    setSubmitting(true);
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'pending_quote',
    };
  
    try {
      const res = requestId
        ? await updateBookingRequest(requestId, payload)
        : await createBookingRequest(payload);
  
      const id = requestId || res?.data?.id;
      if (!id) throw new Error('Missing booking request ID');
  
      await postMessageToBookingRequest(id, {
        content: `Booking details:\nEvent Type: ${vals.eventType}\nDescription: ${vals.eventDescription}\nDate: ${vals.date}\nLocation: ${vals.location}\nGuests: ${vals.guests}\nVenue: ${vals.venueType}\nSound: ${vals.sound}\nNotes: ${vals.notes}`,
        message_type: 'system',
      });
  
      toast.success('Request submitted');
  
      // 🚨 DO NOT resetBooking here
      // router.push immediately, reset later
      router.push(`/booking-requests/${id}`);
    } catch (e) {
      console.error('Submit Error:', e);
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  });
  

  const renderStep = () => {
    const common = { step, steps, onBack: prev, onSaveDraft: saveDraft, onNext: next };
    switch (step) {
      case 0:
        return <EventTypeStep control={control} />;
      case 1:
        return <EventDescriptionStep control={control} />;
      case 2:
        return <DateTimeStep control={control} unavailable={unavailable} />;
      case 3:
        return (
          <LocationStep
            control={control}
            artistLocation={artistLocation}
            setWarning={setWarning}
            {...common}
          />
        );
      case 4:
        return <GuestsStep control={control} {...common} />;
      case 5:
        return <VenueStep control={control} {...common} />;
      case 6:
        return <SoundStep control={control} {...common} />;
      case 7:
        return <NotesStep control={control} setValue={setValue} />;
      case 8:
        return (
          <ReviewStep
            {...common}
            onNext={submitRequest}
            submitting={submitting}
            submitLabel="Submit Request"
          />
        );
      default: return null;
    }
  };
  if (!isOpen) return null;

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-gray-500/75 z-40" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="pointer-events-auto w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl bg-white flex flex-col overflow-hidden">
              <Stepper
                steps={steps}
                currentStep={step}
                maxStepCompleted={maxStepCompleted}
                onStepClick={setStep}
                ariaLabel="Booking progress"
                orientation="horizontal"
                className="px-6 py-4 border-b border-gray-100"
                noCircles
              />

              <form className="flex-1 overflow-y-scroll p-6 space-y-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={stepVariants}
                    transition={stepVariants.transition}
                  >
                    <h2 className="text-2xl font-bold" ref={headingRef} data-testid="step-heading">{steps[step]}</h2>
                    <p className="text-gray-600">{instructions[step]}</p>
                    {renderStep()}
                    {warning && <p className="text-orange-600 text-sm mt-4">{warning}</p>}
                    {Object.values(errors).length > 0 && <p className="text-red-600 text-sm mt-4">Please fix the errors above.</p>}
                    {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
                  </motion.div>
                </AnimatePresence>
              </form>

              <div className="flex-shrink-0 border-t border-gray-100 p-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
                <Button variant="outline" onClick={step === 0 ? onClose : prev}>
                  {step === 0 ? 'Cancel' : 'Back'}
                </Button>
                {step < steps.length - 1 ? (
                  <Button onClick={next} data-testid={step === 2 ? 'date-next-button' : undefined}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={submitRequest} isLoading={submitting}>
                    Submit Request
                  </Button>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
