'use client';

import React from 'react';
import { motion } from 'framer-motion';
import SummarySidebar from '../SummarySidebar';
import { formatCurrency } from '@/lib/utils';
import { TravelResult } from '@/lib/travel';
import { useBooking } from '@/contexts/BookingContext';
import { CollapsibleSection } from '../../ui';
import { trackEvent } from '@/lib/analytics';

interface ReviewStepProps {
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: (e?: React.BaseSyntheticEvent) => Promise<void>;
  onNext: (e?: React.BaseSyntheticEvent) => Promise<void>;
  submitting: boolean;
  submitLabel?: string;
  serviceId?: number;
  artistLocation?: string | null;

  isLoadingReviewData: boolean;
  reviewDataError: string | null;
  calculatedPrice: number | null; // This prop will still be passed but its value for display will be overridden
  travelResult: TravelResult | null;
  baseServicePrice: number;
  open?: boolean;
  onToggle?: () => void;
}

export default function ReviewStep({
  isLoadingReviewData,
  reviewDataError,
  // calculatedPrice, // We will calculate this locally now
  travelResult,
  submitting,
  onNext,
  submitLabel = 'Submit Request',
  baseServicePrice,
  open = true,
  onToggle = () => {},
}: ReviewStepProps) {
  const { details } = useBooking();

  const soundCost = details.sound === 'yes' ? 250 : 0;

  const subtotalBeforeTaxes = baseServicePrice + (travelResult?.totalCost || 0) + soundCost;
  const estimatedTaxesFees = subtotalBeforeTaxes * 0.15; // Now explicitly 15% of subtotalBeforeTaxes

  // Calculate the estimated total based on the visible amounts
  const estimatedTotal = subtotalBeforeTaxes + estimatedTaxesFees;

  // Adjust disabled logic: if calculatedPrice is no longer API-dependent, remove its check
  // Keep checks for isLoadingReviewData, reviewDataError, and travelResult
  const isButtonDisabled = submitting || isLoadingReviewData || reviewDataError !== null || travelResult === null;


  const getTravelTooltipContent = () => {
    if (!travelResult) return "Travel cost calculated based on artist's location and event venue distance.";

    const { mode, breakdown } = travelResult;
    let content = `Travel Mode: ${mode === 'fly' ? '✈️ Fly' : '🚗 Drive'}<br/>`;

    if (mode === 'fly' && breakdown.fly) {
      const fly = breakdown.fly;
      content += `Flights (${fly.travellers}): ${formatCurrency(fly.flightSubtotal)} (avg price)<br/>`;
      content += `Car Rental: ${formatCurrency(fly.carRental)}<br/>`;
      content += `Fuel: ${formatCurrency(fly.transferCost)}`;
    } else if (mode === 'drive' && breakdown.drive) {
      const drive = breakdown.drive;
      content += `Drive Estimate: ${formatCurrency(drive.estimate)}`;
    }
    return content;
  };

  return (
    <CollapsibleSection title="Review" open={open} onToggle={onToggle} className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-200/80 max-w-2xl mx-auto"
      >
        <p className="text-sm text-gray-600 mb-6">
          This is an estimated cost. The artist will review your request and send a formal quote.
        </p>

        {isLoadingReviewData && (
          <div className="flex items-center justify-center p-4 bg-red-50 text-red-700 rounded-lg mb-4">
            <span className="animate-spin mr-2">⚙️</span> Calculating estimates...
          </div>
        )}

        {reviewDataError && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">
            <p className="font-medium">Error calculating estimates:</p>
            <p className="text-sm">{reviewDataError}</p>
            <p className="text-xs mt-2">Please ensure all location details are accurate.</p>
          </div>
        )}

        <div className="mb-6">
          <SummarySidebar />
        </div>

        <h5 className="font-bold text-lg mb-3 text-gray-800">Estimated Cost</h5>
        <div className="space-y-2 text-gray-700">
          <div className="flex justify-between items-center">
            <span>Artist Base Fee</span>
            <span>{formatCurrency(baseServicePrice)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center group">
              Travel
              <span className="has-tooltip relative ml-1.5">
                <span className="cursor-pointer text-black-600">ⓘ</span>
                <div
                  className="tooltip absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 text-center z-10 hidden group-hover:block"
                  dangerouslySetInnerHTML={{ __html: getTravelTooltipContent() }}
                ></div>
              </span>
            </span>
            <span>{formatCurrency(travelResult?.totalCost || 0)}</span>
          </div>
          {details.sound === 'yes' && (
            <div className="flex items-center justify-between">
              <span className="flex items-center group">
                Sound Equipment
                <span className="has-tooltip relative ml-1.5">
                  <span className="cursor-pointer text-black-600">ⓘ</span>
                  <div className="tooltip absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 text-center z-10 hidden group-hover:block">
                    Standard package for events up to 150 guests.
                  </div>
                </span>
              </span>
              <span>{formatCurrency(soundCost)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t pt-2 mt-2 border-dashed">
            <span className="font-medium">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotalBeforeTaxes)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Taxes & Fees (Est.)</span>
            <span>{formatCurrency(estimatedTaxesFees)}</span>
          </div>
          <div className="flex justify-between items-center text-xl font-bold text-gray-900 border-t pt-3 mt-3">
            <span>Estimated Total</span>
            <span>{formatCurrency(estimatedTotal)}</span> {/* Use locally calculated estimatedTotal */}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-start space-x-3 mb-6 group">
            <input type="checkbox" id="terms" className="mt-1 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500" />
            <label htmlFor="terms" className="text-sm text-gray-600">
              I have reviewed my details and agree to the{' '}
              <a href="#" className="text-red-600 hover:underline">
                terms of service
              </a>
              .
            </label>
          </div>
          <button
            onClick={(e) => {
              trackEvent('booking_submit');
              void onNext(e);
            }}
            disabled={isButtonDisabled}
            className={`w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              ${isButtonDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
          >
            {(submitting || isLoadingReviewData) ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
                {submitLabel === 'Submit Request' ? 'Submitting...' : 'Loading...'}
              </span>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </motion.div>
    </CollapsibleSection>
  );
}
