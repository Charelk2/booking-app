'use client';
import clsx from 'clsx';
import { Button } from '../ui';

interface Props {
  step: number;
  steps: string[];
  onBack?: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

export default function WizardNav({
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
  submitting = false,
  submitLabel,
}: Props) {
  const lastStep = step === steps.length - 1;
  return (
    <div className="mt-8">
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        {onBack && step > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            className="order-3 w-full sm:order-1 sm:w-auto"
          >
            Back
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onSaveDraft}
          className="order-2 w-full sm:w-auto"
        >
          Save Draft
        </Button>
        <Button
          type="button"
          onClick={onNext}
          isLoading={submitting}
          className={clsx('order-1 w-full sm:order-3 sm:w-auto', submitting && 'opacity-75')}
        >
          {submitLabel || (lastStep ? 'Submit' : 'Next')}
        </Button>
      </div>
    </div>
  );
}
