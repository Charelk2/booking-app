import type { ReactElement } from 'react';
import * as yup from 'yup';

import EventDescriptionStep from './steps/EventDescriptionStep';
import LocationStep from './steps/LocationStep';
import DateTimeStep from './steps/DateTimeStep';
import EventTypeStep from './steps/EventTypeStep';
import GuestsStep from './steps/GuestsStep';
import VenueStep from './steps/VenueStep';
import SoundStep from './steps/SoundStep';
import NotesStep from './steps/NotesStep';
import ReviewStep from './steps/ReviewStep';

export interface BookingFlowStep {
  label: string;
  component: (props: any) => ReactElement | null;
}

export interface BookingFlowModule {
  steps: BookingFlowStep[];
  validationSchema: yup.ObjectSchema<any>;
  buildSummary: (details: Record<string, any>) => string;
}

const musicianSchema = yup.object().shape({
  eventType: yup.string().required('Event type is required.'),
  eventDescription: yup
    .string()
    .required('Event description is required.')
    .min(5, 'Description must be at least 5 characters.'),
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

const baseSchema = yup.object().shape({
  eventType: yup.string().required('Event type is required.'),
  eventDescription: yup
    .string()
    .required('Event description is required.')
    .min(5, 'Description must be at least 5 characters.'),
  date: yup.date().required('Date is required.').min(new Date(), 'Date cannot be in the past.'),
  time: yup.string().optional(),
  location: yup.string().required('Location is required.'),
  guests: yup.string().required('Number of guests is required.').matches(/^\d+$/, 'Guests must be a number.'),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'], 'Venue type is required.')
    .required(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
});

const musicianFlow: BookingFlowModule = {
  steps: [
    { label: 'Event Details', component: EventDescriptionStep },
    { label: 'Location', component: LocationStep },
    { label: 'Date & Time', component: DateTimeStep },
    { label: 'Event Type', component: EventTypeStep },
    { label: 'Guests', component: GuestsStep },
    { label: 'Venue Type', component: VenueStep },
    { label: 'Sound', component: SoundStep },
    { label: 'Notes', component: NotesStep },
    { label: 'Review', component: ReviewStep },
  ],
  validationSchema: musicianSchema,
  buildSummary: (d) =>
    `Booking details:\nEvent Type: ${d.eventType || 'N/A'}\nDescription: ${d.eventDescription || 'N/A'}\nDate: ${d.date?.toLocaleDateString() || 'N/A'}\nLocation: ${d.location || 'N/A'}\nGuests: ${d.guests || 'N/A'}\nVenue: ${d.venueType || 'N/A'}\nSound: ${d.sound || 'N/A'}\nNotes: ${d.notes || 'N/A'}`,
};

const photographerFlow: BookingFlowModule = {
  steps: [
    { label: 'Event Details', component: EventDescriptionStep },
    { label: 'Location', component: LocationStep },
    { label: 'Date & Time', component: DateTimeStep },
    { label: 'Event Type', component: EventTypeStep },
    { label: 'Guests', component: GuestsStep },
    { label: 'Venue Type', component: VenueStep },
    { label: 'Notes', component: NotesStep },
    { label: 'Review', component: ReviewStep },
  ],
  validationSchema: baseSchema,
  buildSummary: (d) =>
    `Booking details:\nEvent Type: ${d.eventType || 'N/A'}\nDescription: ${d.eventDescription || 'N/A'}\nDate: ${d.date?.toLocaleDateString() || 'N/A'}\nLocation: ${d.location || 'N/A'}\nGuests: ${d.guests || 'N/A'}\nVenue: ${d.venueType || 'N/A'}\nNotes: ${d.notes || 'N/A'}`,
};

const videographerFlow: BookingFlowModule = {
  ...photographerFlow,
};

export const bookingFlowRegistry: Record<string, BookingFlowModule> = {
  musician: musicianFlow,
  photographer: photographerFlow,
  videographer: videographerFlow,
};

