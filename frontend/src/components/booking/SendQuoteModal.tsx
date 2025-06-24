import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (open) {
      getQuoteTemplates(artistId)
        .then((res) => setTemplates(res.data))
        .catch(() => setTemplates([]));
      setQuoteNumber(generateQuoteNumber());
    }
  }, [open, artistId]);

  useEffect(() => {
    const tmpl = templates.find((t) => t.id === selectedTemplate);
    if (tmpl) {
      if (tmpl.services.length > 0) {
        setServiceFee(Number(tmpl.services[0].price));
        setServices(tmpl.services.slice(1));
      } else {
        setServiceFee(0);
        setServices([]);
      }
      setSoundFee(tmpl.sound_fee);
      setTravelFee(tmpl.travel_fee);
      setAccommodation(tmpl.accommodation || '');
      setDiscount(tmpl.discount || 0);
    }
  }, [selectedTemplate, templates]);

  const subtotal =
    serviceFee + services.reduce((acc, s) => acc + Number(s.price), 0) + soundFee + travelFee;
  const total = subtotal - (discount || 0);

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium">Send Quote</h2>
          {templates.length > 0 && (
            <select
              className="border rounded px-2 py-1 text-sm"
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
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="flex flex-col gap-y-2 mb-2 text-sm">
            <div>{quoteNumber}</div>
            <div>{currentDate}</div>
            <input
              type="text"
              className="border rounded p-1"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {services.map((s, i) => (
            <div key={i} className="flex gap-2 items-center mb-2">
              <input
                type="text"
                className="flex-1 border rounded p-1"
                placeholder="Description"
                value={s.description}
                onChange={(e) => updateService(i, 'description', e.target.value)}
              />
              <input
                type="number"
                className="w-24 border rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-brand"
                inputMode="numeric"
                placeholder="Enter amount"
                value={s.price}
                onChange={(e) => updateService(i, 'price', e.target.value)}
              />
              {services.length > 1 && (
                <button type="button" onClick={() => removeService(i)} aria-label="Remove item" className="text-red-600">
                  ×
                </button>
              )}
            </div>
          ))}
          <label htmlFor="service-fee" className="flex items-center gap-2 text-sm font-normal mb-2">
            <span className="flex-1">{serviceName ?? 'Service'} fee</span>
            <input
              id="service-fee"
              type="number"
              inputMode="numeric"
              className="w-24 border rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Enter amount"
              value={serviceFee}
              onChange={(e) => setServiceFee(Number(e.target.value))}
            />
          </label>
          <label htmlFor="sound-fee" className="flex items-center gap-2 text-sm font-normal mb-2">
            <span className="flex-1">Sound fee</span>
            <input
              id="sound-fee"
              type="number"
              inputMode="numeric"
              className="w-24 border rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Enter amount"
              value={soundFee}
              onChange={(e) => setSoundFee(Number(e.target.value))}
            />
          </label>
          <label htmlFor="travel-fee" className="flex items-center gap-2 text-sm font-normal mb-2">
            <span className="flex-1">Travel fee</span>
            <input
              id="travel-fee"
              type="number"
              inputMode="numeric"
              className="w-24 border rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Enter amount"
              value={travelFee}
              onChange={(e) => setTravelFee(Number(e.target.value))}
            />
          </label>
          <Button type="button" onClick={addService} className="text-sm" variant="secondary">
            Add Item
          </Button>
          <label htmlFor="accommodation" className="flex flex-col text-sm font-normal">
            Accommodation (optional)
            <textarea
              id="accommodation"
              className="w-full border rounded p-1 focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Optional: e.g. 500"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
            />
          </label>
          <label htmlFor="discount" className="flex items-center gap-2 text-sm font-normal mb-2">
            <span className="flex-1">Discount (optional)</span>
            <input
              id="discount"
              type="number"
              inputMode="numeric"
              className="w-24 border rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Optional: e.g. 500"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          <label htmlFor="expires-hours" className="flex flex-col text-sm font-normal">
            Expires in
            <select
              id="expires-hours"
              className="w-full border rounded p-1 focus:outline-none focus:ring-2 focus:ring-brand"
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
          <hr className="border-t my-2" />
          <div className="text-sm">
            <span className="text-gray-500">Subtotal: {formatCurrency(subtotal)}</span>
            <br />
            <span className="font-medium">
              Total (after discount): {formatCurrency(total)}
            </span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} title="This quote will be sent to the client">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SendQuoteModal;
