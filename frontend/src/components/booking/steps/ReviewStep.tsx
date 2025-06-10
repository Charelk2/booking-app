'use client';
// Final review step showing a summary of all selections.
import SummarySidebar from '../SummarySidebar';

export default function ReviewStep() {
  return (
    <div className="space-y-4">
      <SummarySidebar />
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
    </div>
  );
}
