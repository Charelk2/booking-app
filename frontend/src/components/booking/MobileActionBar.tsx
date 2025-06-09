import React from 'react';
import Button from '../ui/Button';
import useScrollDirection from '@/hooks/useScrollDirection';
import useKeyboardOffset from '@/hooks/useKeyboardOffset';

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
  const scrollDir = useScrollDirection();
  const keyboardOffset = useKeyboardOffset();
  const bottomClass = scrollDir === 'down' ? 'bottom-0' : 'bottom-14';
  const style = keyboardOffset > 0 ? { transform: `translateY(-${keyboardOffset}px)` } : undefined;
  return (
    <div
      className={`fixed ${bottomClass} left-0 right-0 md:hidden bg-white border-t p-2 pb-safe flex justify-between space-x-2 z-[70]`}
      style={style}
    >
      {showBack ? (
        <Button variant="secondary" onClick={onBack} fullWidth data-testid="mobile-back-button">
          Back
        </Button>
      ) : (
        <div className="flex-1" />
      )}
      {showNext ? (
        <Button onClick={onNext} fullWidth data-testid="mobile-next-button">
          Next
        </Button>
      ) : (
        <div className="flex flex-1 space-x-2">
          <Button variant="secondary" onClick={onSaveDraft} fullWidth data-testid="mobile-save-button">
            Save Draft
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
            fullWidth
            data-testid="mobile-submit-button"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  );
}
