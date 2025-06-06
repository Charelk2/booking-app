'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format } from 'date-fns';
import useIsMobile from '@/hooks/useIsMobile';
import Button from '../../ui/Button';

interface Props {
  onSaveDraft: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export default function ReviewStep({
  onSaveDraft,
  onSubmit,
  submitting,
}: Props) {
  const { details } = useBooking();
  const isMobile = useIsMobile();
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">Review Details</h3>
      <ul className="text-sm space-y-1">
        {details.date && (
          <li>
            <strong>Date:</strong> {format(details.date, 'PP')}
            {details.time && ` ${details.time}`}
          </li>
        )}
        {details.location && (
          <li>
            <strong>Location:</strong> {details.location}
          </li>
        )}
        {details.guests && (
          <li>
            <strong>Guests:</strong> {details.guests}
          </li>
        )}
        {details.venueType && (
          <li>
            <strong>Venue:</strong> {details.venueType}
          </li>
        )}
        {details.notes && (
          <li>
            <strong>Notes:</strong> {details.notes}
          </li>
        )}
      </ul>
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
      {isMobile && (
        <div className="flex space-x-2">
          <Button
            data-testid="review-save-button"
            variant="secondary"
            onClick={onSaveDraft}
            fullWidth
          >
            Save Draft
          </Button>
          <Button
            data-testid="review-submit-button"
            onClick={onSubmit}
            fullWidth
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  );
}
