import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, addHours } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from './QuoteBubble';
import { calculateQuoteBreakdown } from '@/lib/api';

/**
 * InlineQuoteForm (v2)
 * ------------------------------------------------------------
 * A compact, chat-friendly quote composer designed for use inside
 * a message thread. Optimized for speed, clarity, and touch usage.
 *
 * Highlights
 * - Smart defaults from calculateQuoteBreakdown (optional)
 * - Currency-safe inputs with instant totals
 * - Quick-add line items & sound presets (None / Basic PA / Full PA)
 * - Expiry chips with human-readable preview
 * - Sticky action bar with Estimated Total + Send/Decline
 * - Accessible: keyboard & screen-reader friendly
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

const expiryOptions = [
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

// ——————————————————————————————————————————————————————————————
// Small helpers
// ——————————————————————————————————————————————————————————————

const toNumber = (v: string | number) => {
  if (typeof v === 'number') return v;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function CurrencyInput({
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

  useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setText(value ? formatCurrency(value) : '');
    }
  }, [value]);

  return (
    <input
      id={id}
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`w-32 text-right p-1 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/10 ${className}`}
      placeholder={placeholder ?? '0.00'}
      value={text}
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

const QuickChip: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors select-none hover:bg-gray-50 ${
      active ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-300'
    }`}
  >
    {label}
  </button>
);

const LineItemRow: React.FC<{
  item: ServiceItem & { key: string };
  onUpdate: (patch: Partial<ServiceItem>) => void;
  onRemove: () => void;
}> = ({ item, onUpdate, onRemove }) => {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
      <input
        type="text"
        className="w-full p-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        placeholder="Custom item (e.g., Extra hour)"
        value={item.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
      />
      <CurrencyInput
        aria-label="Item price"
        value={item.price}
        onChange={(n) => onUpdate({ price: n })}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove line item"
        className="rounded-lg border border-red-200 text-red-600 text-xs font-semibold px-2 py-1 hover:bg-red-50"
      >
        Remove
      </button>
    </div>
  );
};

// Drive vs fly heuristic (simple, local-only)
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
  const [soundFee, setSoundFee] = useState<number>(
    initialSoundCost ?? (initialSoundNeeded ? 1000 : 0)
  );
  const [travelFee, setTravelFee] = useState<number>(initialTravelCost ?? 0);
  const [accommodation, setAccommodation] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [expiresHours, setExpiresHours] = useState<number | null>(null);
  const [items, setItems] = useState<(ServiceItem & { key: string })[]>([]);
  const [loadingCalc, setLoadingCalc] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [agree, setAgree] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        const { data } = (await calculateQuoteBreakdown(
          calculationParams
        )) as { data: QuoteCalculationResponse };
        if (cancelled) return;
        // Only fill from calculator when BookingWizard did not supply values
        if (initialBaseFee == null) {
          const computedBase = calculationParams.base_fee ?? data?.base_fee ?? 0;
          setServiceFee(computedBase);
        }
        if (initialTravelCost == null) {
          setTravelFee(Number(data?.travel_cost || 0));
        }
        if (initialSoundCost == null && initialSoundNeeded == null) {
          setSoundFee(Number(data?.sound_cost || 0));
        }
      } catch (e) {
        // soft-fail: keep manual values
      } finally {
        if (!cancelled) setLoadingCalc(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [calculationParams, initialBaseFee, initialTravelCost, initialSoundCost, initialSoundNeeded]);

  // Quick-add suggestions (local-only)
  const suggestions = useMemo(
    () => [
      { label: 'Extra hour', price: 1000 },
      { label: 'Parking', price: 150 },
      { label: 'Backline rental', price: 2500 },
    ],
    []
  );

  const calcSubtotal = useMemo(() => {
    const extrasTotal = items.reduce((sum, it) => sum + Number(it.price || 0), 0);
    return serviceFee + soundFee + travelFee + extrasTotal;
  }, [items, serviceFee, soundFee, travelFee]);

  const subtotalAfterDiscount = Math.max(0, calcSubtotal - (discount || 0));
  const vat = subtotalAfterDiscount * 0.15; // SA VAT 15%
  const estimatedTotal = subtotalAfterDiscount + vat;

  const expiresPreview = useMemo(() => {
    if (!expiresHours) return 'No expiry';
    const dt = addHours(new Date(), expiresHours);
    return `${format(dt, 'PPP p')}`;
  }, [expiresHours]);

  const addItem = (desc = '', price = 0) =>
    setItems((arr) => [
      ...arr,
      { key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, description: desc, price },
    ]);

  const updateItem = (key: string, patch: Partial<ServiceItem>) =>
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const removeItem = (key: string) => setItems((arr) => arr.filter((it) => it.key !== key));

  const mode = travelMode(calculationParams?.distance_km);

  const canSend = agree && serviceFee > 0 && !sending;

  async function handleSubmit() {
    try {
      setError(null);
      setSending(true);
      trackEvent('cta_send_quote', { bookingRequestId, artistId, clientId });

      const services: ServiceItem[] = [
        { description: serviceName ?? 'Service fee', price: serviceFee },
        ...items.map(({ key, ...rest }) => rest),
      ];

      const expires_at = expiresHours
        ? new Date(Date.now() + expiresHours * 3600000).toISOString()
        : null;

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

  // ——————————————————————————————————————————————————————————————
  // UI
  // ——————————————————————————————————————————————————————————————

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white/80 backdrop-blur p-4 sm:p-5 shadow-sm">
      {/* Booking Request Summary + Composer (swapped: composer left, details right) */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Composer (left) */}
        <div className="rounded-xl border border-gray-200 p-3 sm:p-4 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold">Review & Adjust Quote</h4>
            <div className="text-[11px] text-gray-600 font-medium">
              Quote No: <span className="font-semibold">{quoteNumber}</span> · Date:{' '}
              <span className="font-semibold">{todayLabel}</span>
            </div>
          </div>

          {/* Smart state from calculator */}
          {loadingCalc && (
            <div className="mb-3 text-xs text-gray-600 flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Loading cost suggestions…
            </div>
          )}

          <div className="space-y-4">
            {/* Base Fee */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <label htmlFor="base" className="text-sm font-medium text-gray-900">
                Service Provider Base Fee
              </label>
              <CurrencyInput
                id="base"
                aria-label="Base fee"
                value={serviceFee}
                onChange={setServiceFee}
              />
            </div>

            {/* Travel */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                Travel
                {calculationParams?.distance_km != null && (
                  <span className="text-[11px] text-gray-500 font-normal">
                    ({Math.round(calculationParams.distance_km)} km · {mode})
                  </span>
                )}
              </div>
              <CurrencyInput aria-label="Travel fee" value={travelFee} onChange={setTravelFee} />
            </div>

            {/* Sound equipment (no presets/guides) */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <label htmlFor="sound" className="text-sm font-medium text-gray-900">
                Sound Equipment
              </label>
              <CurrencyInput id="sound" aria-label="Sound fee" value={soundFee} onChange={setSoundFee} />
            </div>

            {/* Quick-add suggestions */}
            <div>
              <div className="mb-2 text-sm font-medium text-gray-900">➕ Extras</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {suggestions.map((s) => (
                  <QuickChip key={s.label} label={`${s.label} · ${formatCurrency(s.price)}`} onClick={() => addItem(s.label, s.price)} />
                ))}
                <QuickChip label="Custom item" onClick={() => addItem()} />
              </div>
              <div className="space-y-2">
                {items.map((it) => (
                  <LineItemRow
                    key={it.key}
                    item={it}
                    onUpdate={(patch) => updateItem(it.key, patch)}
                    onRemove={() => removeItem(it.key)}
                  />
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <label htmlFor="discount" className="text-sm font-medium text-gray-900">
                🏷️ Discount (optional)
              </label>
              <CurrencyInput
                id="discount"
                aria-label="Discount amount"
                value={discount}
                onChange={setDiscount}
              />
            </div>

            {/* Expiry */}
            <div className="grid grid-cols-1 gap-2">
              <div className="text-sm font-medium text-gray-900">Expires</div>
              <div className="flex flex-wrap gap-1.5">
                <QuickChip label="No expiry" active={!expiresHours} onClick={() => setExpiresHours(null)} />
                {expiryOptions.map((o) => (
                  <QuickChip
                    key={o.value}
                    label={o.label}
                    active={expiresHours === o.value}
                    onClick={() => setExpiresHours(o.value)}
                  />
                ))}
              </div>
              <div className="text-xs text-gray-600">{expiresHours ? `Auto-expires: ${expiresPreview}` : 'No automatic expiry'}</div>
            </div>

            {/* Accommodation */}
            <div>
              <label htmlFor="accom" className="text-sm font-medium text-gray-900 block mb-1">
                🛏️ Accommodation (optional)
              </label>
              <textarea
                id="accom"
                rows={2}
                className="w-full p-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="E.g. 1 night hotel stay"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
              />
            </div>

            {/* Agreement */}
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black/30"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>
                I have reviewed the quote and agree to the{' '}
                <a className="underline" href="#" onClick={(e) => e.preventDefault()}>
                  terms of service
                </a>
                .
              </span>
            </label>
          </div>
        </div>

        {/* Details (right) */}
        <div className="rounded-xl border border-gray-200 p-3 sm:p-4 bg-white">
          <h4 className="mb-1 text-sm font-semibold flex items-center gap-2">
            🧾 New Booking Request
          </h4>
          <p className="mb-3 text-xs text-gray-600">
            From: <span className="font-medium">{eventDetails?.from ?? 'N/A'}</span> · Received:{' '}
            <span className="font-medium">{eventDetails?.receivedAt ?? 'N/A'}</span>
          </p>
          <div className="text-xs">
            <p className="mb-1 font-semibold">Event Details</p>
            <ul className="space-y-1 text-gray-700">
              {eventDetails?.event && <li>📌 Event: {eventDetails.event}</li>}
              {eventDetails?.date && <li>📅 Date: {eventDetails.date}</li>}
              {(eventDetails?.locationName || eventDetails?.locationAddress) && (
                <li>
                  📍 Location:{' '}
                  {eventDetails.locationName ? (
                    eventDetails.locationAddress ? (
                      <>{eventDetails.locationName} — {eventDetails.locationAddress}</>
                    ) : (
                      <>{eventDetails.locationName}</>
                    )
                  ) : (
                    <>{eventDetails.locationAddress}</>
                  )}
                </li>
              )}
              {eventDetails?.guests && <li>👥 Guests: {eventDetails.guests}</li>}
              {eventDetails?.venue && <li>🏟️ Venue: {eventDetails.venue}</li>}
              <li>🔊 Sound: {(initialSoundNeeded ?? (soundFee > 0)) ? 'Yes' : 'No'}</li>
              {eventDetails?.notes && (
                <li>
                  📝 Notes: <span className="italic">“{eventDetails.notes}”</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="grid gap-1 text-sm text-gray-800" aria-live="polite">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="font-medium">{formatCurrency(calcSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Less discount</span>
            <span className="font-medium">{discount ? `− ${formatCurrency(discount)}` : formatCurrency(0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>VAT (15%)</span>
            <span className="font-medium">{formatCurrency(vat)}</span>
          </div>
          <div className="mt-2 border-t pt-2 flex items-center justify-between text-base font-semibold">
            <span>Estimated Total</span>
            <span>{formatCurrency(estimatedTotal)}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}

      {/* Actions (non-sticky so the form scrolls like a normal message) */}
      <div className="mt-4 bg-white border-t border-gray-200 rounded-b-2xl">
        <div className="p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="text-gray-600">You will send</div>
            <div className="text-lg font-bold">{formatCurrency(estimatedTotal)}</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {onDecline && (
              <button
                type="button"
                onClick={onDecline}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50"
              >
                Decline Request
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              title={canSend ? 'Send this quote to the client' : 'Complete required fields'}
              className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${
                canSend ? 'bg-black hover:bg-gray-900' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {sending ? 'Sending…' : 'Send Quote'}
            </button>
          </div>
        </div>
      </div>
      {/* Spacer to prevent overlap with the chat composer at the very bottom */}
      <div className="h-6" aria-hidden="true" />
    </div>
  );
};

export default InlineQuoteForm;
