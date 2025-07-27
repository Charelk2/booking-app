'use client';
// Final review step showing a summary of all selections.
import SummarySidebar from '../SummarySidebar';
import WizardNav from '../WizardNav';

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
      <p className="text-sm text-gray-600">Please review your booking details before submitting your request.</p>
      <div className="space-y-6 p-4 border rounded-lg bg-white shadow-sm">
        <SummarySidebar />
      </div>
      <WizardNav
        step={step}
        steps={steps}
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onNext={onSubmit}
        submitting={submitting}
        submitLabel="Submit Request"
      />
    </div>
  );
}
