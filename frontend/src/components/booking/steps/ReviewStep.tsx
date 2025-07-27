'use client';

import { Control, FieldValues } from 'react-hook-form';
import WizardNav from '../WizardNav'; // Assuming WizardNav handles its own btn styling
// import { useWatch } from 'react-hook-form'; // Uncomment if you need to watch form values here
// import SummarySidebar from '../SummarySidebar'; // Assuming this component exists

interface Props {
  control: Control<FieldValues>; // To read the form data for display
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void; // This will trigger final form submission
  isSubmitting: boolean; // Prop to indicate if the form is currently submitting
}

export default function ReviewStep({
  control,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
  isSubmitting,
}: Props) {
  // Example: How to get form data if you need to display it
  // const formData = useWatch({ control, name: [] }); // Watches all fields

  return (
    <div className="wizard-step-container"> {/* THE ONE CARD FOR THIS STEP */}
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Review & Submit</h2>
      <p className="text-lg text-gray-600 mb-6">Please review your booking details before submitting your request.</p>

      {/* Main review content container - Flat, not a nested prominent card */}
      <div className="p-6 border border-gray-300 rounded-lg bg-white shadow-sm flex flex-col gap-4">
        {/* Placeholder for SummarySidebar or direct review content */}
        {/* If SummarySidebar is a separate component that pulls data, render it here */}
        {/* <SummarySidebar /> */}
        {/* OR, display data directly from formData: */}
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Your Booking Summary</h3>

        <div className="flex flex-col gap-4">
          {/* Example Review Section 1: Date & Time */}
          <div className="flex justify-between items-start">
            <span className="text-base font-medium text-gray-700">Event Date & Time:</span>
            <span className="text-lg text-gray-900 text-right">
              {/* {formData.dateTimeField ? new Date(formData.dateTimeField).toLocaleString() : 'N/A'} */}
              [Date & Time Placeholder]
            </span>
          </div>
          <hr className="border-gray-300 w-full" /> {/* Divider */}

          {/* Example Review Section 2: Location */}
          <div className="flex justify-between items-start">
            <span className="text-base font-medium text-gray-700">Event Location:</span>
            <span className="text-lg text-gray-900 text-right">
              {/* {formData.locationField || 'N/A'} */}
              [Location Placeholder]
            </span>
          </div>
          <hr className="border-gray-300 w-full" /> {/* Divider */}

          {/* Example Review Section 3: Guests */}
          <div className="flex justify-between items-start">
            <span className="text-base font-medium text-gray-700">Number of Guests:</span>
            <span className="text-lg text-gray-900 text-right">
              {/* {formData.guestsField || 'N/A'} */}
              [Guests Placeholder]
            </span>
          </div>
          <hr className="border-gray-300 w-full" /> {/* Divider */}

          {/* Example Review Section 4: Venue Type */}
          <div className="flex justify-between items-start">
            <span className="text-base font-medium text-gray-700">Venue Type:</span>
            <span className="text-lg text-gray-900 text-right">
              {/* {formData.venueTypeField ? formData.venueTypeField.label : 'N/A'} */}
              [Venue Type Placeholder]
            </span>
          </div>
          <hr className="border-gray-300 w-full" /> {/* Divider */}

          {/* Example Review Section 5: Sound Needs */}
          <div className="flex justify-between items-start">
            <span className="text-base font-medium text-gray-700">Sound Equipment Needed:</span>
            <span className="text-lg text-gray-900 text-right">
              {/* {formData.soundField === 'yes' ? 'Yes' : 'No'} */}
              [Sound Placeholder]
            </span>
          </div>
          <hr className="border-gray-300 w-full" /> {/* Divider */}

          {/* Example Review Section 6: Notes */}
          <div className="flex justify-between items-start flex-col sm:flex-row">
            <span className="text-base font-medium text-gray-700 sm:w-1/3">Additional Notes:</span>
            <span className="text-lg text-gray-900 mt-1 sm:mt-0 sm:w-2/3">
              {/* {formData.notesField || 'No notes provided.'} */}
              [Notes Placeholder]
            </span>
          </div>
          {/* Add review for attachment_url if present */}
          {/* {formData.attachment_url && (
            <>
              <hr className="border-gray-300 w-full" />
              <div className="flex justify-between items-start flex-col sm:flex-row">
                <span className="text-base font-medium text-gray-700 sm:w-1/3">Attachment:</span>
                <a href={formData.attachment_url} target="_blank" rel="noopener noreferrer" className="text-lg text-brand-primary hover:underline mt-1 sm:mt-0 sm:w-2/3 truncate">
                  View Attachment
                </a>
              </div>
            </>
          )} */}

        </div>
      </div>
      {/* WizardNav is assumed to be rendered by a parent component that wraps the steps */}
    </div>
  );
}
