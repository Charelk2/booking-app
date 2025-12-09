'use client';

// Consolidated steps: all step UI in one file for simpler edits and consistent styling.

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Controller, Control, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

import useIsMobile from '@/hooks/useIsMobile';
import { DateInput, BottomSheet, Button, CollapsibleSection, InfoPopover } from '@/components/ui';
import LocationInput from '@/components/ui/LocationInput';
import { useBooking } from '@/contexts/BookingContext';
import type { EventDetails as CtxEventDetails } from '@/contexts/BookingContext';
import { loadPlaces } from '@/lib/loadPlaces';
import { LatLng, reverseGeocode } from '@/lib/geo';
import eventTypes from '@/data/eventTypes.json';
import toast from '@/components/ui/Toast';
import { apiUrl } from '@/lib/api';
import { parseBookingText, uploadBookingAttachment } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { getDrivingMetricsCached, TravelResult } from '@/lib/travel';
import { getServiceProviderAvailability } from '@/lib/api';
import SummarySidebar from '../SummarySidebar';
import { trackEvent } from '@/lib/analytics';
import { QUOTE_TOTALS_PLACEHOLDER } from '@/lib/quoteTotals';
import { getQuoteTotalsPreview } from '@/lib/api';
import { isUnavailableDate } from '@/lib/shared/validation/booking';

// Inline DateTimeStep to avoid per-file CSS imports; styles live in wizard.css
const ReactDatePicker: any = dynamic(() => import('react-datepicker'), { ssr: false });

type EventDetails = CtxEventDetails;

interface DateTimeProps {
  control: Control<EventDetails>;
  unavailable: string[];
  loading?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

export function DateTimeStep({
  control,
  unavailable,
  loading = false,
  open = true,
}: DateTimeProps) {
  const isMobile = useIsMobile();
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (open && !isMobile) setShowPicker(true);
  }, [open, isMobile]);

  const filterDate = (date: Date) => {
    const today = startOfDay(new Date());
    const day = format(date, 'yyyy-MM-dd');
    // Reuse shared unavailable check but also keep the minDate guard
    return !isUnavailableDate({ date }, unavailable) && !isBefore(date, today) && !unavailable.includes(day);
  };

  return (
    <section className="wizard-step-container wizard-step-container-date booking-wizard-step">
      <div>
        <h3 className="step-title">Date & Time</h3>
        <p className="step-subtitle">When should we perform?</p>
      </div>

      <div className="mt-4">
        {loading || (!isMobile && !showPicker) ? (
          <div data-testid="calendar-skeleton" className="h-72 bg-gray-200 rounded animate-pulse" />
        ) : (
          <Controller
            name="date"
            control={control}
            render={({ field }) => {
              const currentValue =
                field.value && typeof field.value === 'string'
                  ? parseISO(field.value)
                  : (field.value as Date | null | undefined);

              return isMobile ? (
                <>
                  <DateInput
                    min={format(new Date(), 'yyyy-MM-dd')}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={currentValue ? format(currentValue, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        try {
                          const selected = startOfDay(new Date(value));
                          const today = startOfDay(new Date());
                          if (selected.getTime() === today.getTime()) {
                            toast.error('You can’t book for today. Please choose a later date.');
                            return;
                          }
                        } catch {
                          // Fall through to normal handler on parse errors
                        }
                      }
                      field.onChange(value);
                    }}
                    enterKeyHint="next"
                    inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                  />
                  {!currentValue && (
                    <p className="text-xs text-neutral-500 mt-1">Choose a date to continue.</p>
                  )}
                </>
              ) : (
                <div className="mx-auto w-fit booking-wizard-datepicker">
                  <ReactDatePicker
                    // Do not spread field as it includes a ref; Next dynamic wrapper
                    // (LoadableComponent) cannot receive refs. Pass only the bits we need.
                    selected={currentValue}
                    name={field.name}
                    onBlur={field.onBlur}
                    inline
                    locale={enUS}
                    filterDate={filterDate}
                    minDate={startOfDay(new Date())}
                    onChange={(date: Date | null) => {
                      if (date) {
                        const selected = startOfDay(date);
                        const today = startOfDay(new Date());
                        if (selected.getTime() === today.getTime()) {
                          toast.error('You can’t book for today. Please choose a later date.');
                          return;
                        }
                      }
                      field.onChange(date);
                    }}
                    onClickOutside={() => {}}
                    renderCustomHeader={(hdrProps: any) => {
                      const {
                        date,
                        decreaseMonth,
                        increaseMonth,
                        prevMonthButtonDisabled,
                        nextMonthButtonDisabled,
                      } = hdrProps;
                      return (
                        <div className="flex justify-between items-center px-3 pt-2 pb-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              decreaseMonth();
                            }}
                            disabled={prevMonthButtonDisabled}
                            aria-label="Previous month"
                            className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
                          >
                            <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
                          </button>
                          <span className="text-base font-semibold text-gray-900">
                            {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                          </span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              increaseMonth();
                            }}
                            disabled={nextMonthButtonDisabled}
                            aria-label="Next month"
                            className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
                          >
                            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                          </button>
                        </div>
                      );
                    }}
                  />
                </div>
              );
            }}
          />
        )}

      </div>
    </section>
  );
}

// Event Description
interface EventDescriptionProps {
  control: Control<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  watch: UseFormWatch<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
  onEnterNext?: () => void;
  firstInputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
}

export function EventDescriptionStep({ control, setValue, watch, open = true, onEnterNext, firstInputRef }: EventDescriptionProps) {
  const isMobile = useIsMobile();
  type ParsedDetails = { eventType?: string; date?: string; location?: string; guests?: number; venueType?: string };
  const [parsed, setParsed] = useState<ParsedDetails | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<null | { stop: () => void }>(null);
  const [descFocused, setDescFocused] = useState(false);

  const startListening = () => {
    const win = window as any;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input not supported');
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const txt = e.results[0][0].transcript;
      const current = watch('eventDescription') || '';
      setValue('eventDescription', `${current} ${txt}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };
  const stopListening = () => recognitionRef.current?.stop();

  const handleParse = async (text: string) => {
    if (!text.trim()) return;
    try {
      const res = await parseBookingText(text);
      const { event_type, venue_type, ...rest } = res.data as any;
      setParsed({
        ...rest,
        eventType: event_type,
        venueType: venue_type,
      } as ParsedDetails);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const applyParsed = () => {
    if (parsed?.date) setValue('date', new Date(parsed.date));
    if (parsed?.location) setValue('location', parsed.location as any);
    if (parsed?.guests !== undefined) setValue('guests', String(parsed.guests));
    if ((parsed as any)?.eventType) setValue('eventType', (parsed as any).eventType);
    if (parsed?.venueType) setValue('venueType', parsed.venueType as any);
    setParsed(null);
  };

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="step-title">Event Details</h3>
        <p className="step-subtitle">Tell us a little bit more about your event.</p>
      </div>
      <div className="mt-6 space-y-6">
        <Controller
          name="eventDescription"
          control={control}
          render={({ field }) => {
            const { ref, ...fieldRest } = field as any;
            return (
            <div className="space-y-2">
            <label htmlFor="event-description" className="label block">
              Describe your event
            </label>
              <div className="relative">
                <textarea
                  id="event-description"
                  rows={3}
                  className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2 pr-10"
                  maxLength={200}
                  {...fieldRest}
                  value={field.value || ''}
                  autoFocus={!isMobile}
                  ref={(el) => {
                    if (typeof ref === 'function') ref(el);
                    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                    if (firstInputRef) (firstInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                  }}
                  enterKeyHint="next"
                  onKeyDown={(e) => {
                    // On mobile, treat Enter as Next (unless Shift+Enter for newline)
                    if (e.key === 'Enter' && !e.shiftKey && onEnterNext && typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
                      e.preventDefault();
                      onEnterNext();
                    }
                  }}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  placeholder="Add date, venue, city, number of guests, vibe, special notes…"
                />
                {(() => {
                  const len = (field.value?.trim?.().length ?? 0);
                  const min = 5;
                  const shown = Math.min(len, min);
                  return (
                    <span className="absolute bottom-1 right-2 text-[10px] text-neutral-400">{shown}/{min}</span>
                  );
                })()}
              </div>
              {isMobile && descFocused && (
                <p className="help-text mt-1">↵ Shift+Enter for a new line</p>
              )}
              {/* Removed verbose helper; using subtle char counter instead */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  aria-pressed={listening}
                  aria-label={listening ? 'Stop voice to text' : 'Start voice to text'}
                  title={listening ? 'Stop recording' : 'Voice to text'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-3 py-2 text-sm border border-black/20 hover:bg-black/[0.04] focus-visible:outline-none"
                >
                  {listening ? (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="4" width="12" height="12" rx="2"/></svg>
                      <span>Stop recording</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm-7-3a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V22h-2v-2.06A9 9 0 0 1 3 11h2z"/></svg>
                      <span>Voice to text</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            );
          }}
        />
      </div>
      {parsed && (
        <div className="mt-4 mb-2 rounded-2xl border border-black/10 bg-black/[0.04] p-4">
          <p className="mb-2 font-medium text-neutral-900">AI Suggestions</p>
          <ul className="mb-3 text-sm text-neutral-800 space-y-1">
            {(parsed as any).eventType && <li><span className="text-neutral-600">Event Type:</span> {(parsed as any).eventType}</li>}
            {parsed.date && <li><span className="text-neutral-600">Date:</span> {parsed.date}</li>}
            {parsed.location && <li><span className="text-neutral-600">Location:</span> {parsed.location}</li>}
            {parsed.guests !== undefined && <li><span className="text-neutral-600">Guests:</span> {parsed.guests}</li>}
            {parsed.venueType && <li><span className="text-neutral-600">Venue Type:</span> {parsed.venueType}</li>}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyParsed}
              className="inline-flex items-center justify-center rounded-xl bg-black text-white px-3 py-2 text-sm hover:bg-black/90 focus-visible:outline-none"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              className="inline-flex items-center justify-center rounded-xl bg-white text-black px-3 py-2 text-sm border border-black/20 hover:bg-black/[0.04] focus-visible:outline-none"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Location
interface LocationProps {
  control: Control<EventDetails>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
  setValue: UseFormSetValue<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

const GoogleMap = dynamic(() => import('@react-google-maps/api').then((m) => m.GoogleMap), { ssr: false });
const Marker = dynamic(() => import('@react-google-maps/api').then((m) => m.Marker), { ssr: false });

function Map({ isLoaded, marker }: { isLoaded: boolean; marker: LatLng | null }) {
  if (!marker) return null;
  if (!isLoaded) return <div className="h-full w-full" />;
  return (
    <GoogleMap center={marker} zoom={14} mapContainerStyle={{ width: '100%', height: '100%' }} data-testid="map">
      <Marker position={marker} />
    </GoogleMap>
  );
}

function GoogleMapsLoader({ children }: { children: (isLoaded: boolean) => JSX.Element }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const api = await loadPlaces();
      if (api && mounted) setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return children(loaded);
}

export function LocationStep({ control, artistLocation, setWarning, setValue, open = true }: LocationProps) {
  const [shouldLoadMap, setShouldLoadMap] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [marker, setMarker] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const locationNameSetterRef = useRef<((val: string) => void) | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || shouldLoadMap) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShouldLoadMap(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoadMap]);

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="step-title">Location</h3>
        <p className="step-subtitle">Where is the show?</p>
      </div>
      <div className="mt-4" ref={containerRef}>
        <label className="label block mb-2">Event location</label>
        <div className="space-y-3">
          {shouldLoadMap ? (
            <GoogleMapsLoader>
              {(loaded) => (
                <>
                  <Controller
                    name="locationName"
                    control={control}
                    render={({ field }) => {
                      (locationNameSetterRef as any).current = field.onChange;
                      return (
                        <input type="hidden" name={field.name} value={field.value || ''} onChange={field.onChange} />
                      );
                    }}
                  />
                  <Controller
                    name="location"
                    control={control}
                    rules={{ validate: (v) => !!String(v || '') }}
                    render={({ field }) => (
                      <LocationInput
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        enterKeyHint="search"
                        onPlaceSelect={(place: google.maps.places.PlaceResult) => {
                          if (place.geometry?.location) {
                            setMarker({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
                          }
                          const nm = (place.name || '').toString();
                          if (locationNameSetterRef.current) locationNameSetterRef.current(nm);
                        }}
                        placeholder="Search address"
                        inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                      />)
                    }
                  />
                  <p className="help-text">Start typing to see suggestions. Pick one to drop a pin.</p>
                  {marker && (
                    <div className="mt-2 rounded-2xl overflow-hidden h-56" data-testid="map-container">
                      {loaded ? <Map isLoaded={loaded} marker={marker} /> : <div className="h-full w-full bg-gray-100 animate-pulse" />}
                    </div>
                  )}
                </>
              )}
            </GoogleMapsLoader>
          ) : (
            <>
              <Controller
                name="locationName"
                control={control}
                render={({ field }) => {
                  (locationNameSetterRef as any).current = field.onChange;
                  return (
                    <input type="hidden" name={field.name} value={field.value || ''} onChange={field.onChange} />
                  );
                }}
              />
              <Controller
                name="location"
                control={control}
                rules={{ validate: (v) => !!String(v || '') }}
                render={({ field }) => (
                  <LocationInput
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    enterKeyHint="search"
                    onPlaceSelect={(place: google.maps.places.PlaceResult) => {
                      if (place.geometry?.location) {
                        setMarker({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
                      }
                      const nm = (place.name || '').toString();
                      if (locationNameSetterRef.current) locationNameSetterRef.current(nm);
                    }}
                    placeholder="Search address"
                    inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                  />
                )}
              />
            <p className="help-text">Start typing to see suggestions. Pick one to drop a pin.</p>
            </>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="link"
        className="mt-2 text-sm inline-block min-h-[44px] px-0 text-black hover:underline underline-offset-4"
        onClick={() => {
          if (!navigator.geolocation) {
            setGeoError('Unable to fetch your location');
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setMarker(loc);
              setGeoError(null);
              (async () => {
                try {
                  const formatted = await reverseGeocode(loc);
                  const label = formatted || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
                  setValue('location', label as any, { shouldDirty: true, shouldValidate: true } as any);
                  const shortName = formatted
                    ? String(formatted).split(',')[0]?.trim() || 'My current location'
                    : 'My current location';
                  setValue('locationName', shortName as any, { shouldDirty: true } as any);
                } catch {
                  const fallbackLabel = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
                  setValue('location', fallbackLabel as any, { shouldDirty: true, shouldValidate: true } as any);
                }
              })();
            },
            () => setGeoError('Unable to fetch your location'),
          );
        }}
      >
        Use my location
      </Button>
      {geoError && <p className="text-sm text-black/80">{geoError}</p>}
    </section>
  );
}

// Event Type
export function EventTypeStep({ control, open = true }: { control: Control<EventDetails>; open?: boolean }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const options = eventTypes as string[];

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="font-bold text-neutral-900">Event Type</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">What type of event are you planning?</p>
      </div>
      <div className="mt-4">
        <Controller
          name="eventType"
          control={control}
          render={({ field }) => (
            <>
              {isMobile ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setSheetOpen(true)} className="w-full text-left min-h-[44px]" ref={buttonRef}>
                    {field.value || 'Select event type'}
                  </Button>
                  <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialFocus={firstRadioRef} title="Select event type">
                    <fieldset className="p-4 space-y-2">
                      {options.map((opt, idx) => (
                        <div key={opt}>
                          <input
                            id={`type-${opt}-mobile`}
                            ref={idx === 0 ? firstRadioRef : undefined}
                            type="radio"
                            className="selectable-card-input"
                            name={field.name}
                            value={opt}
                            checked={field.value === opt}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              setSheetOpen(false);
                            }}
                          />
                          <label htmlFor={`type-${opt}-mobile`} className="selectable-card">
                            {opt}
                          </label>
                        </div>
                      ))}
                    </fieldset>
                  </BottomSheet>
                </>
              ) : (
              <fieldset className="bw-card-grid">
                {options.map((opt) => (
                  <div key={opt}>
                      <input id={`type-${opt}`} type="radio" className="selectable-card-input" name={field.name} value={opt} checked={field.value === opt} onChange={(e) => field.onChange(e.target.value)} />
                      <label htmlFor={`type-${opt}`} className={clsx('selectable-card')}>
                        {opt}
                      </label>
                    </div>
                  ))}
                </fieldset>
              )}
            </>
          )}
        />
      </div>
    </section>
  );
}

// Guests
export function GuestsStep({ control, open = true }: { control: Control<EventDetails>; open?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="step-title">Guests</h3>
        <p className="step-subtitle">How many people?</p>
      </div>
      <div className="mt-4">
        <Controller
          name="guests"
          control={control}
          render={({ field }) => {
            const val = parseInt(field.value || '0', 10) || 0;
            const set = (n: number) => field.onChange(String(Math.max(1, n)));
            return (
              <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                <button type="button" aria-label="Decrease guests" className="rounded-xl border border-black/20 bg-white px-3 py-2 text-lg" onClick={() => set(val - 1)}>−</button>
                <input
                  type="number"
                  min={1}
                  {...field}
                  value={field.value ? String(field.value) : ''}
                  autoFocus={!isMobile}
                  className="input-base text-lg rounded-xl bg-white placeholder:text-neutral-400 focus:border-black px-3 py-2 text-center"
                />
                <button type="button" aria-label="Increase guests" className="rounded-xl border border-black/20 bg-white px-3 py-2 text-lg" onClick={() => set(val + 1)}>+</button>
              </div>
            );
          }}
        />
      </div>
    </section>
  );
}

// Venue Type
export function VenueStep({ control, open = true }: { control: Control<EventDetails>; open?: boolean }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const options = [
    { value: 'indoor', label: 'Indoor' },
    { value: 'outdoor', label: 'Outdoor' },
    { value: 'hybrid', label: 'Hybrid' },
  ];
  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="step-title">Venue Type</h3>
        <p className="step-subtitle">What type of venue is it?</p>
      </div>
      <div className="mt-4">
        <Controller
          name="venueType"
          control={control}
          render={({ field }) => (
            <>
              {isMobile ? (
                <>
                  <Button type="button" onClick={() => setSheetOpen(true)} variant="secondary" className="w-full text-left min-h-[44px] rounded-xl border border-black/20 bg-white text-black hover:bg-black/[0.04]" ref={buttonRef}>
                    {field.value ? `Venue: ${String(field.value).charAt(0).toUpperCase()}${String(field.value).slice(1)}` : 'Select venue type'}
                  </Button>
                  <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialFocus={firstRadioRef} testId="bottom-sheet" title="Select venue type">
                    <fieldset className="p-4 space-y-2">
                      {options.map((opt, idx) => (
                        <div key={opt.value}>
                          <input ref={idx === 0 ? firstRadioRef : undefined} id={`venue-${opt.value}-mobile`} type="radio" className="selectable-card-input" name={field.name} value={opt.value} checked={field.value === opt.value} onChange={(e) => { field.onChange(e.target.value); setSheetOpen(false); }} />
                          <label htmlFor={`venue-${opt.value}-mobile`} className="selectable-card">{opt.label}</label>
                        </div>
                      ))}
                    </fieldset>
                  </BottomSheet>
                </>
              ) : (
                <fieldset className="bw-card-grid">
                  {options.map((opt) => (
                    <div key={opt.value}>
                      <input id={`venue-${opt.value}`} type="radio" className="selectable-card-input" name={field.name} value={opt.value} checked={field.value === opt.value} onChange={(e) => field.onChange(e.target.value)} />
                      <label htmlFor={`venue-${opt.value}`} className="selectable-card">{opt.label}</label>
                    </div>
                  ))}
                </fieldset>
              )}
            </>
          )}
        />
      </div>
    </section>
  );
}

// Sound
export function SoundStep({
  control,
  setValue,
  open = true,
  serviceId,
  artistLocation,
  eventLocation,
}: {
  control: Control<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  open?: boolean;
  serviceId?: number;
  artistLocation?: string | null;
  eventLocation?: string | undefined;
}) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  const { details, setDetails, serviceId: ctxServiceId } = useBooking();
  const d = details as any;
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [artistOnlySound, setArtistOnlySound] = useState(false);

  // Helpers
  const set = (
    patch: Partial<
      EventDetails & {
        stageRequired?: boolean;
        stageSize?: 'S' | 'M' | 'L';
        lightingEvening?: boolean;
        backlineRequired?: boolean;
        providedSoundEstimate?: number;
        soundSupplierServiceId?: number;
      }
    >,
  ) => setDetails({ ...(details as any), ...(patch as any) });

  // Ensure a default soundMode based on service config (one-time)
  useEffect(() => {
    let cancelled = false;
    const sid = serviceId ?? ctxServiceId;
    if (!sid) return;
    if (details.sound !== 'yes') return;

    (async () => {
      try {
        const svc = await fetch(apiUrl(`/api/v1/services/${sid}`), { cache: 'force-cache' }).then((r) => r.json());
        const sp = svc?.details?.sound_provisioning || {};
        let modeDefault: string | undefined = sp.mode_default;
        // Fallback to legacy `mode` if `mode_default` is missing
        if (!modeDefault && typeof sp.mode === 'string') {
          if (sp.mode === 'external_providers' || sp.mode === 'external' || sp.mode === 'preferred_suppliers') {
            modeDefault = 'supplier';
          } else if (sp.mode === 'artist_provides_variable' || sp.mode === 'artist_provided') {
            modeDefault = 'provided_by_artist';
          }
        }
        if (modeDefault === 'external' || modeDefault === 'preferred_suppliers') modeDefault = 'supplier';
        if (!modeDefault) {
          const prefs = sp.city_preferences;
          if (Array.isArray(prefs) && prefs.length > 0) modeDefault = 'supplier';
        }
        const isLive = svc?.service_type === 'Live Performance';
        const hasCityPrefs = Array.isArray(sp.city_preferences) && sp.city_preferences.length > 0;
        const modeRaw: string | undefined = sp.mode || sp.mode_default;
        const artistOnly = isLive && !hasCityPrefs && (modeRaw === 'artist_provides_variable' || modeDefault === 'provided_by_artist' || modeRaw === 'artist_provided');
        if (!cancelled) setArtistOnlySound(!!artistOnly);
        if (!cancelled && modeDefault && !details.soundMode) {
          set({ soundMode: modeDefault as any });
          try { (setValue as any)('soundMode', modeDefault as any, { shouldDirty: false }); } catch {}
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.sound]);

  // Align soundMode to minimal choices when artist-only
  useEffect(() => {
    if (!artistOnlySound) return;
    if (details.sound === 'yes' && d.soundMode !== 'provided_by_artist') set({ soundMode: 'provided_by_artist' as any });
    if (details.sound !== 'yes' && d.soundMode !== 'none') set({ soundMode: 'none' as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistOnlySound, details.sound]);

  // Fetch & rank suppliers (supplier mode only)
  useEffect(() => {
    const sid = serviceId ?? ctxServiceId;
    if (!sid || !eventLocation) {
      setSuppliers([]);
      setLoadingSuppliers(false);
      return;
    }
    if (details.sound !== 'yes' || d.soundMode !== 'supplier') {
      setSuppliers([]);
      setLoadingSuppliers(false);
      return;
    }

    let active = true;
    setLoadingSuppliers(true);

    (async () => {
      try {
        const svc = await fetch(apiUrl(`/api/v1/services/${sid}`), { cache: 'force-cache' }).then((r) => r.json());
        const sp = svc?.details?.sound_provisioning || {};
        let prefs: any[] = Array.isArray(sp.city_preferences) ? sp.city_preferences : [];

        if (!prefs.length) {
          try {
            const pr = await fetch(apiUrl(`/api/v1/services/${sid}/sound-preferences`), { cache: 'no-store' }).then((r) => r.json());
            if (Array.isArray(pr?.city_preferences)) prefs = pr.city_preferences;
          } catch {}
        }

        // Match by city substring
        const locLower = String(eventLocation || '').toLowerCase();
        const locCityLower = locLower.split(',')[0]?.trim() || locLower;
        const findIds = (p: any): number[] =>
          (Array.isArray(p?.provider_ids) ? p.provider_ids : p?.providerIds || [])
            .map((x: any) => Number(x))
            .filter((n: number) => Number.isFinite(n));

        let match =
          prefs.find((p) => (p.city || '').toLowerCase() === locLower) ||
          prefs.find((p) => (p.city || '').toLowerCase() === locCityLower) ||
          prefs.find((p) => locLower.includes((p.city || '').toLowerCase())) ||
          prefs.find((p) => locCityLower.includes((p.city || '').toLowerCase()));

        let preferredIds: number[] = match ? findIds(match) : [];
        if (!preferredIds.length && prefs.length) {
          preferredIds = Array.from(new Set(prefs.flatMap(findIds)));
        }
        preferredIds = preferredIds.slice(0, 3);

        // Load candidates & rough distance + availability on selected date
        const candidates: { service_id: number; distance_km: number; publicName: string; available: boolean }[] = [];
        const eventDateStr = (() => {
          const dd = (details as any)?.date;
          if (!dd) return null;
          try {
            const dt = typeof dd === 'string' ? parseISO(dd) : dd;
            return format(dt, 'yyyy-MM-dd');
          } catch { return null; }
        })();
        for (const pid of preferredIds) {
          try {
            const s = await fetch(apiUrl(`/api/v1/services/${pid}`), { cache: 'force-cache' }).then((r) => r.ok ? r.json() : null);
            if (!s || !s.id) continue;
            const publicName =
              s?.details?.publicName ||
              s?.artist?.artist_profile?.business_name ||
              s?.title ||
              'Sound Provider';
            const baseLocation = s?.details?.base_location as string | undefined;
            let distance_km = 0;
            if (baseLocation && eventLocation) {
              const metrics = await getDrivingMetricsCached(baseLocation, eventLocation);
              distance_km = metrics.distanceKm || 0;
            }
            // Resolve supplier availability: call provider profile availability by user id
            let available = true;
            try {
              const providerId = Number(s?.artist?.id || s?.service_provider?.id || s?.service_provider_id);
              if (providerId && eventDateStr) {
                const av = await getServiceProviderAvailability(providerId);
                const unavailable = (av?.data?.unavailable_dates || []) as string[];
                available = !unavailable.includes(eventDateStr);
              }
            } catch {}
            candidates.push({ service_id: pid, distance_km, publicName, available });
          } catch {}
        }

        // Build rider spec (from earlier steps + this step)
        const guestCount = parseInt(d?.guests || '0', 10) || undefined;
        const rider_spec = {
          guest_count: guestCount,
          venue_type: d.venueType,
          stage_required: !!d.stageRequired,
          stage_size: d.stageRequired ? d.stageSize || 'S' : null,
          lighting_evening: !!d.lightingEvening,
          backline_required: !!d.backlineRequired,
        };

        let cards: any[] = [];
        if (candidates.length) {
          const ranked: any[] = await fetch(apiUrl(`/api/v1/pricebook/batch-estimate-rank`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rider_spec,
              guest_count: guestCount,
              candidates: candidates.map((c) => ({ service_id: c.service_id, distance_km: c.distance_km })),
              preferred_ids: preferredIds,
              managed_by_artist: d.soundMode === 'managed_by_artist',
              artist_managed_markup_percent: 0,
              outdoor: d.venueType === 'outdoor',
            }),
          }).then((r) => r.json());

          if (Array.isArray(ranked) && ranked.length) {
            cards = ranked.map((r: any) => {
              const c = candidates.find((x) => x.service_id === r.service_id);
              return {
                serviceId: r.service_id,
                publicName: c?.publicName || 'Sound Provider',
                estimateMin: Number(r.estimate_min),
                estimateMax: Number(r.estimate_max),
                reliability: r.reliability,
                distanceKm: r.distance_km,
                available: c?.available !== false,
              };
            });
          } else {
            cards = candidates.map((c) => ({
              serviceId: c.service_id,
              publicName: c.publicName,
              distanceKm: c.distance_km,
              available: c.available !== false,
            }));
          }
        }

        if (active) setSuppliers(cards);

        // Ensure a valid selected supplier:
        // - If none selected, pick first available
        // - If selected is missing from candidates or unavailable, pick first available
        try {
          const cur = Number((d as any)?.soundSupplierServiceId || 0);
          const mode = (d as any)?.soundMode;
          const needs = (details as any)?.sound === 'yes';
          if (!artistOnlySound && needs && mode === 'supplier' && cards && cards.length) {
            const found = cards.find((c: any) => Number(c.serviceId) === cur);
            const firstAvailable = cards.find((c: any) => c.available !== false);
            if (!cur || !found || found.available === false) {
              if (firstAvailable?.serviceId) set({ soundSupplierServiceId: Number(firstAvailable.serviceId) as any });
              else set({ soundSupplierServiceId: undefined as any });
            }
          }
        } catch {}

        // If "provided_by_artist", try resolve a tier estimate if available
        try {
          const tiers = sp?.provided_price_tiers as Array<{ min?: number; max?: number; price: number }> | undefined;
          if (tiers && d.soundMode === 'provided_by_artist' && guestCount) {
            const sel =
              tiers.find(
                (t) =>
                  (t.min == null || guestCount >= Number(t.min)) &&
                  (t.max == null || guestCount <= Number(t.max)),
              ) || tiers[tiers.length - 1];
            const price = sel?.price != null ? Number(sel.price) : undefined;
            if (price != null && d.providedSoundEstimate !== price) {
              set({ providedSoundEstimate: price });
            }
          }
        } catch {}
      } catch (e) {
        console.error('Failed to load suppliers', e);
      } finally {
        if (active) setLoadingSuppliers(false);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    details.sound,
    (d as any).soundMode,
    (d as any).guests,
    (d as any).venueType,
    (d as any).stageRequired,
    (d as any).stageSize,
    (d as any).lightingEvening,
    (d as any).backlineRequired,
    eventLocation,
    serviceId,
    ctxServiceId,
  ]);

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="step-title">Sound</h3>
        <p className="step-subtitle">Will sound equipment be needed?</p>
      </div>

      {/* YES/NO */}
      <div className="mt-4">
        <Controller
          name="sound"
          control={control}
          render={({ field }) => (
            <>
              {isMobile ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSheetOpen(true)}
                    className="w-full text-left min-h-[44px] rounded-xl border border-black/20 bg-white text-black hover:bg-black/[0.04]"
                    ref={buttonRef}
                  >
                    {field.value ? `Sound: ${field.value === 'yes' ? 'Yes' : 'No'}` : 'Select sound preference'}
                  </Button>
                  <BottomSheet
                    open={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    initialFocus={firstRadioRef}
                    title="Select sound preference"
                  >
                    <fieldset className="p-4 space-y-2">
                      {['yes', 'no'].map((opt, idx) => (
                        <div key={opt}>
                          <input
                            id={`sound-${opt}-mobile`}
                            ref={idx === 0 ? firstRadioRef : undefined}
                            type="radio"
                            className="selectable-card-input"
                            name={field.name}
                            value={opt}
                            checked={field.value === opt}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              if (e.target.value === 'no') {
                                // Clear related form fields and context
                                setValue('soundMode' as any, 'none' as any, { shouldDirty: true });
                                setValue('stageRequired' as any, false as any, { shouldDirty: true });
                                setValue('stageSize' as any, undefined as any, { shouldDirty: true });
                                setValue('lightingEvening' as any, false as any, { shouldDirty: true });
                                setValue('backlineRequired' as any, false as any, { shouldDirty: true });
                                set({
                                  soundMode: 'none',
                                  stageRequired: false,
                                  stageSize: undefined,
                                  lightingEvening: false,
                                  backlineRequired: false,
                                  providedSoundEstimate: undefined,
                                  soundSupplierServiceId: undefined,
                                });
                              }
                              setSheetOpen(false);
                            }}
                          />
                          <label htmlFor={`sound-${opt}-mobile`} className="selectable-card">
                            {opt === 'yes' ? 'Yes' : 'No'}
                          </label>
                        </div>
                      ))}
                    </fieldset>
                  </BottomSheet>
                </>
              ) : (
                <fieldset className="bw-card-grid">
                  {(['yes', 'no'] as const).map((opt) => (
                    <div key={opt}>
                      <input
                        id={`sound-${opt}`}
                        type="radio"
                        className="selectable-card-input"
                        name={field.name}
                        value={opt}
                        checked={field.value === opt}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          if (opt === 'no') {
                            setValue('soundMode' as any, 'none' as any, { shouldDirty: true });
                            setValue('stageRequired' as any, false as any, { shouldDirty: true });
                            setValue('stageSize' as any, undefined as any, { shouldDirty: true });
                            setValue('lightingEvening' as any, false as any, { shouldDirty: true });
                            setValue('backlineRequired' as any, false as any, { shouldDirty: true });
                            set({
                              soundMode: 'none',
                              stageRequired: false,
                              stageSize: undefined,
                              lightingEvening: false,
                              backlineRequired: false,
                              providedSoundEstimate: undefined,
                              soundSupplierServiceId: undefined,
                            });
                          }
                        }}
                      />
                      <label htmlFor={`sound-${opt}`} className="selectable-card">
                        {opt === 'yes' ? 'Yes' : 'No'}
                      </label>
                    </div>
                  ))}
                </fieldset>
              )}
            </>
          )}
        />
      </div>

      {/* If no sound needed, exit early */}
      {details.sound !== 'yes' && (
        <p className="help-text mt-3">You can still add sound after submitting your request.</p>
      )}

      {/* When sound = yes */}
      {details.sound === 'yes' && (
        <div className="mt-6 space-y-6">
          {/* HOW should sound be handled? */}
          {!artistOnlySound && (
          <div>
            <label className="label block mb-2">How should sound be handled?</label>
            <Controller
              name="soundMode"
              control={control}
              render={({ field }) => (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { v: 'supplier', l: 'External supplier (recommended)' },
                      { v: 'provided_by_artist', l: 'Provided by artist' },
                      { v: 'managed_by_artist', l: 'Managed by artist' },
                      { v: 'client_provided', l: 'Client will provide' },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => field.onChange(o.v)}
                        className={clsx(
                          'rounded-full border px-3 py-1 text-sm',
                          field.value === o.v
                            ? 'border-black bg-black/5'
                            : 'border-black/20 hover:bg-black/[0.04]',
                        )}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <p className="help-text mt-1">
                    We’ll use your guest count ({(d as any).guests || '—'}) and venue type ({(d as any).venueType || '—'}) to size the PA.
                  </p>
                </>
              )}
            />
          </div>
          )}

          {/* Context toggles: Stage / Lighting / Backline */}
          {!artistOnlySound && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Stage */}
            <div className="rounded-xl border border-black/10 p-3">
              <Controller
                name={'stageRequired' as any}
                control={control}
                render={({ field }) => (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Stage required?</span>
                      <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </div>
                    {field.value && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium mb-1">Stage size</label>
                        <Controller
                          name={'stageSize' as any}
                          control={control}
                          render={({ field: sizeField }) => (
                            <div className="flex gap-2">
                              {(['S', 'M', 'L'] as const).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => sizeField.onChange(s)}
                                  className={clsx(
                                    'rounded-full border px-2 py-1 text-xs',
                                    sizeField.value === s ? 'border-black bg-black/5' : 'border-black/20 hover:bg-black/[0.04]',
                                  )}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        />
                      </div>
                    )}
                    <p className="help-text mt-2">Only required if you need a raised platform.</p>
                  </>
                )}
              />
            </div>

            {/* Lighting */}
            <div className="rounded-xl border border-black/10 p-3">
              <Controller
                name={'lightingEvening' as any}
                control={control}
                render={({ field }) => (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Evening lighting?</span>
                      <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </div>
                    <p className="help-text mt-2">
                      Basic or advanced lighting may be added depending on the selected package and time of day.
                    </p>
                    {Boolean(field.value) && (
                      <Controller
                        name={'lightingUpgradeAdvanced' as any}
                        control={control}
                        render={({ field: f2 }) => (
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-sm">Upgrade to Advanced lighting</span>
                            <input
                              type="checkbox"
                              checked={!!f2.value}
                              onChange={(e) => f2.onChange(e.target.checked)}
                            />
                          </div>
                        )}
                      />
                    )}
                  </>
                )}
              />
            </div>

            {/* Backline */}
            <div className="rounded-xl border border-black/10 p-3">
              <Controller
                name={'backlineRequired' as any}
                control={control}
                render={({ field }) => (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Backline required?</span>
                      <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </div>
                    <p className="help-text mt-2">
                      Instruments/amps on site (e.g., drum kit, piano, guitar/bass amps). Final lineup confirmed after booking.
                    </p>
                  </>
                )}
              />
            </div>
          </div>
          )}

          {/* Mode-specific helper text */}
          {!artistOnlySound && (d as any).soundMode === 'provided_by_artist' && (
            <div className="mt-2 rounded-lg bg-black/[0.04] p-3 text-sm text-neutral-800 border border-black/10">
              Sound provided by the artist.{' '}
              {(d as any).providedSoundEstimate != null
                ? `Est. ${formatCurrency((d as any).providedSoundEstimate)} (based on audience tier).`
                : 'Price confirmed on acceptance.'}
            </div>
          )}
          {!artistOnlySound && (d as any).soundMode === 'managed_by_artist' && (
            <div className="mt-2 rounded-lg bg-black/[0.04] p-3 text-sm text-neutral-800 border border-black/10">
              Sound managed by the artist. We’ll confirm a firm price with the top supplier and apply the artist’s markup policy.
            </div>
          )}
          {!artistOnlySound && (d as any).soundMode === 'client_provided' && (
            <div className="mt-2 rounded-lg bg-black/[0.04] p-3 text-sm text-neutral-800 border border-black/10">
              You’ll provide sound (PA, mics, console, engineer). The artist will share a tech rider after acceptance.
            </div>
          )}

          {/* Supplier card (supplier mode) */}
          {!artistOnlySound && (d as any).soundMode === 'supplier' && (
            <>
              {loadingSuppliers && <p className="text-sm text-neutral-600">Loading preferred suppliers…</p>}

              {!loadingSuppliers && suppliers.length > 0 && (
                (() => {
                  const firstAvailable = suppliers.find((s: any) => s.available !== false) || suppliers[0];
                  const anyAvailable = suppliers.some((s: any) => s.available !== false);
                  return (
                    <div className="mt-3">
                      {anyAvailable ? (
                        <div className="selectable-card flex-col items-start">
                          <span className="font-medium text-neutral-900">
                            Recommended · {firstAvailable.publicName}
                          </span>
                          <span className="text-sm text-neutral-600">
                            {firstAvailable.estimateMin != null && firstAvailable.estimateMax != null
                              ? `Est. ${formatCurrency(firstAvailable.estimateMin)} – ${formatCurrency(firstAvailable.estimateMax)}`
                              : 'Estimation pending'}
                          </span>
                          {firstAvailable.distanceKm != null && (
                            <span className="text-xs text-neutral-500">
                              {firstAvailable.distanceKm!.toFixed(0)} km • rel {firstAvailable.reliability?.toFixed?.(1) ?? '0'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-black/10 bg-yellow-50 p-3 text-sm text-yellow-900">
                          None of the artist’s preferred suppliers shows as available on your date. You can still submit the booking — we’ll source an alternative.
                        </div>
                      )}
                      <p className="mt-2 text-xs text-neutral-700">
                        These are the artist’s preferred suppliers. We’ll contact the top match after you book.
                      </p>
                    </div>
                  );
                })()
              )}

              {!loadingSuppliers && suppliers.length === 0 && (
                <p className="text-sm text-neutral-600">We’ll match a suitable sound supplier after you book. You can also add sound later.</p>
              )}
            </>
          )}

          {!artistOnlySound && (
            <p className="text-xs text-neutral-600">
              Estimates use your guest count and assume drive-only logistics. Final pricing is confirmed after acceptance; if the top pick
              declines we’ll auto-try backups.
            </p>
          )}
        </div>
      )}
    </section>
  );
}


// Notes
export function NotesStep({ control, setValue, open = true }: { control: Control<EventDetails>; setValue: UseFormSetValue<EventDetails>; open?: boolean }) {
  const isMobile = useIsMobile();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notesFocused, setNotesFocused] = useState(false);
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      const res = await uploadBookingAttachment(formData, (evt) => { if (evt.total) setProgress(Math.round((evt.loaded * 100) / evt.total)); });
      if (res?.data?.url) { setValue('attachment_url', res.data.url); toast.success('Attachment uploaded'); }
    } catch { toast.error('Failed to upload attachment'); }
    finally { setUploading(false); setProgress(0); }
  }
  return (
    <section className="wizard-step-container space-y-3">
      <div>
        <h3 className="step-title">Notes</h3>
        <p className="step-subtitle">Anything else we should know?</p>
      </div>
      <div className="mt-2 space-y-3">
        <Controller name="notes" control={control} render={({ field }) => (
          <>
            <textarea
              rows={3}
              {...field}
              value={field.value ? String(field.value) : ''}
              autoFocus={!isMobile}
              className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black min-h-[120px] px-3 py-2"
              onFocus={() => setNotesFocused(true)}
              onBlur={() => setNotesFocused(false)}
            />
            {isMobile && notesFocused && (
              <p className="help-text mt-1">↵ Shift+Enter for a new line</p>
            )}
          </>
        )} />
        <Controller name="attachment_url" control={control} render={({ field }) => <input type="hidden" {...field} value={field.value ? String(field.value) : ''} />} />
        <label className="label block">Attachment (optional)</label>
        <input type="file" aria-label="Upload attachment" className="block w-full rounded-xl border border-black/20 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:bg-black/[0.02] focus:outline-none" onChange={handleFileChange} />
        {uploading && (
          <div className="flex items-center gap-2 mt-2" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}%`} aria-live="polite">
            <div className="w-full bg-black/10 rounded h-2"><div className="bg-black h-2 rounded" style={{ width: `${progress}%` }} /></div>
            <span className="text-xs text-black/70">{progress}%</span>
          </div>
        )}
      </div>
    </section>
  );
}

// Review
export function ReviewStep(props: {
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
  calculatedPrice: number | null;
  travelResult: TravelResult | null;
  baseServicePrice: number;
  soundCost: number;
  soundMode?: string | null;
  soundModeOverridden?: boolean;
  selectedSupplierName?: string;
  servicePriceItems?: { key: string; label: string; amount: number }[] | null;
  serviceCategorySlug?: string;
  open?: boolean;
  onToggle?: () => void;
  providerVatRegistered?: boolean;
  providerVatRate?: number | null;
  needTaxInvoice?: boolean;
  onToggleTaxInvoice?: (checked: boolean) => void;
  clientCompanyName?: string;
  clientVatNumber?: string;
  clientBillingAddress?: string;
  onChangeClientCompanyName?: (value: string) => void;
  onChangeClientVatNumber?: (value: string) => void;
  onChangeClientBillingAddress?: (value: string) => void;
}) {
  const {
    isLoadingReviewData,
    reviewDataError,
    travelResult,
    submitting,
    onNext,
    submitLabel = 'Submit Request',
    baseServicePrice,
    soundCost,
    soundMode,
    open = true,
    onToggle = () => {},
    providerVatRegistered,
    providerVatRate,
    needTaxInvoice,
    onToggleTaxInvoice,
    clientCompanyName,
    clientVatNumber,
    clientBillingAddress,
    onChangeClientCompanyName,
    onChangeClientVatNumber,
    onChangeClientBillingAddress,
  } = props;

  const { details } = useBooking();
  const d = details as any;

  const baseFee = Number(baseServicePrice) || 0;
  const travelCost = Number(travelResult?.totalCost) || 0;
  const soundFee = Number(soundCost) || 0;
  const subtotalBeforeTaxes = baseFee + travelCost + soundFee;
  const subtotalForPreview = subtotalBeforeTaxes;
  // Fetch backend-only fee/VAT preview for the current subtotal/total
  const [platformFeeIncl, setPlatformFeeIncl] = React.useState<number | null>(null);
  const [estimatedTotal, setEstimatedTotal] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Use the best available subtotal snapshot for preview.
        // Prefer calculatedPrice when provided (includes async travel/discounts),
        // otherwise fall back to the basic subtotal we have locally.
        const subtotal = Number(subtotalForPreview);
        let total = Number(subtotalForPreview);
        const vatRate = (props.providerVatRegistered && typeof props.providerVatRate === 'number' && props.providerVatRate > 0)
          ? (props.providerVatRate! > 1 ? (props.providerVatRate! / 100) : props.providerVatRate!)
          : (props.providerVatRegistered ? 0.15 : 0);
        if (props.providerVatRegistered && Number.isFinite(vatRate) && vatRate > 0) {
          total = subtotal + (subtotal * vatRate);
        }
        if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(total) || total <= 0) {
          setPlatformFeeIncl(null);
          setEstimatedTotal(null);
          return;
        }
        const pv = await getQuoteTotalsPreview({ subtotal, total });
        if (cancelled) return;
        const toNum = (v: unknown): number | undefined => {
          const n = Number(v as any);
          return Number.isFinite(n) ? n : undefined;
        };
        const feeEx = toNum((pv as any)?.platform_fee_ex_vat);
        const feeVat = toNum((pv as any)?.platform_fee_vat);
        const feeIncl = (typeof feeEx === 'number' && typeof feeVat === 'number') ? (feeEx + feeVat) : null;
        setPlatformFeeIncl(Number.isFinite(feeIncl as number) ? (feeIncl as number) : null);
        const clientTotal = toNum((pv as any)?.client_total_incl_vat) ?? null;
        setEstimatedTotal(Number.isFinite(clientTotal as number) ? (clientTotal as number) : null);
      } catch {
        if (cancelled) return;
        setPlatformFeeIncl(null);
        setEstimatedTotal(null);
      }
    })();
    return () => { cancelled = true; };
  }, [subtotalForPreview, providerVatRegistered, providerVatRate]);
  const isProcessing = submitting || isLoadingReviewData;
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const buttonLabel = (() => {
    if (isLoadingReviewData && !submitting) return 'Calculating estimates...';
    if (submitting && submitLabel === 'Submit Request') return 'Submitting...';
    if (submitting) return 'Loading...';
    return submitLabel;
  })();

  // Tiny sound-context summary
  const tinyStage = d?.stageRequired ? (d.stageSize || 'S') : 'no';
  const tinyBackline = d?.backlineRequired ? 'yes' : 'no';
  const tinyLighting = d?.lightingEvening ? 'yes' : 'no';
  const tinySummary = `Stage: ${tinyStage} · Backline: ${tinyBackline} · Lighting: ${tinyLighting}`;

  const getTravelPopoverContent = () => {
    if (!travelResult) return <>Travel cost calculated from artist location and venue distance.</>;
    const { mode, breakdown } = travelResult;
    if (mode === 'fly' && breakdown.fly) {
      const fly = breakdown.fly;
      return (
        <>
          Travel Mode: ✈️ Fly
          <br />
          Flights ({fly.travellers}): {formatCurrency(fly.flightSubtotal)} (avg)
          <br />
          Car Rental: {formatCurrency(fly.carRental)}
          <br />
          Fuel/Transfers: {formatCurrency(fly.transferCost)}
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
      {/* No extra wrapper container */}
      {isLoadingReviewData && (
        <div className="flex items-center justify-center p-3 bg-black/[0.04] text-black rounded-lg border border-black/10">
          <span className="animate-spin mr-2">⚙️</span> Calculating estimates...
        </div>
      )}
      {reviewDataError && (
        <div className="p-3 bg-black/[0.04] text-black rounded-lg border border-black/10">
          <p className="font-medium">Error calculating estimates:</p>
          <p className="text-sm">{reviewDataError}</p>
          <p className="text-xs mt-2 text-neutral-600">Please ensure all location details are accurate.</p>
        </div>
      )}

      <div className="mb-2">
        <SummarySidebar />
      </div>

      <h5 className="font-semibold text-base text-neutral-900">Estimated Cost</h5>
      <div className="space-y-2 text-neutral-800">
        {Array.isArray(props.servicePriceItems) && props.servicePriceItems.length > 0 ? (
          <div className="space-y-1">
            {props.servicePriceItems.map((li) => (
              <div key={li.key} className="flex justify-between items-center">
                <span>{li.label}</span>
                <span>{formatCurrency(li.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center border-t border-dashed pt-2 mt-2 border-black/20">
              <span className="font-medium">Service Subtotal</span>
              <span className="font-medium">{formatCurrency(baseServicePrice)}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <span>Service Provider Base Fee</span>
            <span>{formatCurrency(baseServicePrice)}</span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="flex items-center">
            Travel
            <InfoPopover label="Travel cost details" className="ml-1.5">
              {getTravelPopoverContent()}
            </InfoPopover>
          </span>
          <span>{formatCurrency(travelResult?.totalCost || 0)}</span>
        </div>

        {(d?.sound === 'yes') && (
          <div className="flex items-center justify-between">
            <span className="flex items-center">
              Sound Equipment <span className="ml-1 text-[11px] text-neutral-500">({tinySummary})</span>
              <InfoPopover label="Sound equipment details" className="ml-1.5">
                <>
                  {tinySummary}
                  <br />
                  {soundMode === 'managed_by_artist'
                    ? 'Managed by the artist with a simple markup policy.'
                    : soundMode === 'provided_by_artist'
                    ? 'Provided by the artist directly; price is firm on acceptance.'
                    : soundMode === 'client_provided'
                    ? 'You will provide sound equipment; no supplier outreach required.'
                    : 'External provider estimate (drive-only). A supplier will confirm a firm price.'}
                </>
              </InfoPopover>
            </span>
            <span>{formatCurrency(soundFee)}</span>
          </div>
        )}

        <div className="flex justify-between items-center border-t border-dashed pt-2 mt-2 border-black/20">
          <span className="font-medium">Subtotal</span>
          <span className="font-medium">{formatCurrency(subtotalBeforeTaxes)}</span>
        </div>
        {providerVatRegistered && (
          <div className="flex justify-between items-center">
            <span>Provider VAT</span>
            <span>{formatCurrency(subtotalForPreview * ((typeof providerVatRate === 'number' && providerVatRate > 0) ? (providerVatRate > 1 ? (providerVatRate / 100) : providerVatRate) : 0.15))}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span>Booka Service Fee (3% - VAT included)</span>
          <span>
            {typeof platformFeeIncl === 'number' && Number.isFinite(platformFeeIncl)
              ? formatCurrency(platformFeeIncl)
              : QUOTE_TOTALS_PLACEHOLDER}
          </span>
        </div>
        <div className="flex justify-between items-center text-xl font-bold text-neutral-900 border-t pt-3 mt-3 border-black/20">
          <span>Total To Pay</span>
          <span>
            {estimatedTotal !== null ? formatCurrency(estimatedTotal) : QUOTE_TOTALS_PLACEHOLDER}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Final Booka fees and VAT are confirmed at submission to stay aligned with the quote you'll review in chat.
        </p>
      </div>

      <div className="mt-6">
        <div className="flex items-start space-x-3 mb-4">
          <input
            type="checkbox"
            id="terms"
            className="mt-1 h-3 w-3 bg-black rounded border-black/30 text-black"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <label htmlFor="terms" className="help-text">
            I have reviewed my details and agree to the{' '}
            <a href="#" className="text-black underline hover:underline underline-offset-4">
              terms of service
            </a>.
          </label>
        </div>
        {providerVatRegistered && (
          <>
            <div className="flex items-start space-x-3 mb-4">
              <input
                type="checkbox"
                id="tax-invoice"
                className="mt-1 h-3 w-3 bg-black rounded border-black/30 text-black"
                checked={!!needTaxInvoice}
                onChange={(e) => onToggleTaxInvoice?.(e.target.checked)}
              />
              <label htmlFor="tax-invoice" className="help-text">
                I need a Tax Invoice for my business
              </label>
            </div>
            {needTaxInvoice && (
              <div className="mb-4 rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-2">Business billing (optional)</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Provide your company details if you need a Tax Invoice from the supplier. These details will be attached to your booking.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600">Company name</label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={clientCompanyName ?? ''}
                      onChange={(e) => onChangeClientCompanyName?.(e.target.value)}
                      placeholder="XYZ Corp (Pty) Ltd"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Company VAT number</label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={clientVatNumber ?? ''}
                      onChange={(e) => onChangeClientVatNumber?.(e.target.value)}
                      placeholder="4XXXXXXXXX"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-600">Billing address</label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={clientBillingAddress ?? ''}
                      onChange={(e) => onChangeClientBillingAddress?.(e.target.value)}
                      placeholder="456 Business Park, Sandton, 2196"
                    />
                  </div>
                  <div className="sm:col-span-2 text-xs text-gray-500">
                    We’ll attach these details to your booking and pass them to the supplier’s Tax Invoice.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <Button
          variant="primary"
          fullWidth
          isLoading={isProcessing}
          disabled={reviewDataError !== null || travelResult === null || !acceptedTerms}
          onClick={(e) => {
            trackEvent('booking_submit');
            void props.onNext(e);
          }}
          className="rounded-xl bg-black text-white hover:bg-black/90"
        >
          {buttonLabel}
        </Button>
        <p className="text-xs text-neutral-600 mt-3">
          Artist must accept this request. Once accepted, your artist booking is confirmed. Sound is usually confirmed within a few hours; if the top pick declines we auto-try backups. If all decline, you can choose another option.
        </p>
      </div>
    </CollapsibleSection>
  );
}
