'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';

import { useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import useIsMobile from '@/hooks/useIsMobile';
import useBookingForm from '@/hooks/useBookingForm';
import useOfflineQueue from '@/hooks/useOfflineQueue';
import { useDebounce } from '@/hooks/useDebounce';
import useKeyboardOffset from '@/hooks/useKeyboardOffset';
import {
  getServiceProviderAvailability,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
  calculateQuote,
} from '@/lib/api';
import { geocodeAddress } from '@/lib/geo';
import { calculateTravelMode, getDrivingMetrics } from '@/lib/travel';
import { trackEvent } from '@/lib/analytics';

import { BookingRequestCreate } from '@/types';
import Stepper from '../ui/Stepper';
import ProgressBar from '../ui/ProgressBar';
import toast from '../ui/Toast';

// --- Step Components ---
import EventDescriptionStep from './steps/EventDescriptionStep';
import LocationStep from './steps/LocationStep';
import DateTimeStep from './steps/DateTimeStep';
import EventTypeStep from './steps/EventTypeStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import SoundStep from './steps/SoundStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';

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
  soundMode?: 'supplier' | 'provided_by_artist' | 'managed_by_artist' | 'client_provided' | 'none';
  soundSupplierServiceId?: number;
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
  'Event Details',
  'Location',
  'Date & Time',
  'Event Type',
  'Guests',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];



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
  const [soundCost, setSoundCost] = useState(0);
  const [soundMode, setSoundMode] = useState<string | null>(null);
  const [soundModeOverridden, setSoundModeOverridden] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | undefined>(undefined);

  const { enqueue: enqueueBooking } = useOfflineQueue<{
    action: 'draft' | 'submit';
    payload: BookingRequestCreate;
    requestId?: number;
    message?: string;
  }>('offlineBookingQueue', async ({ action, payload, requestId: rid, message }) => {
    let id = rid;
    try {
      if (id) {
        await updateBookingRequest(id, payload);
      } else {
        const res = await createBookingRequest(payload);
        id = res.data.id;
        setRequestId(id);
      }
      if (action === 'submit' && id && message) {
        await postMessageToBookingRequest(id, {
          content: message,
          message_type: 'SYSTEM',
        });
        toast.success('Queued booking request submitted.');
      } else if (action === 'draft') {
        toast.success('Queued draft saved.');
      }
    } catch (err) {
      console.error('Queued booking request failed:', err);
      throw err;
    }
  });

  const isMobile = useIsMobile();
  // Convert zero-based step index to progress percentage for the mobile progress bar.
  const progressValue = ((step + 1) / steps.length) * 100;
  const hasLoaded = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const keyboardOffset = useKeyboardOffset();

  // --- Form Hook (React Hook Form + Yup) ---
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    watch,
    errors, // Directly destructure errors, assuming useBookingForm returns it at top level
  } = useBookingForm(schema, details, setDetails);

  const watchedValues = watch();
  const debouncedValues = useDebounce(watchedValues, 300);

  useEffect(() => {
    void trigger();
  }, [debouncedValues, trigger]);

  // --- Effects ---

  // Effect to manage step completion and focus heading on step change
  useEffect(() => {
    setMaxStepCompleted((prev) => Math.max(prev, step));
    setValidationError(null);
  }, [step]);

  // Ensure inputs have appropriate attributes and stay visible when focused
  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return;

    const setAttrs = (
      selector: string,
      attrs: Record<string, string>,
    ) => {
      const el = formEl.querySelector<HTMLElement>(selector);
      if (el) {
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      }
    };

    setAttrs('input[name="guests"]', {
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    setAttrs('input[name="location"]', {
      autocomplete: 'street-address',
    });
    setAttrs('input[name="date"]', {
      inputmode: 'numeric',
      autocomplete: 'bday',
    });
    setAttrs('input[name="time"]', {
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    setAttrs('textarea[name="eventDescription"]', {
      autocomplete: 'on',
    });

    const focusHandler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Scroll slightly after keyboard open
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
    formEl.addEventListener('focusin', focusHandler);
    return () => formEl.removeEventListener('focusin', focusHandler);
  }, [step]);

  // Effect to fetch artist availability and base location from API
  useEffect(() => {
    if (!artistId) return;
    const fetchArtistData = async () => {
      try {
        const [availabilityRes, artistRes] = await Promise.all([
          getServiceProviderAvailability(artistId),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/service-provider-profiles/${artistId}`,
            { cache: 'force-cache' },
          ).then((res) => res.json()),
        ]);
        setUnavailable(availabilityRes.data.unavailable_dates);
        setArtistLocation(artistRes.location || null);
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

  // Resolve selected supplier name for Review step
  useEffect(() => {
    const sid = (details as any).soundSupplierServiceId as number | undefined;
    if (!sid) {
      setSelectedSupplierName(undefined);
      return;
    }
    const run = async () => {
      try {
        const svc = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/services/${sid}`,
          { cache: 'force-cache' },
        ).then((r) => r.json());
        const publicName = svc?.details?.publicName || svc?.artist?.artist_profile?.business_name || svc?.title || undefined;
        setSelectedSupplierName(publicName);
      } catch (e) {
        console.error('Failed to fetch selected supplier', e);
        setSelectedSupplierName(undefined);
      }
    };
    void run();
  }, [details]);

  // Effect to calculate review data (price and travel mode) dynamically
  const calculateReviewData = useCallback(async () => {
    if (!serviceId || !artistLocation || !details.location) {
      setIsLoadingReviewData(false);
      setReviewDataError("Missing booking details (Service ID, Service Provider Location, or Event Location) to calculate estimates.");
      setCalculatedPrice(null);
      setTravelResult(null);
      return;
    }

    setIsLoadingReviewData(true);
    setReviewDataError(null);

    try {
      const [svcRes, artistPos, eventPos] = await Promise.all([
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/services/${serviceId}`,
          { cache: 'force-cache' },
        ).then((res) => res.json()),
        geocodeAddress(artistLocation),
        geocodeAddress(details.location),
      ]);

      if (!artistPos) {
        throw new Error(`Could not find geographic coordinates for artist's base location: "${artistLocation}".`);
      }
      if (!eventPos) {
        throw new Error(`Could not find geographic coordinates for event location: "${details.location}".`);
      }

      // Helper to safely parse numeric fields that may arrive as formatted strings
      const parseNumber = (val: unknown, fallback = 0): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const cleaned = val.replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          return Number.isNaN(parsed) ? fallback : parsed;
        }
        return fallback;
      };

      const parseOptionalNumber = (val: unknown): number | undefined => {
        if (val === null || val === undefined || val === '') return undefined;
        if (typeof val === 'number') {
          return Number.isNaN(val) ? undefined : val;
        }
        if (typeof val === 'string') {
          const cleaned = val.replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          return Number.isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
      };

      const basePrice = parseNumber(svcRes.price);
      setBaseServicePrice(basePrice); // Set the base service price

      const travelRate = parseNumber(svcRes.travel_rate, 2.5) || 2.5;
      const numTravelMembers = parseNumber(svcRes.travel_members, 1) || 1;
      const carRentalPrice = parseOptionalNumber(svcRes.car_rental_price);
      const flightPrice = parseOptionalNumber(svcRes.flight_price);

      const metrics = await getDrivingMetrics(artistLocation, details.location);
      if (!metrics.distanceKm) {
        console.error('Unable to fetch driving metrics during review calculation');
        throw new Error('Could not fetch driving metrics');
      }
      const directDistanceKm = metrics.distanceKm;
      const drivingEstimateCost = directDistanceKm * travelRate * 2;

      let quote: Awaited<ReturnType<typeof calculateQuote>> | null = null;
      if (details.sound === 'yes') {
        quote = await calculateQuote({
          base_fee: basePrice, // Use the fetched base price
          distance_km: directDistanceKm,
          service_id: serviceId,
          event_city: details.location,
        });
        setCalculatedPrice(Number(quote.total));
        // Ensure sound cost is numeric to avoid NaN totals downstream
        setSoundCost(Number(quote.sound_cost));
        setSoundMode(quote.sound_mode);
        setSoundModeOverridden(quote.sound_mode_overridden);
      } else {
        setCalculatedPrice(basePrice);
        setSoundCost(0);
        setSoundMode(null);
        setSoundModeOverridden(false);
      }

      const travelModeResult = await calculateTravelMode({
        artistLocation: artistLocation,
        eventLocation: details.location,
        numTravellers: numTravelMembers,
        drivingEstimate: drivingEstimateCost,
        travelRate,
        travelDate: details.date,
        carRentalPrice,
        flightPricePerPerson: flightPrice,
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
  }, [serviceId, artistLocation, details.location, details.date, details.sound, setTravelResult]);

  // Trigger the calculation when approaching the Review step to prefetch data
  const hasPrefetched = useRef(false);
  useEffect(() => {
    if (step >= steps.length - 2 && !hasPrefetched.current) {
      hasPrefetched.current = true;
      void calculateReviewData();
    }
  }, [step, calculateReviewData]);

  // Recalculate when the user edits location, date, or sound preference on the Review step
  useEffect(() => {
    if (step === steps.length - 1) {
      void calculateReviewData();
    }
  }, [details.location, details.date, details.sound, step, calculateReviewData]);

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
      ['eventDescription'],
      ['location'],
      ['date'],
      ['eventType'],
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
      trackEvent('booking_wizard_next', { step: newStep });
    } else {
      setValidationError('Please fix the errors above to continue.');
    }
  };

  // Navigates to the previous step
  const prev = () => {
    setStep(step - 1);
    setValidationError(null);
  };

  const handleBack = () => {
    trackEvent(step === 0 ? 'booking_wizard_cancel' : 'booking_wizard_back', {
      step,
    });
    if (step === 0) onClose();
    else prev();
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
      travel_breakdown: {
        ...(travelResult?.breakdown || {}),
        sound_required: vals.sound === 'yes',
        sound_mode: (details as any).soundMode,
        selected_sound_service_id: (details as any).soundSupplierServiceId,
        event_city: details.location,
        provided_sound_estimate: (details as any).providedSoundEstimate,
        managed_by_artist_markup_percent: undefined,
      },
    };
    if (!navigator.onLine) {
      enqueueBooking({ action: 'draft', payload, requestId });
      toast.success('Draft queued. It will save when back online.');
      return;
    }
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
      travel_breakdown: {
        ...travelResult.breakdown,
        sound_required: vals.sound === 'yes',
        selected_sound_service_id: (details as any).soundSupplierServiceId,
        event_city: details.location,
      },
    };
    const message = `Booking details:\nEvent Type: ${
      vals.eventType || 'N/A'
    }\nDescription: ${vals.eventDescription || 'N/A'}\nDate: ${
      vals.date?.toLocaleDateString() || 'N/A'
    }\nLocation: ${vals.location || 'N/A'}\nGuests: ${
      vals.guests || 'N/A'
    }\nVenue: ${vals.venueType || 'N/A'}\nSound: ${
      vals.sound || 'N/A'
    }\nNotes: ${vals.notes || 'N/A'}`;

    if (!navigator.onLine) {
      enqueueBooking({ action: 'submit', payload, requestId, message });
      toast.success('Booking request queued. It will submit when back online.');
      setSubmitting(false);
      return;
    }

    try {
      const res = requestId
        ? await updateBookingRequest(requestId, payload)
        : await createBookingRequest(payload);

      const id = requestId || res?.data?.id;
      if (!id) throw new Error('Missing booking request ID after creation/update.');

        await postMessageToBookingRequest(id, {
          content: message,
          // Backend expects uppercase message types.
          message_type: 'SYSTEM',
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
    switch (step) {
      case 0:
        return (
          <EventDescriptionStep
            control={control}
            setValue={setValue}
            watch={watch}
          />
        );
      case 1:
        return (
          <LocationStep
            control={control}
            artistLocation={artistLocation}
            setWarning={setWarning}
          />
        );
      case 2:
        return <DateTimeStep control={control} unavailable={unavailable} />;
      case 3:
        return <EventTypeStep control={control} />;
      case 4:
        return <GuestsStep control={control} />;
      case 5:
        return <VenueStep control={control} />;
      case 6:
        return (
          <SoundStep
            control={control}
            serviceId={serviceId}
            artistLocation={artistLocation}
            eventLocation={details.location}
          />
        );
      case 7:
        return <NotesStep control={control} setValue={setValue} />;
      case 8:
        return (
          <ReviewStep
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
          onNext={submitRequest}
          submitting={submitting}
          isLoadingReviewData={isLoadingReviewData}
          reviewDataError={reviewDataError}
          calculatedPrice={calculatedPrice}
          travelResult={travelResult}
          submitLabel="Submit Request"
          baseServicePrice={baseServicePrice}
          soundCost={soundCost}
          soundMode={soundMode}
          soundModeOverridden={soundModeOverridden}
          selectedSupplierName={selectedSupplierName}
        />
      );
      default: return null;
    }
  };

  if (!isOpen) return null;

  // Render a plain dialog without Headless UI's Transition wrapper so the
  // wizard does not animate in between steps.
  return (
    <Dialog
      as="div"
      className="fixed inset-0 z-50"
      open={isOpen}
      onClose={onClose}
    >
      <div className="fixed inset-0 bg-gray-500/75 z-40" />

      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <Dialog.Panel className="pointer-events-auto w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl bg-white flex flex-col overflow-hidden">
          {isMobile ? (
            // On mobile, use a simple progress bar to avoid step label overflow.
            <ProgressBar
              value={progressValue}
              className="px-6 py-4 border-b border-gray-100"
            />
          ) : (
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
          )}

          <form
            ref={formRef}
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              // Prevent default form submission on Enter key press if not mobile
              // The submit logic for the final step is now handled by ReviewStep's internal button
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-scroll p-6 space-y-6"
          >
            <div className="overscroll-contain">
              {renderStep()}

              {warning && <p className="text-orange-600 text-sm mt-4">{warning}</p>}
              {Object.keys(errors).length > 0 && (
                <p className="text-red-600 text-sm mt-4">
                  Please fix the highlighted errors above to continue.
                </p>
              )}
              {validationError && <p className="text-red-600 text-sm mt-4">{validationError}</p>}
            </div>
          </form>

          {/* Navigation controls - Adjusted for ReviewStep */}
          <div
            className="flex-shrink-0 border-t border-gray-100 p-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sticky bottom-0 bg-white pb-safe"
            style={{ bottom: keyboardOffset }}
          >
            {/* Back/Cancel Button */}
            <button
              type="button" // Ensure it's a button, not a submit
              onClick={handleBack}
              className="bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 w-32 min-h-[44px] min-w-[44px]"
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {/* Conditional rendering for Next button (only if not on Review Step) */}
            {step < steps.length - 1 && (
              <button
                type="button" // Ensure it's a button, not a submit
                onClick={next}
                className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 w-32 min-h-[44px] min-w-[44px]"
              >
                Next
              </button>
            )}
            {/* The Submit Request button for the Review Step is now handled INSIDE ReviewStep.tsx */}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
