import React, { useEffect, useMemo, useRef, useState, useReducer, FC } from 'react';
import { format, addHours } from 'date-fns';
import { ServiceItem, QuoteV2Create, QuoteCalculationResponse } from '@/types';
import { formatCurrency, generateQuoteNumber } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import type { EventDetails } from './QuoteBubble';
import { calculateQuoteBreakdown } from '@/lib/api';
import { Plus, Trash2, Loader2, Info } from 'lucide-react';

// ——————————————————————————————————————————————————————————————
// Constants & Configuration
// ——————————————————————————————————————————————————————————————

const VAT_RATE = 0.15; // SA VAT (15%)

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: 0 },
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

const SUGGESTIONS = [
  { label: 'Extra hour', price: 1000 },
  { label: 'Parking', price: 150 },
  { label: 'Backline rental', price: 2500 },
];

// ——————————————————————————————————————————————————————————————
// Core Logic Hook: useQuoteCalculator
// ——————————————————————————————————————————————————————————————

type QuoteState = {
  serviceFee: number;
  soundFee: number;
  travelFee: number;
  discount: number;
  items: (ServiceItem & { key: string })[];
};

type QuoteAction =
  | { type: 'SET_FEE'; payload: { fee: keyof QuoteState; value: number } }
  | { type: 'SET_STATE'; payload: Partial<QuoteState> }
  | { type: 'ADD_ITEM'; payload: { description: string; price: number } }
  | { type: 'UPDATE_ITEM'; payload: { key: string; patch: Partial<ServiceItem> } }
  | { type: 'REMOVE_ITEM'; payload: { key: string } };

const initialState: QuoteState = {
  serviceFee: 0,
  soundFee: 0,
  travelFee: 0,
  discount: 0,
  items: [],
};

const quoteReducer = (state: QuoteState, action: QuoteAction): QuoteState => {
  switch (action.type) {
    case 'SET_FEE':
      return { ...state, [action.payload.fee]: action.payload.value };
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'ADD_ITEM':
      const newItem = {
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        description: action.payload.description,
        price: action.payload.price,
      };
      return { ...state, items: [...state.items, newItem] };
    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map((it) =>
          it.key === action.payload.key ? { ...it, ...action.payload.patch } : it
        ),
      };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((it) => it.key !== action.payload.key) };
    default:
      return state;
  }
};

const useQuoteCalculator = (initialValues: Partial<QuoteState> = {}) => {
  const [state, dispatch] = useReducer(quoteReducer, { ...initialState, ...initialValues });

  const calculations = useMemo(() => {
    const extrasTotal = state.items.reduce((sum, it) => sum + Number(it.price || 0), 0);
    const subtotal = state.serviceFee + state.soundFee + state.travelFee + extrasTotal;
    const discountAmount = Math.min(subtotal, state.discount || 0);
    const discounted = subtotal - discountAmount;
    const vat = discounted * VAT_RATE;
    const total = discounted + vat;
    return { subtotal, discountAmount, vat, total };
  }, [state]);

  return { state, dispatch, calculations };
};

// ——————————————————————————————————————————————————————————————
// UI Components
// ——————————————————————————————————————————————————————————————

const toNumber = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = v.replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const MoneyInput: FC<{
  value: number;
  onChange: (n: number) => void;
  className?: string;
  'aria-label': string;
}> = ({ value, onChange, className = '', ...props }) => {
  const [text, setText] = useState(() => (value ? formatCurrency(value, false) : ''));
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (lastValueRef.current !== value && document.activeElement?.ariaLabel !== props['aria-label']) {
      lastValueRef.current = value;
      setText(value ? formatCurrency(value, false) : '');
    }
  }, [value, props]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R</span>
      <input
        {...props}
        inputMode="decimal"
        className={`w-36 h-10 rounded-lg border border-gray-300 bg-white text-right pr-3 pl-7 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 focus:border-black ${className}`}
        placeholder="0.00"
        value={text}
        onFocus={(e) => {
          setText(String(value || ''));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toNumber(e.target.value));
        }}
        onBlur={() => {
          lastValueRef.current = value;
          setText(value ? formatCurrency(value, false) : '');
        }}
      />
    </div>
  );
};

const FormRow: FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-4">
    <div>
      <label className="text-sm font-medium text-gray-900">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
    {children}
  </div>
);

const LineItemRow: FC<{
  item: ServiceItem & { key: string };
  onUpdate: (patch: Partial<ServiceItem>) => void;
  onRemove: () => void;
}> = ({ item, onUpdate, onRemove }) => (
  <div className="grid grid-cols-[1fr,auto,auto] items-center gap-2 p-2 bg-white">
    <input
      type="text"
      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 focus:border-black"
      placeholder="Line item description (e.g. Extra hour)"
      value={item.description}
      onChange={(e) => onUpdate({ description: e.target.value })}
    />
    <MoneyInput
      aria-label="Item price"
      value={item.price}
      onChange={(price) => onUpdate({ price })}
    />
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove line item"
      className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
    >
      <Trash2 size={16} />
    </button>
  </div>
);

const QuoteTotals: FC<{
  calculations: { subtotal: number; discountAmount: number; vat: number; total: number };
}> = ({ calculations }) => (
  <div className="grid gap-1 text-sm">
    <div className="flex items-center justify-between text-gray-600">
      <span>Subtotal</span>
      <span>{formatCurrency(calculations.subtotal)}</span>
    </div>
    <div className="flex items-center justify-between text-gray-600">
      <span>Discount</span>
      <span>{calculations.discountAmount > 0 ? `− ${formatCurrency(calculations.discountAmount)}` : 'R 0.00'}</span>
    </div>
    <div className="flex items-center justify-between text-gray-600">
      <span>VAT ({Math.round(VAT_RATE * 100)}%)</span>
      <span>{formatCurrency(calculations.vat)}</span>
    </div>
    <div className="mt-2 pt-3 border-t border-gray-200 flex items-center justify-between text-lg font-bold text-black">
      <span>Total</span>
      <span>{formatCurrency(calculations.total)}</span>
    </div>
  </div>
);


const QuoteSidebar: FC<{
    quoteNumber: string;
    todayLabel: string;
    expiresPreview: string | null;
    eventDetails?: EventDetails;
    initialSoundNeeded?: boolean;
    soundFee: number;
}> = ({ quoteNumber, todayLabel, expiresPreview, eventDetails, initialSoundNeeded, soundFee }) => (
    <aside>
        <div className="rounded-xl border border-gray-200 bg-white p-4 md:sticky md:top-4">
            <h4 className="mb-3 text-sm font-semibold text-gray-800">Request Details</h4>
            <div className="text-xs text-gray-600 border-t border-b border-gray-100 py-2 space-y-1.5">
                <div className="flex justify-between"><span className="font-medium text-gray-500">Quote #</span><span>{quoteNumber}</span></div>
                <div className="flex justify-between"><span className="font-medium text-gray-500">Date</span><span>{todayLabel}</span></div>
                {expiresPreview && <div className="flex justify-between"><span className="font-medium text-gray-500">Expires</span><span className="text-right">{expiresPreview}</span></div>}
            </div>
            {eventDetails && (
                 <div className="mt-3 space-y-2 text-xs text-gray-700">
                    {eventDetails.event && <div className="font-semibold">{eventDetails.event}</div>}
                    {eventDetails.date && <div>{eventDetails.date}</div>}
                    {(eventDetails.locationName || eventDetails.locationAddress) && <div>{eventDetails.locationName ? (eventDetails.locationAddress ? `${eventDetails.locationName}, ${eventDetails.locationAddress}` : eventDetails.locationName) : eventDetails.locationAddress}</div>}
                    <div className="pt-1 mt-1 border-t border-gray-100 flex justify-between">
                      <span>{eventDetails.guests && `${eventDetails.guests} guests`}</span>
                      <span>Sound: {(initialSoundNeeded ?? soundFee > 0) ? 'Required' : 'Not Required'}</span>
                    </div>
                 </div>
            )}
        </div>
    </aside>
);


// ——————————————————————————————————————————————————————————————
// Main Component: InlineQuoteForm
// ——————————————————————————————————————————————————————————————
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

const InlineQuoteForm: React.FC<Props> = ({
  onSubmit,
  artistId,
  clientId,
  bookingRequestId,
  serviceName = 'Service Fee',
  initialBaseFee,
  initialTravelCost,
  initialSoundNeeded,
  initialSoundCost,
  onDecline,
  eventDetails,
  calculationParams,
}) => {
  // --- State & Logic ---
  const { state, dispatch, calculations } = useQuoteCalculator({
    serviceFee: initialBaseFee,
    travelFee: initialTravelCost,
    soundFee: initialSoundCost ?? (initialSoundNeeded ? 1000 : 0),
  });
  
  const [accommodation, setAccommodation] = useState('');
  const [expiresHours, setExpiresHours] = useState<number>(0);
  const [agree, setAgree] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quoteNumber] = useState(generateQuoteNumber());
  const todayLabel = format(new Date(), 'd MMM yyyy');
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!calculationParams) return;
      setLoadingCalc(true);
      try {
        const { data } = (await calculateQuoteBreakdown(calculationParams)) as { data: QuoteCalculationResponse };
        if (!cancelled) {
          const payload: Partial<QuoteState> = {};
          if (initialBaseFee == null) payload.serviceFee = calculationParams.base_fee ?? data?.base_fee ?? 0;
          if (initialTravelCost == null) payload.travelFee = Number(data?.travel_cost || 0);
          if (initialSoundCost == null && initialSoundNeeded == null) payload.soundFee = Number(data?.sound_cost || 0);
          dispatch({ type: 'SET_STATE', payload });
        }
      } catch (err) {
        console.error("Failed to calculate quote breakdown:", err);
      } finally {
        if (!cancelled) setLoadingCalc(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [calculationParams, initialBaseFee, initialTravelCost, initialSoundCost, initialSoundNeeded, dispatch]);


  // --- Memos & Derived State ---
  const expiresPreview = useMemo(() => {
    if (!expiresHours) return null;
    return format(addHours(new Date(), expiresHours), 'd MMM, p');
  }, [expiresHours]);

  const travelDescription = useMemo(() => {
    if (calculationParams?.distance_km == null) return;
    const km = Math.round(calculationParams.distance_km);
    const mode = km > 300 ? 'flight' : 'drive';
    return `${km} km · via ${mode}`;
  }, [calculationParams?.distance_km]);

  const canSend = agree && calculations.total > 0 && !sending;

  // --- Handlers ---
  const handleSubmit = async () => {
    if (!canSend) return;
    setError(null);
    setSending(true);
    trackEvent?.('cta_send_quote', { bookingRequestId, artistId, clientId });

    try {
      const services: ServiceItem[] = [
        { description: serviceName, price: state.serviceFee },
        ...state.items.map(({ key, ...rest }) => rest),
      ];

      const expires_at = expiresHours ? new Date(Date.now() + expiresHours * 3600000).toISOString() : null;

      await onSubmit({
        booking_request_id: bookingRequestId,
        service_provider_id: artistId,
        artist_id: artistId,
        client_id: clientId,
        services,
        sound_fee: state.soundFee,
        travel_fee: state.travelFee,
        accommodation: accommodation || null,
        discount: state.discount || null,
        expires_at,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not send quote. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // --- Render ---
  return (
    <section className="w-full bg-gray-50/80 backdrop-blur p-2 sm:p-4 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-[2.5fr_1fr] gap-4">
        
        {/* Left Side: Composer */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm">
            <div className="flex justify-between items-baseline mb-2">
                <h3 className="text-lg font-bold text-gray-900">Create Quote</h3>
                {loadingCalc && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Calculating costs...</span>
                  </div>
                )}
            </div>

            <div className="divide-y divide-gray-100">
                <FormRow label="Base Fee" description={serviceName}>
                    <MoneyInput
                        aria-label="Base fee"
                        value={state.serviceFee}
                        onChange={(v) => dispatch({ type: 'SET_FEE', payload: { fee: 'serviceFee', value: v }})}
                    />
                </FormRow>

                <FormRow label="Travel" description={travelDescription}>
                    <MoneyInput
                        aria-label="Travel fee"
                        value={state.travelFee}
                        onChange={(v) => dispatch({ type: 'SET_FEE', payload: { fee: 'travelFee', value: v }})}
                    />
                </FormRow>

                <FormRow label="Sound Equipment">
                    <MoneyInput
                        aria-label="Sound fee"
                        value={state.soundFee}
                        onChange={(v) => dispatch({ type: 'SET_FEE', payload: { fee: 'soundFee', value: v }})}
                    />
                </FormRow>

                {/* Extras */}
                <div className="py-4">
                    <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-900">Extras / Add-ons</label>
                        <div className="flex gap-1.5">
                            {SUGGESTIONS.map((s) => (
                                <button key={s.label} type="button" onClick={() => dispatch({ type: 'ADD_ITEM', payload: s })} className="px-2 py-1 rounded-full text-[11px] font-medium border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors">
                                    + {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {state.items.length > 0 && (
                        <div className="mt-2 space-y-2 rounded-lg bg-gray-50 border border-gray-200 p-2">
                            {state.items.map((it) => (
                                <LineItemRow
                                    key={it.key}
                                    item={it}
                                    onUpdate={(patch) => dispatch({ type: 'UPDATE_ITEM', payload: { key: it.key, patch } })}
                                    onRemove={() => dispatch({ type: 'REMOVE_ITEM', payload: { key: it.key } })}
                                />
                            ))}
                        </div>
                    )}
                    <button type="button" onClick={() => dispatch({ type: 'ADD_ITEM', payload: { description: '', price: 0 } })} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 rounded-md px-3 py-1.5 hover:bg-gray-100 transition-colors border border-gray-300">
                        <Plus size={14} /> Add Line Item
                    </button>
                </div>

                <FormRow label="Discount">
                    <MoneyInput
                        aria-label="Discount"
                        value={state.discount}
                        onChange={(v) => dispatch({ type: 'SET_FEE', payload: { fee: 'discount', value: v }})}
                    />
                </FormRow>

                <div className="py-4 space-y-2">
                  <label htmlFor="accom" className="text-sm font-medium text-gray-900">Notes & Accommodation</label>
                  <textarea id="accom" rows={2} className="w-full p-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 focus:border-black" placeholder="Optional notes (e.g. 1 night hotel stay required)" value={accommodation} onChange={(e) => setAccommodation(e.target.value)} />
                </div>
            </div>
          </div>
        </div>

        {/* Right Side: Details & Totals */}
        <div className="space-y-4">
            <QuoteSidebar
                quoteNumber={quoteNumber}
                todayLabel={todayLabel}
                expiresPreview={expiresPreview}
                eventDetails={eventDetails}
                initialSoundNeeded={initialSoundNeeded}
                soundFee={state.soundFee}
            />
          
            <div className="rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm md:sticky md:top-[18rem]">
              <h4 className="mb-3 text-sm font-semibold text-gray-800">Quote Summary</h4>
              <QuoteTotals calculations={calculations} />
              
              <div className="mt-4 flex items-center gap-3">
                 <label htmlFor="expires" className="text-xs font-medium text-gray-500">Expires</label>
                 <select id="expires" className="h-8 flex-grow rounded-lg border border-gray-300 pl-2 pr-7 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black/50" value={expiresHours} onChange={(e) => setExpiresHours(Number(e.target.value))}>
                    {EXPIRY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                 </select>
              </div>
            </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-4 sticky bottom-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 -mx-4 -mb-4 px-4 py-3">
        {error && (
            <div className="mb-3 text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                <Info size={14} />
                <span>{error}</span>
            </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
                <input ref={firstFieldRef} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-black focus:ring-black/30" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I confirm all amounts are correct and ready to send to the client.</span>
            </label>
            <div className="flex items-center gap-3 w-full sm:w-auto">
                {onDecline && (
                    <button type="button" onClick={onDecline} className="h-11 w-full sm:w-auto px-4 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-100 transition-colors">
                        Decline
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className="flex items-center justify-center h-11 w-full sm:w-auto px-6 rounded-lg text-white text-sm font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed bg-black hover:bg-gray-800"
                >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : `Send Quote (${formatCurrency(calculations.total)})`}
                </button>
            </div>
        </div>
      </div>
    </section>
  );
};

export default InlineQuoteForm;