import { useState } from 'react';
import { TravelResult } from '@/lib/travel';
import { formatCurrency } from '@/lib/utils';
import CollapsibleSection from '../ui/CollapsibleSection';

interface Props {
  result: TravelResult;
}

export default function TravelSummaryCard({ result }: Props) {
  const [open, setOpen] = useState(false);
  const { mode, totalCost, breakdown } = result;

  const fly = result.breakdown.fly;
  const drive = result.breakdown.drive;

  return (
    <CollapsibleSection
      title={
        <div className="flex flex-col">
          <span className="font-medium">
            {mode === 'fly' ? '✈️ Travel Mode: Fly' : '🚗 Travel Mode: Drive'}
          </span>
          <span className="font-medium">
            Estimated Cost: {formatCurrency(totalCost)}
          </span>
        </div>
      }
      open={open}
      onToggle={() => setOpen(!open)}
      className="border border-gray-200"
      testId="travel-summary"
    >
      {mode === 'fly' ? (
        <ul className="text-sm space-y-1">
          <li>
            Flights ({fly.travellers}): {formatCurrency(fly.flightSubtotal)}
          </li>
          <li>Car Rental: {formatCurrency(fly.carRental)}</li>
          <li>Transfers: {formatCurrency(fly.transferCost)}</li>
        </ul>
      ) : (
        <p className="text-sm">Drive Estimate: {formatCurrency(drive.estimate)}</p>
      )}
    </CollapsibleSection>
  );
}
