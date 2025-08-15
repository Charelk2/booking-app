import { useState } from 'react';
import { TravelResult } from '@/lib/travel';
import { formatCurrency } from '@/lib/utils';
import CollapsibleSection from '../ui/CollapsibleSection';

interface Props {
  result: TravelResult;
}

export default function TravelSummaryCard({ result }: Props) {
  const [open, setOpen] = useState(false);
  const { mode, totalCost } = result;
  const fly = result.breakdown.fly;
  const drive = result.breakdown.drive;

  return (
    <CollapsibleSection
      title={
        <div className="flex flex-col">
          <span className="font-medium text-neutral-900">
            {mode === 'fly' ? '✈️ Travel Mode: Fly' : '🚗 Travel Mode: Drive'}
          </span>
          <span className="font-medium text-neutral-900">
            Estimated Cost: {formatCurrency(totalCost)}
          </span>
        </div>
      }
      open={open}
      onToggle={() => setOpen(!open)}
      className="border border-black/10 rounded-2xl bg-white p-4"
      testId="travel-summary"
    >
      {mode === 'fly' ? (
        <ul className="text-sm space-y-1 text-neutral-700">
          <li>
            Flights ({fly.travellers}): {formatCurrency(fly.flightSubtotal)}{' '}
            <span className="text-xs text-neutral-500">(avg price)</span>
          </li>
          <li>Car Rental: {formatCurrency(fly.carRental)}</li>
          <li>Fuel: {formatCurrency(fly.transferCost)}</li>
        </ul>
      ) : (
        <p className="text-sm text-neutral-700">Drive Estimate: {formatCurrency(drive.estimate)}</p>
      )}
    </CollapsibleSection>
  );
}
