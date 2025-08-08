import * as yup from 'yup';
import { EventDetails } from '@/contexts/BookingContext';

/** Context passed to each step module's render function. */
export interface BookingStepContext {
  control: any;
  setValue: any;
  watch: any;
  unavailable: string[];
  artistLocation: string | null;
  setWarning: (msg: string | null) => void;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  submitting: boolean;
  isLoadingReviewData: boolean;
  reviewDataError: string | null;
  calculatedPrice: number | null;
  travelResult: any;
  baseServicePrice: number;
}

/** Definition of a booking step module. */
export interface BookingStepModule {
  name: string;
  /** Render the step component. */
  render: (ctx: BookingStepContext) => JSX.Element;
  /** Yup field validations applied for this step. */
  validation: Record<string, yup.AnySchema>;
  /** Fields to validate before moving to the next step. */
  fieldsToValidate: (keyof EventDetails)[];
  /** Extracts data for the backend `details` payload. */
  buildSummary: (values: EventDetails) => Record<string, unknown>;
}

export type BookingFlow = BookingStepModule[];
