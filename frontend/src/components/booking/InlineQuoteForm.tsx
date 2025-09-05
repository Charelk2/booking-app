import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, addHours } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from './QuoteBubble';
import { calculateQuoteBreakdown } from '@/lib/api';

/**
 * InlineQuoteForm (v3)
 * ------------------------------------------------------------
 * Professional, compact, and globally-consistent quote composer
 * built for chat threads. Clean layout, fewer distractions,
 * and a narrow summary panel (≈ 1/3 on desktop).
 */

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

const VAT_RATE = 0.15; // South Africa default VAT; adjust upstream if needed

const expiryOptions = [
  { label: 'No expiry', value: '' },
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

// ——————————————————————————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————————————————————————

const toNumber = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
}: {
  value: number;
  onChange: (n: number) => void;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
}) {
  const [text, setText] = useState<string>(() => (value ? formatCurrency(value) : ''));
  const lastValueRef = useRef<number>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setText(value ? formatCurrency(value) : '');
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      id={id}
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`w-40 sm:w-44 md:w-48 text-right px-2 py-2 h-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/10 ${className}`}
      placeholder={placeholder ?? '0.00'}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const numeric = toNumber(raw);
        onChange(numeric);
      }}
      onBlur={() => setText(value ? formatCurrency(value) : '')}
    />
  );
}

const LineItemRow: React.FC<{
  item: ServiceItem & { key: string };
  onUpdate: (patch: Partial<ServiceItem>) => void;
  onRemove: () => void;
}> = ({ item, onUpdate, onRemove }) => {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
      <input
        type="text"
        className="w-full p-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        placeholder="Extra description (e.g. Extra hour)"
        value={item.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
      />
      <MoneyInput aria-label="Item price" value={item.price} onChange={(n) => onUpdate({ price: n })} />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove line item"
        className="rounded-lg border border-red-200 text-red-600 text-xs font-semibold px-2.5 py-1.5 hover:bg-red-50"
      >
        Remove
      </button>
    </div>
  );
};

const travelMode = (km?: number) => (km && km > 300 ? 'fly' : 'drive');

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
  onDecline,
  eventDetails,
  calculationParams,
}) => {
  // — State —
  const [serviceFee, setServiceFee] = useState<number>(initialBaseFee ?? 0);
  const [soundFee, setSoundFee] = useState<number>(initialSoundCost ?? (initialSoundNeeded ? 1000 : 0));
  const [travelFee, setTravelFee] = useState<number>(initialTravelCost ?? 0);
  const [accommodation, setAccommodation] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [expiresHours, setExpiresHours] = useState<number | ''>('');
  const [items, setItems] = useState<(ServiceItem & { key: string })[]>([]);
  const [loadingCalc, setLoadingCalc] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState<boolean>(true);

  const [quoteNumber] = useState<string>(generateQuoteNumber());
  const todayLabel = format(new Date(), 'PPP');
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    setSoundFee(initialSoundCost ?? (initialSoundNeeded ? 1000 : 0));
  }, [initialSoundCost, initialSoundNeeded]);

  // Prefill from backend calculator if provided
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!calculationParams) return;
      try {
        setLoadingCalc(true);
        const { data } = (await calculateQuoteBreakdown(calculationParams)) as { data: QuoteCalculationResponse };
        if (cancelled) return;
        if (initialBaseFee == null) setServiceFee(calculationParams.base_fee ?? data?.base_fee ?? 0);
        if (initialTravelCost == null) setTravelFee(Number(data?.travel_cost || 0));
        if (initialSoundCost == null && initialSoundNeeded == null) setSoundFee(Number(data?.sound_cost || 0));
      } catch {
        // soft-fail
      } finally {
        if (!cancelled) setLoadingCalc(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [calculationParams, initialBaseFee, initialTravelCost, initialSoundCost, initialSoundNeeded]);

  const suggestions = useMemo(
    () => [
      { label: 'Extra hour', price: 1000 },
      { label: 'Parking', price: 150 },
      { label: 'Backline rental', price: 2500 },
    ],
    []
  );

  const extrasTotal = useMemo(() => items.reduce((sum, it) => sum + Number(it.price || 0), 0), [items]);
  const subtotal = useMemo(() => serviceFee + soundFee + travelFee + extrasTotal, [serviceFee, soundFee, travelFee, extrasTotal]);
  const discounted = Math.max(0, subtotal - (discount || 0));
  const vat = discounted * VAT_RATE;
  const total = discounted + vat;

  const expiresPreview = useMemo(() => {
    if (!expiresHours) return 'No expiry';
    const dt = addHours(new Date(), Number(expiresHours));
    return `${format(dt, 'PPP p')}`;
  }, [expiresHours]);

  const addItem = (desc = '', price = 0) =>
    setItems((arr) => [
      ...arr,
      { key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, description: desc, price },
    ]);
  const updateItem = (key: string, patch: Partial<ServiceItem>) => setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key: string) => setItems((arr) => arr.filter((it) => it.key !== key));

  const mode = travelMode(calculationParams?.distance_km);
  const canSend = agree && serviceFee > 0 && !sending;

  async function handleSubmit() {
    try {
      setError(null);
      setSending(true);
      trackEvent?.('cta_send_quote', { bookingRequestId, artistId, clientId });

      const services: ServiceItem[] = [
        { description: serviceName ?? 'Service fee', price: serviceFee },
        ...items.map(({ key, ...rest }) => rest),
      ];

      const expires_at = expiresHours ? new Date(Date.now() + Number(expiresHours) * 3600000).toISOString() : null;

      await onSubmit({
        booking_request_id: bookingRequestId,
        service_provider_id: artistId,
        artist_id: artistId,
        client_id: clientId,
        services,
        sound_fee: soundFee,
        travel_fee: travelFee,
        accommodation: accommodation || null,
        discount: discount || null,
        expires_at,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not send quote. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-gray-200 bg-white/80 backdrop-blur p-4 sm:p-5 shadow-sm">
      {/* Layout: form left (2/3), summary right (1/3) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Composer */}
        <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h4 className="text-base font-semibold">Create Quote</h4>
            <div className="text-[12px] text-gray-600 font-medium">
              Quote <span className="font-semibold">{quoteNumber}</span> · <span className="font-semibold">{todayLabel}</span>
            </div>
          </div>

          {loadingCalc && (
            <div className="mb-3 text-xs text-gray-600 flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Loading cost suggestions…
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {/* Base Fee */}
            <div className="flex items-center justify-between py-3">
              <label htmlFor="base" className="text-sm font-medium text-gray-900 w-56">Base Fee</label>
              <MoneyInput id="base" aria-label="Base fee" value={serviceFee} onChange={setServiceFee} />
            </div>

            {/* Travel */}
            <div className="flex items-center justify-between py-3">
              <div className="text-sm font-medium text-gray-900 w-56">
                <div>Travel</div>
                {calculationParams?.distance_km != null && (
                  <div className="text-[11px] text-gray-500 font-normal">{Math.round(calculationParams.distance_km)} km · {mode}</div>
                )}
              </div>
              <MoneyInput aria-label="Travel fee" value={travelFee} onChange={setTravelFee} />
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between py-3">
              <label htmlFor="sound" className="text-sm font-medium text-gray-900 w-56">Sound Equipment</label>
              <MoneyInput id="sound" aria-label="Sound fee" value={soundFee} onChange={setSoundFee} />
            </div>

            {/* Extras */}
            <div className="py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Extras</span>
                <div className="flex gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => addItem(s.label, s.price)}
                      className="px-2 py-1 rounded-full text-[11px] font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
                    >
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50">
                  <div>Description</div>
                  <div className="text-right">Amount</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">No extras added.</div>
                  )}
                  {items.map((it) => (
                    <div key={it.key} className="px-3 py-2">
                      <LineItemRow item={it} onUpdate={(patch) => updateItem(it.key, patch)} onRemove={() => removeItem(it.key)} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="text-sm font-semibold text-gray-800 rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
                >
                  Add line item
                </button>
              </div>
            </div>

            {/* Discount */}
            <div className="flex items-center justify-between py-3">
              <label htmlFor="discount" className="text-sm font-medium text-gray-900 w-56">Discount</label>
              <MoneyInput id="discount" aria-label="Discount amount" value={discount} onChange={setDiscount} />
            </div>

            {/* Expiry */}
            <div className="flex items-center justify-between py-3">
              <label htmlFor="expires" className="text-sm font-medium text-gray-900 w-56">Expires</label>
              <div className="flex items-center gap-3">
                <select
                  id="expires"
                  className="h-10 rounded-lg border border-gray-300 px-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                  value={String(expiresHours)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExpiresHours(v ? Number(v) : '');
                  }}
                >
                  {expiryOptions.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                  ))}
                </select>
                <div className="text-xs text-gray-600 min-w-[8rem]">{expiresHours ? `Auto-expires: ${expiresPreview}` : 'No expiry'}</div>
              </div>
            </div>

            {/* Accommodation */}
            <div className="flex items-start justify-between py-3">
              <label htmlFor="accom" className="text-sm font-medium text-gray-900 w-56 pt-2">Accommodation</label>
              <textarea
                id="accom"
                rows={3}
                className="w-80 sm:w-96 p-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Optional (e.g. 1 night hotel stay)"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
              />
            </div>

            {/* Agreement */}
            <label className="flex items-start gap-2 text-xs text-gray-600 py-3">
              <input
                ref={firstFieldRef}
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black/30"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>I confirm these amounts are correct.</span>
            </label>
          </div>

          {/* Mobile actions */}
          <div className="mt-4 md:hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-600">You will send</div>
                <div className="text-lg font-bold" aria-live="polite">{formatCurrency(total)}</div>
              </div>
              <div className="flex items-center gap-2">
                {onDecline && (
                  <button type="button" onClick={onDecline} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50">Decline</button>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${canSend ? 'bg-black hover:bg-gray-900' : 'bg-gray-400 cursor-not-allowed'}`}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary (narrow) */}
        <aside className="md:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-4 md:sticky md:top-2">
            <h4 className="mb-3 text-sm font-semibold">Summary</h4>

            <div className="mb-3 grid gap-1 text-sm text-gray-800" aria-live="polite">
              <div className="flex items-center justify-between"><span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
              <div className="flex items-center justify-between"><span>Discount</span><span className="font-medium">{discount ? `− ${formatCurrency(discount)}` : formatCurrency(0)}</span></div>
              <div className="flex items-center justify-between"><span>VAT ({Math.round(VAT_RATE*100)}%)</span><span className="font-medium">{formatCurrency(vat)}</span></div>
              <div className="mt-2 border-t pt-2 flex items-center justify-between text-base font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              className={`w-full h-10 rounded-lg text-white text-sm font-semibold transition-colors ${canSend ? 'bg-black hover:bg-gray-900' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              {sending ? 'Sending…' : 'Send Quote'}
            </button>

            {onDecline && (
              <button
                type="button"
                onClick={onDecline}
                className="mt-2 w-full h-10 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50"
              >
                Decline Request
              </button>
            )}

            {/* Event snapshot */}
            <div className="mt-4 text-xs">
              <div className="flex items-center justify-between text-gray-600">
                <span className="font-medium">Quote</span>
                <span>{quoteNumber}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span className="font-medium">Date</span>
                <span>{todayLabel}</span>
              </div>
              <div className="mt-3 space-y-1 text-gray-700">
                {eventDetails?.event && <div>📌 {eventDetails.event}</div>}
                {eventDetails?.date && <div>📅 {eventDetails.date}</div>}
                {(eventDetails?.locationName || eventDetails?.locationAddress) && (
                  <div>📍 {eventDetails.locationName ? (eventDetails.locationAddress ? `${eventDetails.locationName} — ${eventDetails.locationAddress}` : eventDetails.locationName) : eventDetails.locationAddress}</div>
                )}
                {eventDetails?.guests && <div>👥 {eventDetails.guests} guests</div>}
                <div>🔊 Sound: {(initialSoundNeeded ?? (soundFee > 0)) ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Expiry hint */}
            <div className="mt-3 text-[11px] text-gray-500">{expiresHours ? `Auto-expires ${expiresPreview}` : 'No automatic expiry'}</div>

            {/* Error */}
            {error && (
              <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
            )}
          </div>
        </aside>
      </div>

      {/* Spacer to avoid overlap with chat composer */}
      <div className="h-6" aria-hidden="true" />
    </section>
  );
};

export default InlineQuoteForm;
