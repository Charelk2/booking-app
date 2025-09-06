import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, addHours } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from './QuoteBubble';
import { calculateQuoteBreakdown } from '@/lib/api';

/**
 * InlineQuoteForm (v3 — polished visual pass only)
 * ------------------------------------------------------------
 * Professional, compact quote composer for chat threads.
 * Visual changes only: spacing, alignment, borders, focus styles,
 * sticky sidebar, cleaner totals, consistent controls.
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

const VAT_RATE = 0.15; // SA VAT (15%)

const expiryOptions = [
  { label: 'No expiry', value: '' },
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

// ——————————————————————————————————————————————————————————————
// Helpers (unchanged logic)
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
      className={[
        'w-full sm:w-36 text-right px-3 h-10 rounded-md border',
        'border-gray-200 bg-white/60 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]',
        'focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30',
        'transition-colors',
        className,
      ].join(' ')}
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
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
      <input
        type="text"
        className="w-full px-3 h-10 rounded-md border border-gray-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30 transition-colors"
        placeholder="Extra description (e.g. Extra hour)"
        value={item.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
      />
      <MoneyInput aria-label="Item price" value={item.price} onChange={(n) => onUpdate({ price: n })} />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove line item"
        className="h-10 inline-flex items-center justify-center rounded-md border border-red-200 text-red-600 text-xs font-medium px-2.5 hover:bg-red-50 active:bg-red-100 transition-colors"
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
  // — State — (unchanged)
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

  // Prefill from backend calculator if provided (unchanged)
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
    if (!expiresHours) return '';
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
    <section className="w-full rounded-xl bg-white/95 backdrop-blur p-3 sm:p-4 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-gray-900">Create Quote</h4>
          {loadingCalc ? (
            <div className="mt-1 text-xs text-gray-500 inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Loading cost suggestions
            </div>
          ) : null}
        </div>
        <div className="text-xs text-gray-600 font-medium">
          <span className="font-semibold">{quoteNumber}</span>
          <span className="mx-1.5 text-gray-300">•</span>
          <span className="font-semibold">{todayLabel}</span>
        </div>
      </div>

      {/* Grid: form 3/4, details 1/4 */}
      <div className="grid gap-3 md:grid-cols-[3fr_1fr]">
        {/* Composer */}
        <div className="rounded-lg border border-gray-100 bg-white p-3 sm:p-4">
          <div className="space-y-3">
            {/* Base Fee */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="base" className="text-sm font-medium text-gray-800 flex-1 min-w-0">Base Fee</label>
              <MoneyInput id="base" aria-label="Base fee" value={serviceFee} onChange={setServiceFee} className="flex-none" />
            </div>

            {/* Travel */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                <div>Travel</div>
                {calculationParams?.distance_km != null && (
                  <div className="text-xs text-gray-500 font-normal">{Math.round(calculationParams.distance_km)} km · {mode}</div>
                )}
              </div>
              <MoneyInput aria-label="Travel fee" value={travelFee} onChange={setTravelFee} className="flex-none" />
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sound" className="text-sm font-medium text-gray-800 flex-1 min-w-0">Sound Equipment</label>
              <MoneyInput id="sound" aria-label="Sound fee" value={soundFee} onChange={setSoundFee} className="flex-none" />
            </div>

            {/* Extras */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">Extras</span>
                <div className="flex gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => addItem(s.label, s.price)}
                      className="h-8 px-2 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                    >
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {items.length > 0 && (
                <div className="rounded-md border border-gray-100 overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                    <div>Description</div>
                    <div className="text-right">Amount</div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((it) => (
                      <div key={it.key} className="px-3 py-2">
                        <LineItemRow item={it} onUpdate={(patch) => updateItem(it.key, patch)} onRemove={() => removeItem(it.key)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="h-9 inline-flex items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                >
                  Add line item
                </button>
              </div>
            </div>

            {/* Discount */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="discount" className="text-sm font-medium text-gray-800 flex-1 min-w-0">Discount</label>
              <MoneyInput id="discount" aria-label="Discount amount" value={discount} onChange={setDiscount} className="flex-none" />
            </div>

            {/* Expiry */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="expires" className="text-sm font-medium text-gray-800 flex-1 min-w-0">Expires</label>
              <div className="flex items-center gap-2 flex-none">
                <select
                  id="expires"
                  className="h-10 w-32 rounded-md border border-gray-200 px-2 text-sm text-gray-800 bg-white/60 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30 transition-colors"
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
                {expiresHours ? (
                  <div className="text-xs text-gray-500 min-w-[8rem] text-right">{expiresPreview}</div>
                ) : null}
              </div>
            </div>

            {/* Accommodation */}
            <div className="flex items-start justify-between gap-3">
              <label htmlFor="accom" className="text-sm font-medium text-gray-800 flex-1 min-w-0 pt-1.5">Accommodation</label>
              <textarea
                id="accom"
                rows={2}
                className="w-full max-w-md p-2.5 h-24 rounded-md border border-gray-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30 transition-colors resize-none"
                placeholder="Optional (e.g. 1 night hotel stay)"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Details (right 1/4) */}
        <aside className="md:col-span-1">
          <div className="rounded-lg border border-gray-100 bg-white p-3 sm:p-4 md:sticky md:top-2">
            <h4 className="mb-2 text-sm font-semibold text-gray-900">Request Details</h4>

            <dl className="text-xs text-gray-600 grid gap-1">
              <div className="flex items-center justify-between"><dt className="font-medium text-gray-700">Quote</dt><dd>{quoteNumber}</dd></div>
              <div className="flex items-center justify-between"><dt className="font-medium text-gray-700">Date</dt><dd>{todayLabel}</dd></div>
              {expiresHours ? (
                <div className="flex items-center justify-between"><dt className="font-medium text-gray-700">Expires</dt><dd>{expiresPreview}</dd></div>
              ) : null}
            </dl>

            <div className="mt-3 space-y-1 text-xs text-gray-700">
              {eventDetails?.event && <div className="truncate" title={eventDetails.event}>{eventDetails.event}</div>}
              {eventDetails?.date && <div className="truncate" title={String(eventDetails.date)}>{eventDetails.date}</div>}
              {(eventDetails?.locationName || eventDetails?.locationAddress) && (
                <div className="truncate" title={`${eventDetails.locationName ?? ''} ${eventDetails.locationAddress ?? ''}`.trim()}>
                  {eventDetails.locationName ? (eventDetails.locationAddress ? `${eventDetails.locationName} — ${eventDetails.locationAddress}` : eventDetails.locationName) : eventDetails.locationAddress}
                </div>
              )}
              {eventDetails?.guests && <div>{eventDetails.guests} guests</div>}
              <div>Sound: {(initialSoundNeeded ?? (soundFee > 0)) ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Totals (below) */}
      <div className="mt-3 rounded-lg border border-gray-100 bg-white p-3 sm:p-4">
        <div className="grid gap-1 text-sm text-gray-800" aria-live="polite">
          <div className="flex items-center justify-between"><span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
          <div className="flex items-center justify-between"><span>Discount</span><span className="font-medium">{discount ? `− ${formatCurrency(discount)}` : formatCurrency(0)}</span></div>
          <div className="flex items-center justify-between"><span>VAT ({Math.round(VAT_RATE*100)}%)</span><span className="font-medium">{formatCurrency(vat)}</span></div>
          <div className="mt-1 border-t pt-1 flex items-center justify-between text-base font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
        </div>
        <label className="mt-2 flex items-start gap-2 text-xs text-gray-700">
          <input
            ref={firstFieldRef}
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black/20"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span>I confirm these amounts are correct.</span>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-md p-2">{error}</div>
      )}

      {/* Actions (below) */}
      <div className="mt-3 bg-white rounded-lg border border-gray-100 p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="text-gray-600">You will send</div>
          <div className="text-lg font-bold" aria-live="polite">{formatCurrency(total)}</div>
        </div>
        <div className="flex items-center gap-2">
          {onDecline && (
            <button
              type="button"
              onClick={onDecline}
              className="h-10 px-3 rounded-md border border-gray-200 bg-white text-gray-800 text-sm font-medium hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              Decline Request
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={[
              'h-10 px-4 rounded-md text-white text-sm font-medium transition-colors shadow-sm',
              canSend ? 'bg-black hover:bg-gray-900 active:bg-black' : 'bg-gray-300 cursor-not-allowed',
            ].join(' ')}
            aria-busy={sending}
          >
            {sending ? 'Sending…' : 'Send Quote'}
          </button>
        </div>
      </div>

      {/* Spacer to avoid overlap with chat composer */}
      <div className="h-4" aria-hidden="true" />
    </section>
  );
};

export default InlineQuoteForm;
