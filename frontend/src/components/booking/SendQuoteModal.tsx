import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import Button from '../ui/Button';
import { ServiceItem, QuoteV2Create, QuoteTemplate } from '@/types';
import { getQuoteTemplates } from '@/lib/api';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: QuoteV2Create) => Promise<void> | void;
  artistId: number;
  clientId: number;
  bookingRequestId: number;
  serviceName?: string;
  // New props for initial quote data
  initialBaseFee?: number;
  initialTravelCost?: number;
  initialSoundNeeded?: boolean; // New prop
}

const expiryOptions = [
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

const SendQuoteModal: React.FC<Props> = ({
  open,
  onClose,
  onSubmit,
  artistId,
  clientId,
  bookingRequestId,
  serviceName,
  initialBaseFee,
  initialTravelCost,
  initialSoundNeeded, // Destructure new prop
}) => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceFee, setServiceFee] = useState(0);
  const [soundFee, setSoundFee] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [accommodation, setAccommodation] = useState('');
  const [discount, setDiscount] = useState(0);
  const [expiresHours, setExpiresHours] = useState<number | null>(null);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | ''>('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [description, setDescription] = useState('');

  const currentDate = format(new Date(), 'PPP');

  // Ref to track if we already applied the initial values so we don't
  // clobber user edits when props update
  const hasPrefilled = useRef(false);

  useEffect(() => {
    if (!open) {
      // reset when modal closes so next open can prefill again
      hasPrefilled.current = false;
      setSelectedTemplate('');
      return;
    }

    // fetch templates and generate quote number each time the modal opens
    getQuoteTemplates(artistId)
      .then((res) => setTemplates(res.data))
      .catch(() => setTemplates([]));
    setQuoteNumber(generateQuoteNumber());

    if (selectedTemplate === '') {
      // always clear optional fields when no template is selected
      setServices([]);
      setAccommodation('');
      setDiscount(0);
      setExpiresHours(null);
      setDescription('');

      // apply initial props once when they become available
      if (!hasPrefilled.current &&
          (typeof initialBaseFee === 'number' ||
            typeof initialTravelCost === 'number' ||
            typeof initialSoundNeeded === 'boolean')) {
        setServiceFee(typeof initialBaseFee === 'number' ? initialBaseFee : 0);
        setTravelFee(typeof initialTravelCost === 'number' ? initialTravelCost : 0);
        setSoundFee(initialSoundNeeded ? 250 : 0);
        hasPrefilled.current = true;
      }
    }
  }, [open, selectedTemplate, artistId, initialBaseFee, initialTravelCost, initialSoundNeeded]);

  useEffect(() => {
    const tmpl = templates.find((t) => t.id === selectedTemplate);
    if (tmpl) {
      // Apply template values
      setServiceFee(Number(tmpl.services[0]?.price || 0));
      setServices(tmpl.services.slice(1));
      setSoundFee(tmpl.sound_fee);
      setTravelFee(tmpl.travel_fee);
      setAccommodation(tmpl.accommodation || '');
      setDiscount(tmpl.discount || 0);
    } else if (selectedTemplate === '') {
      // If "Choose template" is selected (or no template was initially chosen),
      // revert to initial props or default to 0/empty
      setServiceFee(typeof initialBaseFee === 'number' ? initialBaseFee : 0);
      setTravelFee(typeof initialTravelCost === 'number' ? initialTravelCost : 0);
      setSoundFee(initialSoundNeeded ? 250 : 0); // Revert soundFee based on initialSoundNeeded
      setAccommodation('');
      setDiscount(0);
      setServices([]);
    }
  }, [selectedTemplate, templates, initialBaseFee, initialTravelCost, initialSoundNeeded]); // Added initialSoundNeeded to dependencies

  const subtotal =
    serviceFee + services.reduce((acc, s) => acc + Number(s.price), 0) + soundFee + travelFee;
  const subtotalAfterDiscount = subtotal - (discount || 0);
  const taxesFees = subtotalAfterDiscount * 0.15;
  const estimatedTotal = subtotalAfterDiscount + taxesFees;

  const addService = () => setServices([...services, { description: '', price: 0 }]);
  const removeService = (idx: number) =>
    setServices(services.filter((_, i) => i !== idx));
  const updateService = (idx: number, field: keyof ServiceItem, value: string) => {
    const updated = services.map((s, i) => (i === idx ? { ...s, [field]: field === 'price' ? Number(value) : value } : s));
    setServices(updated);
  };

  const handleSubmit = async () => {
    const expires_at = expiresHours ? new Date(Date.now() + expiresHours * 3600000).toISOString() : null;
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">View Quote</h2>
          {templates.length > 0 && (
            <select
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              value={selectedTemplate}
              onChange={(e) =>
                setSelectedTemplate(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">Choose template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
          <div className="flex flex-col gap-y-2 mb-2 text-sm text-gray-600">
            <div><span className="font-medium">Quote No:</span> {quoteNumber}</div>
            <div><span className="font-medium">Date:</span> {currentDate}</div>
            <input
              type="text"
              className="border border-gray-300 rounded-md p-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Quote Description (e.g., 'Wedding Performance')"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label htmlFor="service-fee" className="flex items-center gap-2 text-sm font-normal border border-gray-200 rounded-lg p-3 bg-gray-50">
              <span className="flex-1 font-medium text-gray-700">{serviceName ?? 'Service'} fee</span>
              <input
                id="service-fee"
                type="number"
                inputMode="numeric"
                className="w-28 border border-gray-300 rounded-md p-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
                value={serviceFee}
                onChange={(e) => setServiceFee(Number(e.target.value))}
              />
            </label>
            <label htmlFor="sound-fee" className="flex items-center gap-2 text-sm font-normal border border-gray-200 rounded-lg p-3 bg-gray-50">
              <span className="flex-1 font-medium text-gray-700">Sound fee</span>
              <input
                id="sound-fee"
                type="number"
                inputMode="numeric"
                className="w-28 border border-gray-300 rounded-md p-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
                value={soundFee}
                onChange={(e) => setSoundFee(Number(e.target.value))}
              />
            </label>
            <label htmlFor="travel-fee" className="flex items-center gap-2 text-sm font-normal border border-gray-200 rounded-lg p-3 bg-gray-50">
              <span className="flex-1 font-medium text-gray-700">Travel fee</span>
              <input
                id="travel-fee"
                type="number"
                inputMode="numeric"
                className="w-28 border border-gray-300 rounded-md p-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
                value={travelFee}
                onChange={(e) => setTravelFee(Number(e.target.value))}
              />
            </label>
          </div>

          {services.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm font-normal border border-gray-200 rounded-lg p-3 bg-gray-50">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Item Description"
                value={s.description}
                onChange={(e) => updateService(i, 'description', e.target.value)}
              />
              <input
                type="number"
                className="w-28 border border-gray-300 rounded-md p-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                inputMode="numeric"
                placeholder="0.00"
                value={s.price}
                onChange={(e) => updateService(i, 'price', e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeService(i)}
                aria-label="Remove item"
                className="text-red-500 hover:text-red-700 transition-colors text-lg font-bold"
              >
                &times;
              </button>
            </div>
          ))}
          <Button type="button" onClick={addService} className="text-sm w-full py-2.5" variant="secondary">
            + Add Custom Item
          </Button>

          <label htmlFor="accommodation" className="flex flex-col text-sm font-normal mt-4">
            <span className="font-medium text-gray-700 mb-1">Accommodation (optional)</span>
            <textarea
              id="accommodation"
              className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="E.g., '1 night hotel stay: $150'"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
              rows={2}
            />
          </label>
          <label htmlFor="discount" className="flex items-center gap-2 text-sm font-normal mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
            <span className="flex-1 font-medium text-gray-700">Discount (optional)</span>
            <input
              id="discount"
              type="number"
              inputMode="numeric"
              className="w-28 border border-gray-300 rounded-md p-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0.00"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          <label htmlFor="expires-hours" className="flex flex-col text-sm font-normal mt-4">
            <span className="font-medium text-gray-700 mb-1">Expires in</span>
            <select
              id="expires-hours"
              className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          </label>
          <hr className="border-t border-gray-200 my-4" />
          <h5 className="font-bold text-lg mb-3 text-gray-800">Estimated Cost</h5>
          <div className="space-y-2 text-gray-700">
            <div className="flex justify-between items-center">
              <span>Artist Base Fee</span>
              <span>{formatCurrency(serviceFee)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center group">
                Travel
                <span className="has-tooltip relative ml-1.5">
                  <span className="cursor-pointer text-black-600">ⓘ</span>
                  <div className="tooltip absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded-md p-2 text-center z-10 hidden group-hover:block">
                    Travel costs you set for this quote.
                  </div>
                </span>
              </span>
              <span>{formatCurrency(travelFee)}</span>
            </div>
            {soundFee !== 0 && (
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
                <span>{formatCurrency(soundFee)}</span>
              </div>
            )}
            {discount !== 0 && (
              <div className="flex justify-between items-center">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t pt-2 mt-2 border-dashed">
              <span className="font-medium">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotalAfterDiscount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Taxes & Fees (Est.)</span>
              <span>{formatCurrency(taxesFees)}</span>
            </div>
            <div className="flex justify-between items-center text-xl font-bold text-gray-900 border-t pt-3 mt-3">
              <span>Estimated Total</span>
              <span>{formatCurrency(estimatedTotal)}</span>
            </div>
          </div>
          <div className="flex items-start space-x-3 mt-6">
            <input type="checkbox" id="terms" className="mt-1 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500" />
            <label htmlFor="terms" className="text-sm text-gray-600">
              I have reviewed my details and agree to the{' '}
              <a href="#" className="text-red-600 hover:underline">
                terms of service
              </a>
              .
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1 py-2.5 rounded-full border-gray-300 text-gray-700 hover:bg-gray-100">
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} title="This quote will be sent to the client" className="flex-1 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            Submit Request
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SendQuoteModal;