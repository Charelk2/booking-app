'use client';
// Final review step showing a summary of all selections.
import SummarySidebar from '../SummarySidebar';
import WizardNav from '../WizardNav';
import { useBooking } from '@/contexts/BookingContext';
import { useState, useEffect } from 'react';
import { calculateQuote, getService } from '@/lib/api';
import { geocodeAddress, calculateDistanceKm } from '@/lib/geo';
import { formatCurrency } from '@/lib/utils';

// Props interface: Now includes all CommonStepProps for WizardNav
interface Props {
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: (e?: React.BaseSyntheticEvent) => Promise<void>; // Corrected signature
  onNext: (e?: React.BaseSyntheticEvent) => Promise<void>; // Renamed from onSubmit, corrected signature
  submitting: boolean;
  submitLabel?: string; // Add if WizardNav uses this
  serviceId?: number;
  artistLocation?: string | null;
}

export default function ReviewStep({
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
  submitting,
  submitLabel,
  serviceId,
  artistLocation,
}: Props) {
  const { details } = useBooking();
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    async function fetchEstimate() {
      if (!serviceId || !artistLocation || !details.location) return;
      try {
        const [svcRes, artistPos, eventPos] = await Promise.all([
          getService(serviceId),
          geocodeAddress(artistLocation),
          geocodeAddress(details.location),
        ]);
        if (!artistPos || !eventPos) return;
        const distance = calculateDistanceKm(artistPos, eventPos);
        const quote = await calculateQuote({
          base_fee: Number(svcRes.data.price),
          distance_km: distance,
        });
        setPrice(Number(quote.data.total));
      } catch (err) {
        console.error('Failed to calculate quote', err);
      }
    }
    fetchEstimate();
  }, [serviceId, artistLocation, details.location]);

  // WizardNav is assumed to be a separate component that handles these buttons.
  // The structure below is a placeholder if WizardNav is a simple div or needs adjustment.
  // It should match the actual WizardNav's rendering.
  // NOTE: If your WizardNav component is the one provided in a previous turn,
  // it doesn't need to be defined here, just imported and used.
  // I'm assuming it's imported correctly.

  return (
    <div className="wizard-step-container space-y-4">
      <SummarySidebar />
      {price !== null && (
        <p className="font-medium">
          Estimated Price: {formatCurrency(price)}
        </p>
      )}
      <WizardNav
        step={step}
        steps={steps}
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onNext={onNext}
        submitting={submitting}
        submitLabel={submitLabel}
      />
    </div>
  );
}