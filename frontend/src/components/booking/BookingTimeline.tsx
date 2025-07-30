import React from 'react';
import Stepper from '../ui/Stepper';

export interface BookingTimelineProps {
  /** Current booking request status string. */
  status: string;
}

const steps = [
  'Request Submitted',
  'Artist Reviewing',
  'Quote Sent',
  'Quote Accepted/Rejected',
];

/**
 * Map backend BookingRequestStatus values to stepper indices.
 */
const STATUS_TO_STEP: Record<string, number> = {
  draft: 0,
  pending_quote: 1,
  quote_provided: 2,
  pending_artist_confirmation: 3,
  request_confirmed: 3,
  request_completed: 3,
  request_declined: 3,
  request_withdrawn: 3,
  quote_rejected: 3,
};

/**
 * Display a vertical timeline showing the progress of a booking request.
 */
export default function BookingTimeline({ status }: BookingTimelineProps) {
  const currentStep = STATUS_TO_STEP[status] ?? 0;
  return (
    <Stepper
      steps={steps}
      currentStep={currentStep}
      orientation="vertical"
      variant="neutral"
      noCircles
      className="space-y-2"
    />
  );
}
