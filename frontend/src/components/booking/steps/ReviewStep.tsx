'use client';

import React from 'react';
import { motion } from 'framer-motion';
import SummarySidebar from '../SummarySidebar';
import { formatCurrency } from '@/lib/utils';
import { TravelResult } from '@/lib/travel';
import { useBooking } from '@/contexts/BookingContext';
import { CollapsibleSection, Button, InfoPopover } from '@/components/ui';
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
  soundCost: number;
  soundMode?: string | null;
  soundModeOverridden?: boolean;
  selectedSupplierName?: string;
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
  soundCost,
  soundMode,
  soundModeOverridden,
  selectedSupplierName,
  open = true,
  onToggle = () => {},
}: ReviewStepProps) {
  useBooking(); // Ensure SummarySidebar has context

  // Coerce all cost inputs to numbers to prevent NaN in totals
  const baseFee = Number(baseServicePrice) || 0;
  const travelCost = Number(travelResult?.totalCost) || 0;
  const soundFee = Number(soundCost) || 0;

  const subtotalBeforeTaxes = baseFee + travelCost + soundFee;
  const estimatedTaxesFees = subtotalBeforeTaxes * 0.15; // Now explicitly 15% of subtotalBeforeTaxes

  // Calculate the estimated total based on the visible amounts
  const estimatedTotal = subtotalBeforeTaxes + estimatedTaxesFees;

  const isProcessing = submitting || isLoadingReviewData;


  const getTravelPopoverContent = () => {
    if (!travelResult)
      return (
        <>Travel cost calculated based on artist&rsquo;s location and event venue distance.</>
      );

    const { mode, breakdown } = travelResult;

    if (mode === 'fly' && breakdown.fly) {
      const fly = breakdown.fly;
      return (
        <>
          Travel Mode: ✈️ Fly
          <br />
          Flights ({fly.travellers}): {formatCurrency(fly.flightSubtotal)} (avg price)
          <br />
          Car Rental: {formatCurrency(fly.carRental)}
          <br />
          Fuel: {formatCurrency(fly.transferCost)}
        </>
      );
    }

    if (mode === 'drive' && breakdown.drive) {
      const drive = breakdown.drive;
      return (
        <>
          Travel Mode: 🚗 Drive
          <br />
          Drive Estimate: {formatCurrency(drive.estimate)}
        </>
      );
    }

    return null;
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
          One checkout: we place an authorization for your booking. The artist must accept to confirm your date.
          If sound is included, we’ll confirm a firm price with the top supplier (backups auto‑tried).
          Any difference from this estimate will be adjusted automatically.
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
            <span>Service Provider Base Fee</span>
            <span>{formatCurrency(baseServicePrice)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center">
              Travel
              <InfoPopover label="Travel cost details" className="ml-1.5">
                {getTravelPopoverContent()}
              </InfoPopover>
            </span>
            <span>{formatCurrency(travelResult?.totalCost || 0)}</span>
          </div>
          {soundCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center">
                Sound Equipment {selectedSupplierName ? `· ${selectedSupplierName}` : ''}
                <InfoPopover label="Sound equipment details" className="ml-1.5">
                  {soundMode === 'managed_by_artist'
                    ? 'Managed by the artist with a simple markup policy.'
                    : soundMode === 'provided_by_artist'
                      ? 'Provided by the artist directly; price is firm on acceptance.'
                      : soundMode === 'client_provided'
                        ? 'You will provide sound equipment; no supplier outreach required.'
                        : 'External provider estimate (drive‑only). A supplier will confirm a firm price.'}
                </InfoPopover>
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
          <Button
            variant="primary"
            fullWidth
            isLoading={isProcessing}
            disabled={reviewDataError !== null || travelResult === null}
            onClick={(e) => {
              trackEvent('booking_submit');
              void onNext(e);
            }}
          >
            {isProcessing
              ? submitLabel === 'Submit Request'
                ? 'Submitting...'
                : 'Loading...'
              : submitLabel}
          </Button>
          <p className="text-xs text-gray-500 mt-3">
            Artist must accept this request. Once accepted, your artist booking is confirmed. Sound is usually
            confirmed within a few hours; if the top pick declines we auto‑try backups. If all decline, you can
            choose another option or we’ll refund the sound portion immediately.
          </p>
        </div>
      </motion.div>
    </CollapsibleSection>
  );
}
