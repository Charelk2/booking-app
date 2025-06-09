import React from 'react';
import Button from '../ui/Button';

interface Props {
  showBack: boolean;
  onBack: () => void;
  showNext: boolean;
  onNext: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export default function MobileActionBar({
  showBack,
  onBack,
  showNext,
  onNext,
  onSaveDraft,
  onSubmit,
  submitting,
}: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t p-2 flex justify-between space-x-2 z-[60]">
      {showBack ? (
        <Button variant="secondary" onClick={onBack} fullWidth>
          Back
        </Button>
      ) : (
        <div className="flex-1" />
      )}
      {showNext ? (
        <Button onClick={onNext} fullWidth>
          Next
        </Button>
      ) : (
        <div className="flex flex-1 space-x-2">
          <Button variant="secondary" onClick={onSaveDraft} fullWidth>
            Save Draft
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
            fullWidth
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  );
}
