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
      <SummarySidebar />
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
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
