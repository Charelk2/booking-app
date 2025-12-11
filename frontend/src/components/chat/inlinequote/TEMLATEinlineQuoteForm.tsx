import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import { format, addHours } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from '@/components/chat/inlinequote/QuoteBubble';
import { livePerformanceEstimate, getBookingRequestById, getService, getBookingRequestCached } from '@/lib/api';
import { getDrivingMetricsCached } from '@/lib/travel';
import { useSoundQuotePrefill } from '@/components/chat/inlinequote/useSoundQuotePrefill';

/**
 * InlineQuoteForm (v3.1 - optimized UX + perf)
 * ------------------------------------------------------------
 * - Keeps original logic and API behavior.
 * - Reduces renders (memoized money inputs & rows).
 * - Improves a11y: better labeling, aria-live totals, focus management.
 * - Mobile-first spacing and clean borders, no heavy UI deps.
 */

export interface InlineQuoteFormProps {
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
  providerVatRegistered?: boolean;
  providerVatRate?: number | null;
}

const expiryOptions = [
  { label: 'No expiry', value: '' },
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

const toNumber = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const MoneyInput = React.memo(function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
  'aria-describedby': describedby,
}: {
  value: number;
  onChange: (n: number) => void;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  'aria-describedby'?: string;
}) {
  // Displayed text mirrors the user's typing while focused; we only format on blur
  const [text, setText] = useState<string>(() => formatCurrency(Number.isFinite(value) ? value : 0));
  const lastValueRef = useRef<number>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // When value changes externally, update the visible text only if not focused
  useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      const el = inputRef.current;
      const isFocused = typeof document !== 'undefined' && el && document.activeElement === el;
      if (!isFocused) {
        setText(formatCurrency(Number.isFinite(value) ? value : 0));
      }
    }
  }, [value]);

  const toPlainNumericString = (n: number) => {
    if (!Number.isFinite(n)) return '';
    // Start with 2dp then trim trailing zeros/dot for a clean edit state
    return n
      .toFixed(2)
      .replace(/\.([0-9]*?)0+$/, (m, p1) => (p1.length ? `.${p1}` : ''))
      .replace(/\.$/, '');
  };

  return (
    <input
      ref={inputRef}
      id={id}
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-describedby={describedby}
      className={[
        'w-full sm:w-36 text-right px-3 h-10 rounded-md border',
        'border-gray-200 bg-white/60 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]',
        'focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/30',
        'transition-colors',
        className,
      ].join(' ')}
      placeholder={placeholder ?? '0.00'}
      value={text}
      onFocus={(e) => {
        // Switch to a plain numeric representation while editing, select for easy overwrite
        setText(toPlainNumericString(Number.isFinite(value) ? value : 0));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const numeric = toNumber(raw);
        onChange(numeric);
      }}
      onBlur={() => setText(formatCurrency(Number.isFinite(value) ? value : 0))}
    />
  );
});

const LineItemRow = React.memo(function LineItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: ServiceItem & { key: string };
  onUpdate: (patch: Partial<ServiceItem>) => void;
  onRemove: () => void;
}) {
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
});

const travelMode = (km?: number) => (km && km > 300 ? 'fly' : 'drive');

const InlineQuoteForm: React.FC<InlineQuoteFormProps> = ({
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
  calculationParams,
  providerVatRegistered = false,
  providerVatRate = null,
}) => {
  // - State -
  const [serviceFee, setServiceFee] = useState<number>(initialBaseFee ?? 0);
  const [soundFee, setSoundFee] = useState<number>(initialSoundCost ?? (initialSoundNeeded ? 1000 : 0));
  const [travelFee, setTravelFee] = useState<number>(initialTravelCost ?? 0);
  const [dirtyService, setDirtyService] = useState(false);
  const [dirtyTravel, setDirtyTravel] = useState(false);
  const [dirtySound, setDirtySound] = useState(false);
  const [accommodation, setAccommodation] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [expiresHours, setExpiresHours] = useState<number | ''>('');
  const [items, setItems] = useState<(ServiceItem & { key: string })[]>([]);
  const [loadingCalc, setLoadingCalc] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState<boolean>(true);
  const [isSupplierParent, setIsSupplierParent] = useState<boolean>(false);
  const [isSoundService, setIsSoundService] = useState<boolean>(false);

  const [quoteNumber] = useState<string>(generateQuoteNumber());
  const todayLabel = format(new Date(), 'PPP');
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!dirtySound) {
      setSoundFee(initialSoundCost ?? (initialSoundNeeded ? 1000 : 0));
    }
  }, [initialSoundCost, initialSoundNeeded, dirtySound]);

  // Accept late-arriving base fee prefill (without overwriting user edits)
  useEffect(() => {
    if (typeof initialBaseFee === 'number' && !dirtyService) {
      setServiceFee(initialBaseFee);
    }
  }, [initialBaseFee, dirtyService]);

  // Accept late-arriving travel fee prefill (without overwriting user edits)
  useEffect(() => {
    if (typeof initialTravelCost === 'number' && !dirtyTravel) {
      setTravelFee(initialTravelCost);
    }
  }, [initialTravelCost, dirtyTravel]);

  // Prefill from backend calculator if provided
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!calculationParams) return;
      try {
        setLoadingCalc(true);
        const { data } = (await livePerformanceEstimate(calculationParams)) as { data: QuoteCalculationResponse };
        if (cancelled) return;
        if (initialBaseFee == null && !dirtyService) setServiceFee(calculationParams.base_fee ?? data?.base_fee ?? 0);
        if (initialTravelCost == null && !dirtyTravel) setTravelFee(Number(data?.travel_cost || 0));
        if (initialSoundCost == null && initialSoundNeeded == null && !dirtySound) setSoundFee(Number(data?.sound_cost || 0));
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
  }, [calculationParams, initialBaseFee, initialTravelCost, initialSoundCost, initialSoundNeeded, dirtyService, dirtyTravel, dirtySound]);

  // Direct prefill: booking-request details (and service price)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const br: any = await getBookingRequestCached(bookingRequestId);
        if (!active) return;
        const tb: any = br.travel_breakdown || {};
        const soundModeRaw = tb.sound_mode || (br as any)?.sound_mode;
        const parentId = Number(br.parent_booking_request_id || 0);
        const supplierParent =
          !Number.isNaN(parentId) &&
          parentId <= 0 &&
          typeof soundModeRaw === 'string' &&
          String(soundModeRaw).toLowerCase() === 'supplier';
        setIsSupplierParent(supplierParent);
        const svcId = Number(br.service_id || 0);
        const svcPrice = Number(br?.service?.price);
        const svcTypeRaw = String(br?.service?.service_type || '').toLowerCase();
        const svcCatSlug = String((br?.service as any)?.service_category_slug || '').toLowerCase();
        const svcCatName = String((br?.service as any)?.service_category?.name || '').toLowerCase();
        // Sound services are represented as a separate service category
        // ("Sound Service"), while service_type often stays as "Live Performance".
        // Treat anything whose category slug/name contains "sound" as a
        // dedicated Sound Service.
        const isSoundSvc =
          svcTypeRaw.includes('sound service') ||
          svcCatSlug.includes('sound') ||
          svcCatName.includes('sound');

        // Detect dedicated Sound Service threads so we can use audience/supplier
        // context for better defaults and a sound-specific inline quote UX.
        setIsSoundService(isSoundSvc);

        // Best-effort sound estimate from the parent wizard, carried via
        // travel_breakdown. This reflects the supplier audience tier + basic
        // add-ons that the client saw during booking.
        const tbSoundEstimateRaw = (tb as any)?.provided_sound_estimate;
        const tbSoundEstimate = Number(tbSoundEstimateRaw);
        const hasTbSoundEstimate = Number.isFinite(tbSoundEstimate) && tbSoundEstimate > 0;

        // Base fee from request or service. For dedicated Sound Service threads,
        // prefer the wizard's supplier estimate so providers see a realistic
        // starting point instead of a stub price on the Service.
        if (!dirtyService) {
          if (isSoundSvc && hasTbSoundEstimate) {
            setServiceFee(tbSoundEstimate);
          } else if (Number.isFinite(svcPrice) && svcPrice >= 0) {
            setServiceFee(svcPrice);
          } else if (Number.isFinite(svcId) && svcId > 0) {
            try {
              const svc = await getService(svcId);
              if (!active) return;
              const price2 = Number((svc.data as any)?.price);
              if (!dirtyService && Number.isFinite(price2)) setServiceFee(price2);
            } catch {}
          }
        }

        // Travel fee from breakdown or fallback field (artists). For dedicated
        // Sound Service threads we derive travel as the remainder between the
        // full supplier estimate and the package subtotal (audience + addons)
        // so that extras can be itemised without double-counting.
        if (!dirtyTravel) {
          if (!isSoundSvc) {
            const travelRaw = Number(tb.travel_cost ?? tb.travel_fee ?? br.travel_cost);
            if (Number.isFinite(travelRaw)) setTravelFee(travelRaw);
          } else {
            // For sound providers, travel is computed below after we fetch a
            // contextual sound estimate with itemised audience/backline lines.
            setTravelFee((prev) => prev); // no-op placeholder
          }
        }

        // Sound fee best-effort (non-sound-service only). For dedicated sound
        // providers, the sound package is represented in the base fee +
        // extras, so we keep soundFee at 0 to avoid double-counting.
        if (!dirtySound && !supplierParent && !isSoundSvc) {
          try {
            const soundRequired = Boolean(tb.sound_required);
            const provisioning = (br?.service as any)?.details?.sound_provisioning;
            // Normalize travel mode from multiple possible sources and naming schemes
            const rawMode = String((br as any)?.travel_mode || tb.travel_mode || tb.mode || '').toLowerCase();
            const mode = rawMode === 'flight' ? 'fly' : rawMode === 'driving' ? 'drive' : rawMode;
            let soundCost: number | undefined = undefined;
            if (soundRequired && provisioning?.mode === 'artist_provides_variable') {
              const drive = Number(provisioning?.price_driving_sound_zar ?? provisioning?.price_driving_sound ?? 0);
              const fly = Number(provisioning?.price_flying_sound_zar ?? provisioning?.price_flying_sound ?? 0);
              soundCost = mode === 'fly' ? fly : drive;
            } else if (soundRequired && tb.sound_cost) {
              const sc = Number(tb.sound_cost);
              soundCost = Number.isFinite(sc) ? sc : undefined;
            }
            if (Number.isFinite(soundCost)) setSoundFee(soundCost as number);
          } catch {}
        }

        // Calculator for refined costs (best-effort). For dedicated Sound
        // Service threads, we skip the generic quote calculator entirely so
        // we don't overwrite the sound provider's context-aware package.
        try {
          if (!isSoundSvc) {
            const distance = Number(tb.distance_km ?? tb.distanceKm);
            const eventCity = tb.event_city || br.event_city || '';
            // Allow backend to resolve distance_km from service.base_location + event_city
            // when we don't have an explicit distance from the client travel engine.
            if (eventCity && Number.isFinite(Number(br.service_id))) {
              let baseForCalc = Number.isFinite(Number(br?.service?.price)) ? Number(br?.service?.price) : serviceFee;
              const params: any = {
                base_fee: Number(baseForCalc || 0),
                service_id: Number(br.service_id),
                event_city: String(eventCity),
                ...(tb.accommodation_cost ? { accommodation_cost: Number(tb.accommodation_cost) } : {}),
              };
              if (Number.isFinite(distance) && distance > 0) {
                params.distance_km = Number(distance);
              }

              try {
                const { data } = await livePerformanceEstimate(params);
                if (!active) return;
                if (!dirtyService && typeof initialBaseFee !== 'number') setServiceFee(Number(data?.base_fee || baseForCalc || 0));
                if (!dirtyTravel && typeof initialTravelCost !== 'number') setTravelFee(Number(data?.travel_cost || 0));
                if (!dirtySound && initialSoundCost == null && initialSoundNeeded == null && !supplierParent) {
                  setSoundFee(Number(data?.sound_cost || 0));
                }
              } catch {}
            }
          }
        } catch {}
      } catch {
        // ignore; prefill is best-effort
      }
    })();
    return () => { active = false; };
  }, [bookingRequestId, dirtyService, dirtyTravel, dirtySound, initialBaseFee, initialTravelCost, initialSoundCost, initialSoundNeeded]);

  useSoundQuotePrefill({
    bookingRequestId,
    isSoundService,
    dirtyTravel,
    dirtyService,
    items,
    setItems: (next) => setItems(next),
    setServiceFee,
    setTravelFee,
  });

  const suggestions = useMemo(
    () => [
      { label: 'Extra hour', price: 1000 },
      { label: 'Parking', price: 150 },
      { label: 'Backline rental', price: 2500 },
    ],
    []
  );

  const extrasTotal = useMemo(() => items.reduce((sum, it) => sum + Number(it.price || 0), 0), [items]);
  const subtotal = useMemo(
    () => serviceFee + (isSupplierParent ? 0 : soundFee) + travelFee + extrasTotal,
    [serviceFee, soundFee, travelFee, extrasTotal, isSupplierParent],
  );
  const discounted = Math.max(0, subtotal - (discount || 0));

  const normalizedVatRate = useMemo(() => {
    if (!providerVatRegistered) return 0;
    const raw = providerVatRate;
    if (!Number.isFinite(raw) || raw! <= 0) return 0.15;
    return raw! > 1 ? raw! / 100 : raw!;
  }, [providerVatRate, providerVatRegistered]);

  const vatAmount = useMemo(() => {
    if (!providerVatRegistered || normalizedVatRate <= 0) return 0;
    const base = Math.max(0, discounted);
    return Math.round(base * normalizedVatRate * 100) / 100;
  }, [discounted, normalizedVatRate, providerVatRegistered]);

  const totalInclVat = useMemo(() => {
    const base = Math.max(0, discounted);
    return Math.round((base + vatAmount) * 100) / 100;
  }, [discounted, vatAmount]);

  const expiresPreview = useMemo(() => {
    if (!expiresHours) return '';
    const dt = addHours(new Date(), Number(expiresHours));
    return `${format(dt, 'PPP p')}`;
  }, [expiresHours]);

  const addItem = useCallback((desc = '', price = 0) =>
    setItems((arr) => [
      ...arr,
      { key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, description: desc, price },
    ]), []);
  const updateItem = useCallback((key: string, patch: Partial<ServiceItem>) =>
    setItems((arr) => arr.map((it) => (it.key === key ? { ...it, ...patch } : it))), []);
  const removeItem = useCallback((key: string) =>
    setItems((arr) => arr.filter((it) => it.key !== key)), []);

  const mode = travelMode(calculationParams?.distance_km);
  const canSend = agree && serviceFee > 0 && !sending;

  const expiryId = useId();
  const discountId = useId();
  const baseId = useId();
  const travelId = useId();
  const soundId = useId();

  const handleSubmit = useCallback(async () => {
    try {
      setError(null);
      setSending(true);
      trackEvent?.('cta_send_quote', { bookingRequestId, artistId, clientId });

      const services: ServiceItem[] = [
        { description: serviceName ?? (isSoundService ? 'Sound package' : 'Service fee'), price: serviceFee },
        ...items.map(({ key, ...rest }) => rest),
      ];

      const expires_at = expiresHours ? new Date(Date.now() + Number(expiresHours) * 3600000).toISOString() : null;

      await onSubmit({
        booking_request_id: bookingRequestId,
        service_provider_id: artistId,
        artist_id: artistId,
        client_id: clientId,
        services,
        sound_fee: (isSupplierParent || isSoundService) ? 0 : soundFee,
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
  }, [artistId, clientId, bookingRequestId, discount, expiresHours, items, onSubmit, serviceFee, soundFee, travelFee, accommodation, serviceName, isSupplierParent]);

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

      {/* Grid: single column */}
      <div className="grid gap-3">
        {/* Composer */}
        <div className="rounded-lg border border-gray-100 bg-white p-3 sm:p-4">
          <div className="space-y-3">
            {/* Base Fee / Sound package */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={baseId} className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                {isSoundService ? 'Sound package (full estimate)' : 'Base Fee'}
              </label>
              <MoneyInput
                id={baseId}
                aria-label={isSoundService ? 'Sound package fee' : 'Base fee'}
                value={serviceFee}
                onChange={(n) => { setDirtyService(true); setServiceFee(Math.max(0, n)); }}
                className="flex-none"
              />
            </div>

            {/* Travel */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                <div>Travel</div>
                {calculationParams?.distance_km != null && (
                  <div className="text-xs text-gray-500 font-normal">{Math.round(calculationParams.distance_km)} km · {mode}</div>
                )}
              </div>
              <MoneyInput
                id={travelId}
                aria-label="Travel fee"
                value={travelFee}
                onChange={(n) => { setDirtyTravel(true); setTravelFee(Math.max(0, n)); }}
                className="flex-none"
              />
            </div>

            {/* Sound (artist-provided sound only). For dedicated Sound Service
                threads, the full sound package is represented in the base fee,
                so we hide this row entirely. */}
            {!isSoundService && (
              isSupplierParent ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-800 flex-1 min-w-0">
                    <div>Sound Equipment</div>
                    <div className="text-xs text-gray-500 font-normal">
                      Sound for this event will be quoted and paid separately via a linked sound booking.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={soundId} className="text-sm font-medium text-gray-800 flex-1 min-w-0">Sound Equipment</label>
                  <MoneyInput
                    id={soundId}
                    aria-label="Sound fee"
                    value={soundFee}
                    onChange={(n) => { setDirtySound(true); setSoundFee(Math.max(0, n)); }}
                    className="flex-none"
                  />
                </div>
              )
            )}

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
              <label htmlFor={discountId} className="text-sm font-medium text-gray-800 flex-1 min-w-0">Discount</label>
              <MoneyInput
                id={discountId}
                aria-label="Discount amount"
                value={discount}
                onChange={(n) => setDiscount(Math.max(0, n))}
                className="flex-none"
              />
            </div>

            {/* Expiry */}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={expiryId} className="text-sm font-medium text-gray-800 flex-1 min-w-0">Expires</label>
              <div className="flex items-center gap-2 flex-none">
                <select
                  id={expiryId}
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
      </div>

      {/* Totals */}
      <div className="mt-3 rounded-lg border border-gray-100 bg-white p-3 sm:p-4">
        <div className="grid gap-1 text-sm text-gray-800" aria-live="polite">
          <div className="flex items-center justify-between">
            <span>Subtotal (ex VAT)</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <span className="font-medium">{discount ? `− ${formatCurrency(discount)}` : formatCurrency(0)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-700 text-xs">
            <span>
              VAT {providerVatRegistered ? `(${(normalizedVatRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)` : '(not registered)'}
            </span>
            <span className="font-medium">{formatCurrency(vatAmount)}</span>
          </div>
          <div className="mt-1 border-t pt-1 flex items-center justify-between text-base font-semibold">
            <span>Total (incl. VAT)</span>
            <span>{formatCurrency(totalInclVat)}</span>
          </div>
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

      {/* Actions */}
      <div className="mt-3 bg-white rounded-lg border border-gray-100 p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="text-gray-600">You will send</div>
          <div className="text-lg font-bold" aria-live="polite">{formatCurrency(totalInclVat)}</div>
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
