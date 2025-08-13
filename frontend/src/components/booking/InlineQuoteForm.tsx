import React, { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from './QuoteBubble';
import { calculateQuoteBreakdown } from '@/lib/api';

interface Props {
  onSubmit: (data: QuoteV2Create) => Promise<void> | void;
  artistId: number;
  clientId: number;
  bookingRequestId: number;
  serviceName?: string;
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean;
  initialSoundCost?: number;
  drivingSoundCost?: number;
  flyingSoundCost?: number;
  onDecline?: () => void;
  eventDetails?: EventDetails;
  calculationParams?: {
    base_fee: number;
    distance_km: number;
    service_id: number;
    event_city: string;
    accommodation_cost?: number;
  };
}

const expiryOptions = [
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

const InlineQuoteForm: React.FC<Props> = ({
  onSubmit,
  artistId,
  clientId,
  bookingRequestId,
  serviceName,
  initialBaseFee,
  initialTravelCost,
  initialSoundNeeded,
  initialSoundCost,
  drivingSoundCost,
  flyingSoundCost,
  onDecline,
  eventDetails,
  calculationParams,
}) => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceFee, setServiceFee] = useState(initialBaseFee ?? 0);
  const [soundFee, setSoundFee] = useState(
    initialSoundCost ?? (initialSoundNeeded ? 1000 : 0),
  );
  const [travelFee, setTravelFee] = useState(initialTravelCost ?? 0);
  const [accommodation, setAccommodation] = useState('');
  const [discount, setDiscount] = useState(0);
  const [expiresHours, setExpiresHours] = useState<number | null>(null);
  const [quoteNumber] = useState(generateQuoteNumber());

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const currentDate = format(new Date(), 'PPP');

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    setSoundFee(initialSoundCost ?? (initialSoundNeeded ? 1000 : 0));
  }, [initialSoundCost, initialSoundNeeded]);

  // Prefill using backend quote calculator when params provided
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (!calculationParams) return;
        const { data } = await calculateQuoteBreakdown(calculationParams);
        if (cancelled) return;
        setServiceFee(calculationParams.base_fee);
        setTravelFee(Number(data.travel_cost || 0));
        setSoundFee(Number(data.sound_cost || 0));
      } catch (e) {
        // Non-fatal; leave defaults
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [calculationParams]);

  const { subtotal, taxesFees, estimatedTotal } = useMemo(() => {
    const calcSubtotal =
      serviceFee + services.reduce((acc, s) => acc + Number(s.price), 0) + soundFee + travelFee;
    const subtotalAfterDiscount = calcSubtotal - (discount || 0);
    const calcTaxesFees = subtotalAfterDiscount * 0.15;
    const calcEstimatedTotal = subtotalAfterDiscount + calcTaxesFees;
    return {
      subtotal: calcSubtotal,
      taxesFees: calcTaxesFees,
      estimatedTotal: calcEstimatedTotal,
    };
  }, [services, serviceFee, soundFee, travelFee, discount]);

  const soundTooltipText = useMemo(() => {
    if (typeof drivingSoundCost === 'number' || typeof flyingSoundCost === 'number') {
      const drive = formatCurrency(drivingSoundCost ?? 0);
      const fly = formatCurrency(flyingSoundCost ?? 0);
      return `drive mode: ${drive} (price when driving), flight mode: ${fly} (price when flying)`;
    }
    return 'Sound equipment cost varies with travel mode';
  }, [drivingSoundCost, flyingSoundCost]);

  const addService = () => setServices([...services, { description: '', price: 0 }]);
  const removeService = (idx: number) => setServices(services.filter((_, i) => i !== idx));
  const updateService = (idx: number, field: keyof ServiceItem, value: string) => {
    const updated = services.map((s, i) =>
      i === idx ? { ...s, [field]: field === 'price' ? Number(value) : value } : s,
    );
    setServices(updated);
  };

  const handleSubmit = async () => {
    trackEvent('cta_send_quote', {
      bookingRequestId,
      artistId,
      clientId,
    });
    const expires_at = expiresHours
      ? new Date(Date.now() + expiresHours * 3600000).toISOString()
      : null;
    await onSubmit({
      booking_request_id: bookingRequestId,
      artist_id: artistId,
      client_id: clientId,
      services: [
        { description: serviceName ?? 'Service fee', price: serviceFee },
        ...services,
      ],
      sound_fee: soundFee,
      travel_fee: travelFee,
      accommodation: accommodation || null,
      discount: discount || null,
      expires_at,
    });
  };

  return (
    <div className="w-full bg-brand/10 dark:bg-brand-dark/30 rounded-xl p-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">New Booking Request</h4>
          <p className="mb-2 text-xs">
            From: {eventDetails?.from ?? 'N/A'} | Received: {eventDetails?.receivedAt ?? 'N/A'}
          </p>
          <div className="text-xs">
            <p className="mb-1 font-semibold">Event Details</p>
            <ul className="space-y-1">
              {eventDetails?.event && <li>Event: {eventDetails.event}</li>}
              {eventDetails?.date && <li>Date: {eventDetails.date}</li>}
              {eventDetails?.guests && <li>Guests: {eventDetails.guests}</li>}
              {eventDetails?.venue && <li>Venue: {eventDetails.venue}</li>}
              {eventDetails?.notes && <li>Notes: &quot;{eventDetails.notes}&quot;</li>}
            </ul>
          </div>
        </div>

        <div className="flex flex-col text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h4 className="text-sm font-semibold">Review &amp; Adjust Quote</h4>
          </div>
          <div className="mb-4 text-xs font-medium opacity-90">
            <span>Quote No: {quoteNumber}</span>
            <span className="ml-4">Date: {currentDate}</span>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Estimated Cost</h3>
            <div className="space-y-1 text-gray-700">
              <div className="flex justify-between items-center py-1">
                <span className="font-medium">Service Provider Base Fee</span>
                <input
                  ref={firstFieldRef}
                  type="number"
                  inputMode="numeric"
                  className="w-28 text-right p-1 rounded border border-gray-300"
                  placeholder="0.00"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(Number(e.target.value))}
                />
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="flex items-center group font-medium">
                  Travel
                  <span className="has-tooltip relative ml-1.5 text-blue-500 cursor-pointer">
                    ⓘ
                    <div className="tooltip absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 text-center z-10 hidden group-hover:block">
                      Calculated based on artist&apos;s location and event venue distance.
                    </div>
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-28 text-right p-1 rounded border border-gray-300"
                  placeholder="0.00"
                  value={travelFee}
                  onChange={(e) => setTravelFee(Number(e.target.value))}
                />
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="flex items-center group font-medium">
                  Sound Equipment
                  <span className="has-tooltip relative ml-1.5 text-blue-500 cursor-pointer">
                    ⓘ
                    <div className="tooltip absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 text-center z-10 hidden group-hover:block">
                      {soundTooltipText}
                    </div>
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-28 text-right p-1 rounded border border-gray-300"
                  placeholder="0.00"
                  value={soundFee}
                  onChange={(e) => setSoundFee(Number(e.target.value))}
                />
              </div>

          {services.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1 gap-2">
              <input
                type="text"
                className="flex-1 p-1 rounded border border-gray-300 text-xs"
                placeholder="Custom Item Description"
                value={s.description}
                onChange={(e) => updateService(i, 'description', e.target.value)}
              />
              <input
                type="number"
                className="w-28 p-1 text-right rounded border border-gray-300 text-xs"
                inputMode="numeric"
                placeholder="0.00"
                value={s.price}
                onChange={(e) => updateService(i, 'price', e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeService(i)}
                aria-label="Remove item"
                className="text-red-500 hover:text-red-700 transition-colors text-lg font-bold ml-1"
              >
                &times;
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addService}
            className="w-full bg-gray-100 text-gray-700 font-semibold py-1 px-2 rounded-lg hover:bg-gray-200 transition-colors mt-1 text-xs"
          >
            + Add Custom Item
          </button>

          <div className="flex justify-between items-center py-1">
            <span className="font-medium">Discount (optional)</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-28 text-right p-1 rounded border border-gray-300"
              placeholder="0.00"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </div>

          <hr className="border-t border-gray-300 pt-2 mt-2 border-dashed" />
          <div className="flex justify-between font-medium">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Taxes & Fees (Est.)</span>
            <span>{formatCurrency(taxesFees)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-gray-900 border-t pt-3 mt-3">
            <span>Estimated Total</span>
            <span>{formatCurrency(estimatedTotal)}</span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="font-medium">Expires in:</span>
            <select
              id="expires-hours"
              className="w-32 p-1 rounded border border-gray-300 text-xs"
              value={expiresHours ?? ''}
              onChange={(e) => setExpiresHours(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No expiry</option>
              {expiryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col py-1">
            <span className="font-medium mb-1">Accommodation (optional)</span>
            <textarea
              className="w-full p-1 border border-gray-300 rounded-lg text-xs"
              placeholder="E.g., '1 night hotel stay: $150'"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="terms"
            className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="terms" className="text-xs text-gray-600">
            I have reviewed the quote and agree to the{' '}
            <a href="#" className="text-blue-600 hover:underline">
              terms of service
            </a>
            .
          </label>
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
          {onDecline && (
            <button
              type="button"
              onClick={onDecline}
              className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              Decline Request
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            title="This quote will be sent to the client"
            className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Send Quote
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
  );
};

export default InlineQuoteForm;
