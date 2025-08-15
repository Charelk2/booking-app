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
    <div className="sticky bottom-0 inset-x-0 z-40 mt-8 bg-white/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-t border-black/10">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          {onBack && step > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={onBack}
              className="order-3 sm:order-1 w-full sm:w-auto min-h-[44px] min-w-[44px] rounded-xl border border-black/20 bg-white text-black hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black"
            >
              Back
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={onSaveDraft}
            className="order-2 w-full sm:w-auto min-h-[44px] min-w-[44px] rounded-xl border border-black/15 bg-white text-black hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black"
          >
            Save Draft
          </Button>

          <Button
            type="button"
            onClick={onNext}
            isLoading={submitting}
            className={clsx(
              'order-1 sm:order-3 w-full sm:w-auto min-h-[44px] min-w-[44px] rounded-xl bg-black text-white hover:bg-black/90 focus-visible:ring-2 focus-visible:ring-black shadow-sm',
              submitting && 'opacity-80'
            )}
          >
            {submitLabel || (lastStep ? 'Submit' : 'Next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
