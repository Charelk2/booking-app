'use client';
// Final review step showing a summary of all selections.
import SummarySidebar from '../SummarySidebar';

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
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Back
          </button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
