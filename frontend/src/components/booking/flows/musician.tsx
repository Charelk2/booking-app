import * as yup from 'yup';
import EventDescriptionStep from '../steps/EventDescriptionStep';
import LocationStep from '../steps/LocationStep';
import DateTimeStep from '../steps/DateTimeStep';
import EventTypeStep from '../steps/EventTypeStep';
import GuestsStep from '../steps/GuestsStep';
import VenueStep from '../steps/VenueStep';
import SoundStep from '../steps/SoundStep';
import NotesStep from '../steps/NotesStep';
import ReviewStep from '../steps/ReviewStep';
import { BookingFlow, BookingStepContext } from './types';

const flow: BookingFlow = [
  {
    name: 'Event Details',
    render: ({ control, setValue, watch }: BookingStepContext) => (
      <EventDescriptionStep control={control} setValue={setValue} watch={watch} />
    ),
    validation: {
      eventDescription: yup
        .string()
        .required('Event description is required.')
        .min(5, 'Description must be at least 5 characters.'),
    },
    fieldsToValidate: ['eventDescription'],
    buildSummary: (v) => ({ eventDescription: v.eventDescription }),
  },
  {
    name: 'Location',
    render: ({ control, artistLocation, setWarning }: BookingStepContext) => (
      <LocationStep control={control} artistLocation={artistLocation} setWarning={setWarning} />
    ),
    validation: {
      location: yup.string().required('Location is required.'),
    },
    fieldsToValidate: ['location'],
    buildSummary: (v) => ({ location: v.location }),
  },
  {
    name: 'Date & Time',
    render: ({ control, unavailable }: BookingStepContext) => (
      <DateTimeStep control={control} unavailable={unavailable} />
    ),
    validation: {
      date: yup
        .date()
        .required('Date is required.')
        .min(new Date(), 'Date cannot be in the past.'),
      time: yup.string().optional(),
    },
    fieldsToValidate: ['date'],
    buildSummary: (v) => ({ date: v.date, time: v.time }),
  },
  {
    name: 'Event Type',
    render: ({ control }: BookingStepContext) => <EventTypeStep control={control} />,
    validation: {
      eventType: yup.string().required('Event type is required.'),
    },
    fieldsToValidate: ['eventType'],
    buildSummary: (v) => ({ eventType: v.eventType }),
  },
  {
    name: 'Guests',
    render: ({ control }: BookingStepContext) => <GuestsStep control={control} />,
    validation: {
      guests: yup
        .string()
        .required('Number of guests is required.')
        .matches(/^\d+$/, 'Guests must be a number.'),
    },
    fieldsToValidate: ['guests'],
    buildSummary: (v) => ({ guests: v.guests }),
  },
  {
    name: 'Venue Type',
    render: ({ control }: BookingStepContext) => <VenueStep control={control} />,
    validation: {
      venueType: yup
        .mixed<'indoor' | 'outdoor' | 'hybrid'>()
        .oneOf(['indoor', 'outdoor', 'hybrid'], 'Venue type is required.')
        .required(),
    },
    fieldsToValidate: ['venueType'],
    buildSummary: (v) => ({ venueType: v.venueType }),
  },
  {
    name: 'Sound',
    render: ({ control }: BookingStepContext) => <SoundStep control={control} />,
    validation: {
      sound: yup
        .string()
        .oneOf(['yes', 'no'], 'Sound equipment preference is required.')
        .required(),
    },
    fieldsToValidate: ['sound'],
    buildSummary: (v) => ({ sound: v.sound }),
  },
  {
    name: 'Notes',
    render: ({ control, setValue }: BookingStepContext) => (
      <NotesStep control={control} setValue={setValue} />
    ),
    validation: {
      notes: yup.string().optional(),
      attachment_url: yup.string().optional(),
    },
    fieldsToValidate: [],
    buildSummary: (v) => ({ notes: v.notes, attachment_url: v.attachment_url }),
  },
  {
    name: 'Review',
    render: ({
      step,
      steps,
      onBack,
      onSaveDraft,
      onNext,
      submitting,
      isLoadingReviewData,
      reviewDataError,
      calculatedPrice,
      travelResult,
      baseServicePrice,
    }: BookingStepContext) => (
      <ReviewStep
        step={step}
        steps={steps}
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onNext={onNext}
        submitting={submitting}
        isLoadingReviewData={isLoadingReviewData}
        reviewDataError={reviewDataError}
        calculatedPrice={calculatedPrice}
        travelResult={travelResult}
        submitLabel="Submit Request"
        baseServicePrice={baseServicePrice}
      />
    ),
    validation: {},
    fieldsToValidate: [],
    buildSummary: () => ({}),
  },
];

export default flow;
