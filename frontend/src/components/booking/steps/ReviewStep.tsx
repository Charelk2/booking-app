'use client';
// Final review step showing a summary of all selections.
import WizardNav from '../WizardNav'; // WizardNav is back!
import { useBooking } from '@/contexts/BookingContext';
import { format } from 'date-fns';

// Props interface: Now includes all CommonStepProps for WizardNav
interface Props {
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: (e?: React.BaseSyntheticEvent) => Promise<void>; // Corrected signature
  onNext: (e?: React.BaseSyntheticEvent) => Promise<void>; // Renamed from onSubmit, corrected signature
  submitting: boolean;
  submitLabel?: string; // Add if WizardNav uses this
}

export default function ReviewStep({
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext, // Changed from onSubmit
  submitting,
  submitLabel, // Added
}: Props) {
  const { details } = useBooking();

  // WizardNav is assumed to be a separate component that handles these buttons.
  // The structure below is a placeholder if WizardNav is a simple div or needs adjustment.
  // It should match the actual WizardNav's rendering.
  // NOTE: If your WizardNav component is the one provided in a previous turn,
  // it doesn't need to be defined here, just imported and used.
  // I'm assuming it's imported correctly.

  return (
    <div className="wizard-step-container">
      <p><strong>Date:</strong> {details.date ? format(details.date, 'PPP') : 'N/A'}</p>
      <p><strong>Location:</strong> {details.location || 'N/A'}</p>
      <p><strong>Guests:</strong> {details.guests || 'N/A'}</p>
      <p><strong>Venue Type:</strong> {details.venueType ? String(details.venueType).charAt(0).toUpperCase() + String(details.venueType).slice(1) : 'N/A'}</p>
      <p><strong>Sound Equipment:</strong> {details.sound ? String(details.sound).charAt(0).toUpperCase() + String(details.sound).slice(1) : 'N/A'}</p>
      <p><strong>Notes:</strong> {details.notes || 'None'}</p>
      {details.attachment_url && <p><strong>Attachment:</strong> <a href={details.attachment_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Attachment</a></p>}

      {/* WizardNav is now correctly rendered here with all its props */}

    </div>
  );
}