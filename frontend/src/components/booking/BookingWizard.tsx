'use client';

import React, { useEffect, useState, useRef, Fragment, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';

import { useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import useIsMobile from '@/hooks/useIsMobile';
import useBookingForm from '@/hooks/useBookingForm';
import {
  getArtistAvailability,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
  getArtist,
  getService,
  calculateQuote,
} from '@/lib/api';
import { geocodeAddress } from '@/lib/geo';
import { calculateTravelMode, getDrivingMetrics } from '@/lib/travel';

import { BookingRequestCreate } from '@/types';
import Stepper from '../ui/Stepper';
import toast from '../ui/Toast';

// --- Step Components ---
import EventTypeStep from './steps/EventTypeStep';
import EventDescriptionStep from './steps/EventDescriptionStep';
import DateTimeStep from './steps/DateTimeStep';
import LocationStep from './steps/LocationStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import SoundStep from './steps/SoundStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep'; // Ensure this is the modified one

// --- EventDetails Type & Schema ---
type EventDetails = {
  eventType?: string;
  eventDescription?: string;
  date?: Date;
  time?: string;
  location?: string;
  guests?: string;
  venueType?: 'indoor' | 'outdoor' | 'hybrid';
  sound?: 'yes' | 'no';
  notes?: string;
  attachment_url?: string;
};

const schema = yup.object<EventDetails>().shape({
  eventType: yup.string().required('Event type is required.'),
  eventDescription: yup.string().required('Event description is required.').min(5, 'Description must be at least 5 characters.'),
  date: yup.date().required('Date is required.').min(new Date(), 'Date cannot be in the past.'),
  time: yup.string().optional(),
  location: yup.string().required('Location is required.'),
  guests: yup.string().required('Number of guests is required.').matches(/^\d+$/, 'Guests must be a number.'),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'], 'Venue type is required.')
    .required(),
  sound: yup.string().oneOf(['yes', 'no'], 'Sound equipment preference is required.').required(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
});

// --- Wizard Steps & Instructions ---
const steps = [
  'Date & Time',
  'Event Type',
  'Event Details',
  'Location',
  'Guests',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];

const instructions = [
  'When should we perform?',
  'What type of event are you planning?',
  'Tell us a little bit more about your event.',
  'Where is the show?',
  'How many people?',
  'What type of venue is it?',
  'Will sound equipment be needed?',
  'Anything else we should know?',
  'This is an estimated cost. The artist will review your request and send a formal quote.'
];

// --- Animation Variants ---
const stepVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
  transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const },
};

// --- BookingWizard Props ---
interface BookingWizardProps {
  artistId: number;
  serviceId?: number; // Optional serviceId passed as a prop
  isOpen: boolean;
  onClose: () => void;
}

// --- Main BookingWizard Component ---
export default function BookingWizard({ artistId, serviceId, isOpen, onClose }: BookingWizardProps) {
  const router = useRouter();
  const {
    step,
    setStep,
    details,
    setDetails,
    requestId,
    setRequestId,
    setServiceId: setServiceIdInContext,
    travelResult,
    setTravelResult,
    loadSavedProgress,
  } = useBooking();
  const { user } = useAuth();

  // --- Component States ---
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reviewDataError, setReviewDataError] = useState<string | null>(null);
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [baseServicePrice, setBaseServicePrice] = useState<number>(0); // New state for base service price

  const headingRef = useRef<HTMLHeadingElement>(null);
  const isMobile = useIsMobile();
  const hasLoaded = useRef(false);

  // --- Form Hook (React Hook Form + Yup) ---
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    errors, // Directly destructure errors, assuming useBookingForm returns it at top level
  } = useBookingForm(schema, details, setDetails);

  // --- Effects ---

  // Effect to manage step completion and focus heading on step change
  useEffect(() => {
    setMaxStepCompleted((prev) => Math.max(prev, step));
    headingRef.current?.focus();
    setValidationError(null);
  }, [step]);

  // Effect to fetch artist availability and base location from API
  useEffect(() => {
    if (!artistId) return;
    const fetchArtistData = async () => {
      try {
        const [availabilityRes, artistRes] = await Promise.all([
          getArtistAvailability(artistId),
          getArtist(artistId),
        ]);
        setUnavailable(availabilityRes.data.unavailable_dates);
        setArtistLocation(artistRes.data.location || null);
      } catch (err) {
        console.error('Failed to fetch artist data:', err);
      }
    };
    void fetchArtistData();
  }, [artistId]);

  // Effect to prompt to restore saved progress only when the wizard first opens
  useEffect(() => {
    if (!isOpen || hasLoaded.current) return;
    loadSavedProgress();
    hasLoaded.current = true;
  }, [isOpen, loadSavedProgress]);

  // Effect to set serviceId in the booking context if provided as a prop
  useEffect(() => {
    if (serviceId) setServiceIdInContext(serviceId);
  }, [serviceId, setServiceIdInContext]);

  // Effect to calculate review data (price and travel mode) dynamically
  const calculateReviewData = useCallback(async () => {
    if (!serviceId || !artistLocation || !details.location) {
      setIsLoadingReviewData(false);
      setReviewDataError("Missing booking details (Service ID, Artist Location, or Event Location) to calculate estimates.");
      setCalculatedPrice(null);
      setTravelResult(null);
      return;
    }

    setIsLoadingReviewData(true);
    setReviewDataError(null);

    try {
      const [svcRes, artistPos, eventPos] = await Promise.all([
        getService(serviceId),
        geocodeAddress(artistLocation),
        geocodeAddress(details.location),
      ]);

      if (!artistPos) {
        throw new Error(`Could not find geographic coordinates for artist's base location: "${artistLocation}".`);
      }
      if (!eventPos) {
        throw new Error(`Could not find geographic coordinates for event location: "${details.location}".`);
      }

      const basePrice = Number(svcRes.data.price);
      setBaseServicePrice(basePrice); // Set the base service price

      const travelRate = svcRes.data.travel_rate || 2.5;
      const numTravelMembers = svcRes.data.travel_members || 1;

      const metrics = await getDrivingMetrics(artistLocation, details.location);
      if (!metrics.distanceKm) {
        console.error('Unable to fetch driving metrics during review calculation');
        throw new Error('Could not fetch driving metrics');
      }
      const directDistanceKm = metrics.distanceKm;
      const drivingEstimateCost = directDistanceKm * travelRate * 2;

      const quoteResponse = await calculateQuote({
        base_fee: basePrice, // Use the fetched base price
        distance_km: directDistanceKm,
      });
      setCalculatedPrice(Number(quoteResponse.data.total));

      const travelModeResult = await calculateTravelMode({
        artistLocation: artistLocation,
        eventLocation: details.location,
        numTravellers: numTravelMembers,
        drivingEstimate: drivingEstimateCost,
        travelRate,
        travelDate: details.date,
      });
      setTravelResult(travelModeResult);

    } catch (err) {
      console.error('Failed to calculate booking estimates:', err);
      setReviewDataError('Failed to calculate booking estimates. Please ensure location details are accurate and try again.');
      setCalculatedPrice(null);
      setTravelResult(null);
    } finally {
      setIsLoadingReviewData(false);
    }
  }, [serviceId, artistLocation, details.location, details.date, setTravelResult]);

  // Trigger the calculation when at or beyond the Guests step
  useEffect(() => {
    if (step >= 4) { // Assuming Guests step is index 4
      void calculateReviewData();
    }
  }, [step, calculateReviewData]);

  // --- Navigation & Submission Handlers ---

  // Handles 'Enter' key press for navigation/submission
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || isMobile) return;
    e.preventDefault();
    if (step < steps.length - 1) {
      void next();
    } else {
      // For the review step, the submit is handled by the ReviewStep component's internal button
      // No action needed here for Enter key on the final step
    }
  };

  // Navigates to the next step after validation
  const next = async () => {
    const stepFields: (keyof EventDetails)[][] = [
      ['date'],
      ['eventType'],
      ['eventDescription'],
      ['location'],
      ['guests'],
      ['venueType'],
      ['sound'],
      [],
      [], // Review step has no fields to validate for "next"
    ];
    const fieldsToValidate = stepFields[step] as (keyof EventDetails)[];

    const valid = fieldsToValidate.length > 0 ? await trigger(fieldsToValidate) : true;

    if (valid) {
      const newStep = step + 1;
      setStep(newStep);
      setMaxStepCompleted(Math.max(maxStepCompleted, newStep));
      setValidationError(null);
    } else {
      setValidationError('Please fix the errors above to continue.');
    }
  };

  // Navigates to the previous step
  const prev = () => {
    setStep(step - 1);
    setValidationError(null);
  };

  // Handles saving the booking request as a draft
  const saveDraft = handleSubmit(async (vals: EventDetails) => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'draft',
      travel_mode: travelResult?.mode,
      travel_cost: travelResult?.totalCost,
      travel_breakdown: travelResult?.breakdown,
    };
    try {
      if (requestId) {
        await updateBookingRequest(requestId, payload);
      } else {
        const res = await createBookingRequest(payload);
        setRequestId(res.data.id);
      }
      toast.success('Draft saved successfully!');
    } catch (e) {
      console.error('Save Draft Error:', e);
      setValidationError('Failed to save draft. Please try again.');
    }
  });

  // Handles final submission of the booking request
  const submitRequest = handleSubmit(async (vals: EventDetails) => {
    if (!user) {
      const wantsLogin = window.confirm(
        'You need an account to submit a booking request. Press OK to sign in or Cancel to sign up.'
      );
      router.push(wantsLogin ? '/login' : '/register');
      return;
    }
    if (isLoadingReviewData || reviewDataError || calculatedPrice === null || travelResult === null) {
      setValidationError('Review data is not ready. Please wait or check for errors before submitting.');
      return;
    }

    setSubmitting(true);
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'pending_quote',
      travel_mode: travelResult.mode,
      travel_cost: travelResult.totalCost,
      travel_breakdown: travelResult.breakdown,
    };

    try {
      const res = requestId
        ? await updateBookingRequest(requestId, payload)
        : await createBookingRequest(payload);

      const id = requestId || res?.data?.id;
      if (!id) throw new Error('Missing booking request ID after creation/update.');

      await postMessageToBookingRequest(id, {
        content: `Booking details:\nEvent Type: ${vals.eventType || 'N/A'}\nDescription: ${vals.eventDescription || 'N/A'}\nDate: ${vals.date?.toLocaleDateString() || 'N/A'}\nLocation: ${vals.location || 'N/A'}\nGuests: ${vals.guests || 'N/A'}\nVenue: ${vals.venueType || 'N/A'}\nSound: ${vals.sound || 'N/A'}\nNotes: ${vals.notes || 'N/A'}`,
        message_type: 'system',
      });

      toast.success('Your booking request has been submitted successfully!');
      router.push(`/booking-requests/${id}`);
      // No resetBooking() or onClose() here, as router.push handles navigation
    } catch (e) {
      console.error('Submit Request Error:', e);
      setValidationError('Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  // --- Render Step Logic ---
  const renderStep = () => {
    const commonProps = { step, steps, onBack: prev, onSaveDraft: saveDraft, onNext: next };

    switch (step) {
      case 0: return <DateTimeStep control={control} unavailable={unavailable} />;
      case 1: return <EventTypeStep control={control} />;
      case 2: return <EventDescriptionStep control={control} />;
      case 3: return (
        <LocationStep
          control={control}
          artistLocation={artistLocation}
          setWarning={setWarning}
          {...commonProps}
        />
      );
      case 4: return <GuestsStep control={control} {...commonProps} />;
      case 5: return <VenueStep control={control} {...commonProps} />;
      case 6: return <SoundStep control={control} {...commonProps} />;
      case 7: return <NotesStep control={control} setValue={setValue} />;
      case 8: return (
        <ReviewStep
          {...commonProps}
          isLoadingReviewData={isLoadingReviewData}
          reviewDataError={reviewDataError}
          calculatedPrice={calculatedPrice}
          travelResult={travelResult} // Pass travelResult
          onNext={submitRequest} // Pass submitRequest as onNext for the ReviewStep's button
          submitting={submitting}
          submitLabel="Submit Request"
          baseServicePrice={baseServicePrice} // Pass baseServicePrice
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

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // Prevent default form submission on Enter key press if not mobile
                  // The submit logic for the final step is now handled by ReviewStep's internal button
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 overflow-y-scroll p-6 space-y-6"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={stepVariants}
                    transition={stepVariants.transition}
                  >
                    <h2
                      className="text-2xl font-bold mb-1"
                      ref={headingRef}
                      data-testid="step-heading"
                    >
                      {steps[step]}
                    </h2>
                    <p className="text-gray-600 mb-4">{instructions[step]}</p>
                    {renderStep()}

                    {warning && <p className="text-orange-600 text-sm mt-4">{warning}</p>}
                    {Object.keys(errors).length > 0 && (
                      <p className="text-red-600 text-sm mt-4">
                        Please fix the highlighted errors above to continue.
                      </p>
                    )}
                    {validationError && <p className="text-red-600 text-sm mt-4">{validationError}</p>}
                  </motion.div>
                </AnimatePresence>
              </form>

              {/* Navigation controls - Adjusted for ReviewStep */}
              <div className="flex-shrink-0 border-t border-gray-100 p-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
                {/* Back/Cancel Button */}
                <button
                  type="button" // Ensure it's a button, not a submit
                  onClick={step === 0 ? onClose : prev}
                  className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 w-32"
                >
                  {step === 0 ? 'Cancel' : 'Back'}
                </button>

                {/* Conditional rendering for Next button (only if not on Review Step) */}
                {step < steps.length - 1 && (
                  <button
                    type="button" // Ensure it's a button, not a submit
                    onClick={next}
                    className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 w-32"
                  >
                    Next
                  </button>
                )}
                {/* The Submit Request button for the Review Step is now handled INSIDE ReviewStep.tsx */}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
