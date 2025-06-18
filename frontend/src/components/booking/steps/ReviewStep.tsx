'use client';
// Final review step showing a summary of all selections.
import SummarySidebar from '../SummarySidebar';
import { Button } from '../../ui';

interface Props {
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export default function ReviewStep({
  step,
  steps,
  onBack,
  onSaveDraft,
  onSubmit,
  submitting,
}: Props) {
  return (
    <div className="space-y-4">
      <SummarySidebar />
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <Button
            type="button"
            onClick={onBack}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Back
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            type="button"
            onClick={onSaveDraft}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            isLoading={submitting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
