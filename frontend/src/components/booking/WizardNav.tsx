'use client';
import clsx from 'clsx';

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
    <div className="flex justify-between mt-8 gap-2">
      {onBack && step > 0 && (
        <button
          type="button"
          onClick={onBack}
          className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          Back
        </button>
      )}
      <div className="flex gap-2 ml-auto">
        <button
          type="button"
          onClick={onSaveDraft}
          className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          Save Draft
        </button>
        <button
          type="button"
          disabled={submitting}
          aria-busy={submitting}
          onClick={onNext}
          className={clsx(
            'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-6 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
            submitting && 'opacity-75',
          )}
        >
          {submitLabel || (lastStep ? 'Submit' : 'Next')}
        </button>
      </div>
    </div>
  );
}
