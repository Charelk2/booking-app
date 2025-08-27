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
import { EventDetails, useBooking } from '@/contexts/BookingContext';
import { loadPlaces } from '@/lib/loadPlaces';
import { LatLng } from '@/lib/geo';
import eventTypes from '@/data/eventTypes.json';
import toast from '@/components/ui/Toast';
import { parseBookingText, uploadBookingAttachment } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { getDrivingMetrics, TravelResult } from '@/lib/travel';
import SummarySidebar from '../SummarySidebar';
import { trackEvent } from '@/lib/analytics';

// Inline DateTimeStep to avoid per-file CSS imports; styles live in wizard.css
const ReactDatePicker: any = dynamic(() => import('react-datepicker'), { ssr: false });

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
    const day = format(date, 'yyyy-MM-dd');
    const today = startOfDay(new Date());
    return !unavailable.includes(day) && !isBefore(date, today);
  };

  return (
    <section className="wizard-step-container wizard-step-container-date booking-wizard-step">
      <div>
        <h3 className="font-bold text-neutral-900">Date & Time</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">When should we perform?</p>
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
                    onChange={(e) => field.onChange(e.target.value)}
                    inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                  />
                  {!currentValue && (
                    <p className="text-xs text-neutral-500 mt-1">Choose a date to continue.</p>
                  )}
                </>
              ) : (
                <div className="mx-auto w-fit booking-wizard-datepicker">
                  <ReactDatePicker
                    {...field}
                    selected={currentValue}
                    inline
                    locale={enUS}
                    filterDate={filterDate}
                    minDate={startOfDay(new Date())}
                    onChange={(date: Date | null) => field.onChange(date)}
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

        <div className="mt-4 max-w-sm">
          <label className="block text-sm font-medium text-neutral-900 mb-1">Start time (optional)</label>
          <Controller
            name="time"
            control={control}
            render={({ field }) => (
              <input
                type="time"
                {...field}
                value={field.value || ''}
                className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
              />
            )}
          />
        </div>
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
}

export function EventDescriptionStep({ control, setValue, watch, open = true }: EventDescriptionProps) {
  const isMobile = useIsMobile();
  type ParsedDetails = { eventType?: string; date?: string; location?: string; guests?: number };
  const [parsed, setParsed] = useState<ParsedDetails | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<null | { stop: () => void }>(null);

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
      const { event_type, ...rest } = res.data;
      setParsed({ ...rest, eventType: event_type } as any);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const applyParsed = () => {
    if (parsed?.date) setValue('date', new Date(parsed.date));
    if (parsed?.location) setValue('location', parsed.location as any);
    if (parsed?.guests !== undefined) setValue('guests', String(parsed.guests));
    if ((parsed as any)?.eventType) setValue('eventType', (parsed as any).eventType);
    setParsed(null);
  };

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="font-bold text-neutral-900">Event Details</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">Tell us a little bit more about your event.</p>
      </div>
      <div className="mt-6 space-y-6">
        <Controller
          name="eventDescription"
          control={control}
          render={({ field }) => (
            <div className="space-y-2">
              <label htmlFor="event-description" className="block text-sm font-medium text-neutral-900">
                Describe your event
              </label>
              <textarea
                id="event-description"
                rows={3}
                className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                {...field}
                value={field.value || ''}
                autoFocus={!isMobile}
                placeholder="Add date, venue, city, number of guests, vibe, special notes…"
              />
              {(!field.value || (field.value?.trim()?.length ?? 0) < 5) && (
                <p className="text-xs text-neutral-500">Add a short description to continue.</p>
              )}
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
          )}
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

export function LocationStep({ control, artistLocation, setWarning, open = true }: LocationProps) {
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
        <h3 className="font-bold text-neutral-900">Location</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">Where is the show?</p>
      </div>
      <div className="mt-4" ref={containerRef}>
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
                      return null;
                    }}
                  />
                  <Controller
                    name="location"
                    control={control}
                    render={({ field }) => (
                      <LocationInput
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
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
                  return null;
                }}
              />
              <Controller
                name="location"
                control={control}
                render={({ field }) => (
                  <LocationInput
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
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
            </>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="link"
        className="mt-2 text-sm inline-block min-h-[44px] px-0 text-black hover:underline underline-offset-4"
        onClick={() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setMarker(loc);
              setGeoError(null);
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
                <fieldset className="grid grid-cols-1 gap-[clamp(0.5rem,2vw,1rem)] @md:grid-cols-2 @lg:grid-cols-4">
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
        <h3 className="font-bold text-neutral-900">Guests</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">How many people?</p>
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
        <h3 className="font-bold text-neutral-900">Venue Type</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">What type of venue is it?</p>
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
                <fieldset className="space-y-2">
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
export function SoundStep({ control, open = true, serviceId, artistLocation, eventLocation }: { control: Control<EventDetails>; open?: boolean; serviceId?: number; artistLocation?: string | null; eventLocation?: string | undefined }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const { details, setDetails, serviceId: ctxServiceId } = useBooking();
  const [backlineRequired, setBacklineRequired] = useState<boolean>(false);
  const [lightingEvening, setLightingEvening] = useState<boolean>(false);
  const [stageNeeded, setStageNeeded] = useState<boolean>(false);
  const [stageSize, setStageSize] = useState<string>('S');

  useEffect(() => {
    const run = async () => {
      const sid = serviceId ?? ctxServiceId;
      if (!sid || !eventLocation) return;
      setLoadingSuppliers(true);
      try {
        const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const svc = await fetch(`${api}/api/v1/services/${sid}`, { cache: 'force-cache' }).then((r) => r.json());
        const svcDetails = (svc && svc.details) || {};

        let modeDefault = svcDetails?.sound_provisioning?.mode_default as string | undefined;
        if (modeDefault === 'external' || modeDefault === 'preferred_suppliers') modeDefault = 'supplier';
        if (!details?.soundMode && modeDefault && details.sound === 'yes') {
          setDetails({ ...details, soundMode: modeDefault as any });
        }
        if (!details?.soundMode && details.sound === 'yes') {
          const tmpPrefs = svcDetails.sound_provisioning?.city_preferences;
          if (Array.isArray(tmpPrefs) && tmpPrefs.length > 0) {
            setDetails({ ...details, soundMode: 'supplier' });
          }
        }

        let prefs = (svcDetails.sound_provisioning?.city_preferences || []) as any[];
        if (!Array.isArray(prefs) || prefs.length === 0) {
          try {
            const pr = await fetch(`${api}/api/v1/services/${serviceId}/sound-preferences`, { cache: 'no-store' }).then((r) => r.json());
            if (Array.isArray(pr?.city_preferences)) prefs = pr.city_preferences as any;
          } catch {}
        }

        const locLower = String(eventLocation || '').toLowerCase();
        const locCityLower = locLower.split(',')[0]?.trim() || locLower;
        const findIds = (p: any): number[] => {
          const ids = (p?.provider_ids || p?.providerIds || []) as number[];
          return Array.isArray(ids) ? ids.map((x) => Number(x)).filter((x) => !Number.isNaN(x)) : [];
        };
        let match =
          prefs.find((p) => (p.city || '').toLowerCase() === locLower) ||
          prefs.find((p) => (p.city || '').toLowerCase() === locCityLower) ||
          prefs.find((p) => locLower.includes((p.city || '').toLowerCase())) ||
          prefs.find((p) => locCityLower.includes((p.city || '').toLowerCase()));

        let preferredIds: number[] = [];
        if (match) preferredIds = findIds(match);
        if (preferredIds.length === 0 && prefs.length > 0) {
          const all = prefs.flatMap((p) => findIds(p));
          preferredIds = Array.from(new Set(all));
        }
        preferredIds = preferredIds.slice(0, 3);

        const candidates: { service_id: number; distance_km: number; publicName: string }[] = [];
        for (const pid of preferredIds) {
          const s = await fetch(`${api}/api/v1/services/${pid}`, { cache: 'force-cache' }).then((r) => r.json());
          const publicName = s?.details?.publicName || s?.artist?.artist_profile?.business_name || s?.title || 'Sound Provider';
          const baseLocation = s?.details?.base_location as string | undefined;
          let distance_km = 0;
          if (baseLocation && eventLocation) {
            const metrics = await getDrivingMetrics(baseLocation, eventLocation);
            distance_km = metrics.distanceKm || 0;
          }
          candidates.push({ service_id: pid, distance_km, publicName });
        }

        const guestCount = parseInt(details?.guests || '0', 10) || undefined;
        let cards: any[] = [];
        if (candidates.length > 0) {
          const ranked: any[] = await fetch(`${api}/api/v1/pricebook/batch-estimate-rank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rider_spec: {},
              guest_count: guestCount,
              candidates: candidates.map((c) => ({ service_id: c.service_id, distance_km: c.distance_km })),
              preferred_ids: preferredIds,
              managed_by_artist: details.soundMode === 'managed_by_artist',
              artist_managed_markup_percent: 0,
              backline_required: backlineRequired,
              lighting_evening: lightingEvening,
              outdoor: details.venueType === 'outdoor',
              stage_size: stageNeeded ? stageSize : null,
            }),
          }).then((r) => r.json());

          if (Array.isArray(ranked) && ranked.length > 0) {
            cards = ranked.map((r: any) => {
              const c = candidates.find((x) => x.service_id === r.service_id);
              return {
                serviceId: r.service_id,
                publicName: c?.publicName || 'Sound Provider',
                estimateMin: Number(r.estimate_min),
                estimateMax: Number(r.estimate_max),
                reliability: r.reliability,
                distanceKm: r.distance_km,
              };
            });
          } else {
            cards = candidates.map((c) => ({ serviceId: c.service_id, publicName: c.publicName, distanceKm: c.distance_km }));
          }
        }
        setSuppliers(cards);

        try {
          const tiers = svcDetails?.sound_provisioning?.provided_price_tiers as Array<{ min?: number; max?: number; price: number }> | undefined;
          if (tiers && details.soundMode === 'provided_by_artist' && guestCount) {
            const sel = tiers.find((t) => (t.min == null || guestCount >= Number(t.min)) && (t.max == null || guestCount <= Number(t.max))) || tiers[tiers.length - 1];
            if (sel?.price != null) setDetails({ ...details, providedSoundEstimate: Number(sel.price) });
          }
        } catch {}
      } catch (e) {
        console.error('Failed to load preferred suppliers', e);
      } finally {
        setLoadingSuppliers(false);
      }
    };
    void run();
  }, [serviceId, eventLocation, details.soundMode, backlineRequired, lightingEvening, stageNeeded, stageSize, ctxServiceId, details, setDetails]);

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="font-bold text-neutral-900">Sound</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">Will sound equipment be needed?</p>
      </div>
      <div className="mt-6">
        <p className="text-sm text-neutral-600 mb-3">
          Book in one step. The artist must accept to confirm your date. If you choose sound,
          we’ll contact the artist’s preferred suppliers (top match first) to confirm a firm price.
          Estimates below use drive-only logistics and your guest count; final pricing may vary.
        </p>

        <Controller
          name="sound"
          control={control}
          render={({ field }) => (
            <>
              {isMobile ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setSheetOpen(true)} className="w-full text-left min-h-[44px] rounded-xl border border-black/20 bg-white text-black hover:bg-black/[0.04]" ref={buttonRef}>
                    {field.value ? `Sound: ${field.value === 'yes' ? 'Yes' : 'No'}` : 'Select sound preference'}
                  </Button>
                  <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialFocus={firstRadioRef} title="Select sound preference">
                    <fieldset className="p-4 space-y-2">
                      {['yes', 'no'].map((opt, idx) => (
                        <div key={opt}>
                          <input id={`sound-${opt}-mobile`} ref={idx === 0 ? firstRadioRef : undefined} type="radio" className="selectable-card-input" name={field.name} value={opt} checked={field.value === opt} onChange={(e) => { field.onChange(e.target.value); setSheetOpen(false); }} />
                          <label htmlFor={`sound-${opt}-mobile`} className="selectable-card">{opt === 'yes' ? 'Yes' : 'No'}</label>
                        </div>
                      ))}
                    </fieldset>
                  </BottomSheet>
                </>
              ) : (
                <fieldset className="space-y-2">
                  <div>
                    <input id="sound-yes" type="radio" className="selectable-card-input" name={field.name} value="yes" checked={field.value === 'yes'} onChange={(e) => field.onChange(e.target.value)} />
                    <label htmlFor="sound-yes" className="selectable-card">Yes</label>
                  </div>
                  <div>
                    <input id="sound-no" type="radio" className="selectable-card-input" name={field.name} value="no" checked={field.value === 'no'} onChange={(e) => field.onChange(e.target.value)} />
                    <label htmlFor="sound-no" className="selectable-card">No</label>
                  </div>
                </fieldset>
              )}
            </>
          )}
        />

        <Controller name="soundSupplierServiceId" control={control} render={() => (
          <>
            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'provided_by_artist' && (
              <div className="mt-3 rounded-lg bg-black/[0.04] p-3 text-sm text-neutral-800 border border-black/10">
                Sound provided by the artist.{' '}
                {useBooking().details.providedSoundEstimate != null ? `Est. ${formatCurrency(useBooking().details.providedSoundEstimate)}.` : 'Final price will be confirmed on acceptance.'}
              </div>
            )}

            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'managed_by_artist' && (
              <div className="mt-3 rounded-lg bg-black/[0.04] p-3 text-sm text-neutral-800 border border-black/10">
                Sound managed by the artist. We’ll confirm a firm price with the top supplier and apply the artist’s markup policy.
              </div>
            )}

            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'supplier' && loadingSuppliers && (
              <p className="text-sm text-neutral-600 mt-2">Loading preferred suppliers…</p>
            )}

            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'supplier' && !loadingSuppliers && suppliers.length > 0 && (
              <div className="mt-4">
                <div className="selectable-card flex-col items-start">
                  <span className="font-medium text-neutral-900">Recommended · {suppliers[0].publicName}</span>
                  <span className="text-sm text-neutral-600">
                    {suppliers[0].estimateMin != null && suppliers[0].estimateMax != null
                      ? `Est. ${formatCurrency(suppliers[0].estimateMin)} – ${formatCurrency(suppliers[0].estimateMax)}`
                      : 'Estimation pending'}
                  </span>
                  {suppliers[0].distanceKm != null && (
                    <span className="text-xs text-neutral-500">{suppliers[0].distanceKm!.toFixed(0)} km • rel {suppliers[0].reliability?.toFixed?.(1) ?? '0'}</span>
                  )}
                </div>
              </div>
            )}

            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'supplier' && !loadingSuppliers && suppliers.length === 0 && (
              <p className="text-sm text-neutral-600 mt-2">We’ll match a suitable sound supplier after you book. You can also add sound later.</p>
            )}

            {useBooking().details.sound === 'yes' && useBooking().details.soundMode === 'supplier' && suppliers.length > 0 && (
              <div className="mt-3 rounded-lg bg-black/[0.04] p-3 text-xs text-neutral-700 border border-black/10">
                These suppliers are configured by the artist. We’ll reach out on your behalf after you secure the musician and confirm a firm price via the top match first.
              </div>
            )}
          </>
        )} />

        <div className="mt-3 text-xs text-neutral-600">
          Final price is confirmed after acceptance; if the top pick declines we’ll auto-try backups.
          If all decline, you can choose another option and we’ll refund any sound portion immediately.
        </div>
      </div>
    </section>
  );
}

// Notes
export function NotesStep({ control, setValue, open = true }: { control: Control<EventDetails>; setValue: UseFormSetValue<EventDetails>; open?: boolean }) {
  const isMobile = useIsMobile();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
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
        <h3 className="font-bold text-neutral-900">Notes</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">Anything else we should know?</p>
      </div>
      <div className="mt-2 space-y-3">
        <Controller name="notes" control={control} render={({ field }) => (
          <textarea rows={3} {...field} value={field.value ? String(field.value) : ''} autoFocus={!isMobile} className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black min-h-[120px] px-3 py-2" />
        )} />
        <Controller name="attachment_url" control={control} render={({ field }) => <input type="hidden" {...field} value={field.value ? String(field.value) : ''} />} />
        <label className="block text-sm font-medium text-black">Attachment (optional)</label>
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
  open?: boolean;
  onToggle?: () => void;
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
    selectedSupplierName,
    open = true,
    onToggle = () => {},
  } = props;

  useBooking();
  const baseFee = Number(baseServicePrice) || 0;
  const travelCost = Number(travelResult?.totalCost) || 0;
  const soundFee = Number(soundCost) || 0;
  const subtotalBeforeTaxes = baseFee + travelCost + soundFee;
  const estimatedTaxesFees = subtotalBeforeTaxes * 0.15;
  const estimatedTotal = subtotalBeforeTaxes + estimatedTaxesFees;
  const isProcessing = submitting || isLoadingReviewData;

  const getTravelPopoverContent = () => {
    if (!travelResult) return <>Travel cost calculated from artist location and venue distance.</>;
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
      <div className="p-6 md:p-8 rounded-2xl max-w-2xl mx-auto">
        <p className="text-sm text-neutral-600 mb-6">
          One checkout: we place an authorization for your booking. The artist must accept to confirm your date.
          If sound is included, we’ll confirm a firm price with the top supplier (backups auto-tried). Any difference
          from this estimate will be adjusted automatically.
        </p>

        {isLoadingReviewData && (
          <div className="flex items-center justify-center p-3 bg-black/[0.04] text-black rounded-lg mb-4">
            <span className="animate-spin mr-2">⚙️</span> Calculating estimates...
          </div>
        )}
        {reviewDataError && (
          <div className="p-3 bg-black/[0.04] text-black rounded-lg mb-4 border border-black/10">
            <p className="font-medium">Error calculating estimates:</p>
            <p className="text-sm">{reviewDataError}</p>
            <p className="text-xs mt-2 text-neutral-600">Please ensure all location details are accurate.</p>
          </div>
        )}

        <div className="mb-6"><SummarySidebar /></div>

        <h5 className="font-semibold text-base mb-3 text-neutral-900">Estimated Cost</h5>
        <div className="space-y-2 text-neutral-800">
          <div className="flex justify-between items-center"><span>Service Provider Base Fee</span><span>{formatCurrency(baseServicePrice)}</span></div>
          <div className="flex justify-between items-center">
            <span className="flex items-center">Travel<InfoPopover label="Travel cost details" className="ml-1.5">{getTravelPopoverContent()}</InfoPopover></span>
            <span>{formatCurrency(travelResult?.totalCost || 0)}</span>
          </div>
          {soundCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center">Sound Equipment {selectedSupplierName ? `· ${selectedSupplierName}` : ''}<InfoPopover label="Sound equipment details" className="ml-1.5">{props.soundMode === 'managed_by_artist' ? 'Managed by the artist with a simple markup policy.' : props.soundMode === 'provided_by_artist' ? 'Provided by the artist directly; price is firm on acceptance.' : props.soundMode === 'client_provided' ? 'You will provide sound equipment; no supplier outreach required.' : 'External provider estimate (drive-only). A supplier will confirm a firm price.'}</InfoPopover></span>
              <span>{formatCurrency(soundCost)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-dashed pt-2 mt-2 border-black/20"><span className="font-medium">Subtotal</span><span className="font-medium">{formatCurrency(subtotalBeforeTaxes)}</span></div>
          <div className="flex justify-between items-center"><span>Taxes & Fees (Est.)</span><span>{formatCurrency(estimatedTaxesFees)}</span></div>
          <div className="flex justify-between items-center text-xl font-bold text-neutral-900 border-t pt-3 mt-3 border-black/20"><span>Estimated Total</span><span>{formatCurrency(estimatedTotal)}</span></div>
        </div>

        <div className="mt-8">
          <div className="flex items-start space-x-3 mb-6">
            <input type="checkbox" id="terms" className="mt-1 h-3 w-3 bg-black rounded border-black/30 text-black" />
            <label htmlFor="terms" className="text-sm text-neutral-700">I have reviewed my details and agree to the <a href="#" className="text-black underline hover:underline underline-offset-4">terms of service</a>.</label>
          </div>
          <Button variant="primary" fullWidth isLoading={isProcessing} disabled={reviewDataError !== null || travelResult === null} onClick={(e) => { trackEvent('booking_submit'); void props.onNext(e); }} className="rounded-xl bg-black text-white hover:bg-black/90">{isProcessing ? (props.submitLabel === 'Submit Request' ? 'Submitting...' : 'Loading...') : props.submitLabel}</Button>
          <p className="text-xs text-neutral-600 mt-3">Artist must accept this request. Once accepted, your artist booking is confirmed. Sound is usually confirmed within a few hours; if the top pick declines we auto-try backups. If all decline, you can choose another option or we’ll refund the sound portion immediately.</p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
