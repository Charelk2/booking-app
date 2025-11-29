import * as yup from "yup";

export const bookingWizardSchema = yup.object({
  eventType: yup.string().required('Event type is required.'),
  eventDescription: yup.string().required('Event description is required.').min(5, 'Description must be at least 5 characters.'),
  date: yup.date().required('Date is required.').min(new Date(), 'Date cannot be in the past.'),
  time: yup.string().optional(),
  location: yup.string().required('Location is required.'),
  locationName: yup.string().optional(),
  guests: yup.string().required('Number of guests is required.').matches(/^\d+$/, 'Guests must be a number.'),
  venueType: yup
    .string()
    .required('Venue type is required.')
    .oneOf(['indoor', 'outdoor', 'hybrid'], 'Venue type is required.'),
  sound: yup.string().oneOf(['yes', 'no'], 'Sound equipment preference is required.').required(),
  // Optional sound-context fields (not required for basic validation)
  soundMode: yup
    .mixed<'supplier' | 'provided_by_artist' | 'managed_by_artist' | 'client_provided' | 'none'>()
    .optional(),
  soundSupplierServiceId: yup.number().optional(),
  stageRequired: yup.boolean().optional(),
  stageSize: yup.mixed<'S' | 'M' | 'L'>().optional(),
  lightingEvening: yup.boolean().optional(),
  backlineRequired: yup.boolean().optional(),
  providedSoundEstimate: yup.number().optional(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
}) as yup.ObjectSchema<any>;
