'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  MapPinIcon,
  MusicalNoteIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon as MagnifyingGlassIconSolid } from '@heroicons/react/24/solid';
import clsx from 'clsx';
import useServiceCategories, { type Category as CategoryType } from '@/hooks/useServiceCategories';
import LocationInput, { type PlaceResult } from '../ui/LocationInput';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/styles/datepicker.css';
import { getServiceProviders } from '@/lib/api';
import type { ServiceProviderProfile } from '@/types';

type PanelKey = 'category' | 'when' | 'location' | null;

export type MobileSearchHandle = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type Props = {
  category: CategoryType | null;
  setCategory: (c: CategoryType | null) => void;
  location?: string;
  setLocation?: (l: string) => void;
  when?: Date | null;
  setWhen?: (d: Date | null) => void;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
  showPill?: boolean;
};

/** Local fallback for react-datepicker's custom header props */
type ReactDatePickerCustomHeaderProps = {
  date: Date;
  decreaseMonth: () => void;
  increaseMonth: () => void;
  prevMonthButtonDisabled?: boolean;
  nextMonthButtonDisabled?: boolean;
};

/** Accordion shell */
const CardShell = memo(function CardShell({
  icon,
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  icon: JSX.Element;
  title: React.ReactNode;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border border-black/10 bg-white/95 backdrop-blur shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <div className="text-[15px] text-slate-900">{title}</div>
            {subtitle && <div className="text-xs text-slate-600">{subtitle}</div>}
          </div>
        </div>
        <ChevronDownIcon className={clsx('h-5 w-5 text-slate-500 transition-transform', isOpen && 'rotate-180')} />
      </button>

      <div
        className={clsx(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr] overflow-visible' : 'grid-rows-[0fr] overflow-hidden'
        )}
      >
        <div className="min-h-0">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
});

const MobileSearch = forwardRef<MobileSearchHandle, Props>(function MobileSearch(
  {
    category,
    setCategory,
    location = '',
    setLocation,
    when = null,
    setWhen,
    onSearch,
    onCancel,
    onOpenChange,
    showPill = true,
  }: Props,
  ref
) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      isOpen: () => open,
    }),
    [open]
  );

  const [active, setActive] = useState<PanelKey>(null);
  const categories = useServiceCategories();

  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<ServiceProviderProfile[]>([]);
  const artistInputRef = useRef<HTMLInputElement>(null);

  const [locationPredictions, setLocationPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);

  const force16 = { fontSize: 16 };

  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await getServiceProviders({ artist: artistQuery, limit: 5 });
        setArtistResults(res.data || []);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [artistQuery]);

  const canSearch = true;

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    []
  );
  const monthFmt = useMemo(() => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }), []);

  // Body lock
  const scrollYRef = useRef(0);
  const prevBodyStylesRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    overflow: string;
    width: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    onOpenChange?.(true);
    scrollYRef.current = window.scrollY;

    const { style } = document.body;
    prevBodyStylesRef.current = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      overflow: style.overflow,
      width: style.width,
    };
    style.position = 'fixed';
    style.top = `-${scrollYRef.current}px`;
    style.left = '0';
    style.right = '0';
    style.overflow = 'hidden';
    style.width = '100%';

    return () => {
      const prev = prevBodyStylesRef.current;
      const { style } = document.body;
      if (prev) {
        style.position = prev.position;
        style.top = prev.top;
        style.left = prev.left;
        style.right = prev.right;
        style.overflow = prev.overflow;
        style.width = prev.width;
      } else {
        style.position = '';
        style.top = '';
        style.left = '';
        style.right = '';
        style.overflow = '';
        style.width = '';
      }
      window.scrollTo(0, scrollYRef.current);
      onOpenChange?.(false);
      prevBodyStylesRef.current = null;
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    const handler = () => closeAndReset();
    window.addEventListener('mobile-search:backdrop', handler as EventListener);
    return () => window.removeEventListener('mobile-search:backdrop', handler as EventListener);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unlockBodyNow = useCallback(() => {
    const prev = prevBodyStylesRef.current;
    const { style } = document.body;
    if (prev) {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.overflow = prev.overflow;
      style.width = prev.width;
    } else {
      style.position = '';
      style.top = '';
      style.left = '';
      style.right = '';
      style.overflow = '';
      style.width = '';
    }
    window.scrollTo(0, scrollYRef.current);
    prevBodyStylesRef.current = null;
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    setActive(null);
  }, []);
  const closeAndReset = useCallback(() => {
    onOpenChange?.(false);
    unlockBodyNow();
    setOpen(false);
    onCancel?.();
  }, [onCancel, onOpenChange, unlockBodyNow]);

  const handlePickCategory = useCallback(
    (c: CategoryType) => {
      setCategory(c);
      setActive('when');
    },
    [setCategory]
  );

  const handleArtistClick = useCallback((p: ServiceProviderProfile) => {
    const id = p.user_id;
    if (id) window.location.href = `/service-providers/${id}`;
  }, []);

  const handlePickDate = useCallback(
    (d: Date | null) => {
      setWhen?.(d);
      setActive('location');
    },
    [setWhen]
  );

  const handlePickLocation = useCallback(
    (place: PlaceResult) => {
      const name = place.formatted_address || place.name || '';
      setLocation?.(name);
      setActive(null);
    },
    [setLocation]
  );

  const handleSubmit = useCallback(async () => {
    await onSearch({ category: category?.value, location, when });
    closeAndReset();
  }, [onSearch, category, location, when, closeAndReset]);

  const keepCategoryOpenOnFocus = useCallback(() => setActive('category'), []);
  const keepLocationOpenOnFocus = useCallback(() => setActive('location'), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: ReactKeyboardEvent | KeyboardEvent) => {
      const key = (e as any).key as string | undefined;
      if (key === 'Escape') {
        (e as any).preventDefault?.();
        closeAndReset();
      }
    };
    window.addEventListener('keydown', onKey as any);
    return () => window.removeEventListener('keydown', onKey as any);
  }, [open, closeAndReset]);

  const Pill = showPill && !open && (
    <button
      type="button"
      onClick={openPanel}
      aria-expanded={false}
      className={clsx(
        'w-full flex items-center justify-start gap-3 md:hidden',
        'rounded-full border border-black/10 bg-white/100 backdrop-blur',
        'px-4 py-3 shadow-sm active:scale-[0.99] transition'
      )}
    >
      <MagnifyingGlassIconSolid className="h-5 w-5 text-slate-900" />
      <span className="text-sm font-medium text-slate-900">Start your search</span>
    </button>
  );

  return (
    <div className="md:hidden">
      {Pill}

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closeAndReset} />
          <div className="relative z-50 mt-3 space-y-3">
            {/* CATEGORY / ARTIST */}
            <CardShell
              icon={<MusicalNoteIcon className="h-5 w-5 text-slate-700" aria-hidden="true" />}
              title={
                category ? (
                  <>
                    <span className="font-semibold">Category:</span>{' '}
                    <span className="font-normal">{category.label}</span>
                  </>
                ) : (
                  'Category'
                )
              }
              subtitle={category ? undefined : 'Pick a service'}
              isOpen={active === 'category'}
              onToggle={() => setActive(active === 'category' ? null : 'category')}
            >
              <div className="space-y-2">
                <input
                  ref={artistInputRef}
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  onFocus={keepCategoryOpenOnFocus}
                  placeholder="Search artist by name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[16px] outline-none"
                  style={force16}
                  autoComplete="off"
                  inputMode="search"
                  enterKeyHint="search"
                />
                {!!artistResults.length && (
                  <ul className="max-h-40 overflow-y-auto rounded-lg border border-gray-100">
                    {artistResults.map((a) => {
                      const name =
                        a.business_name ||
                        `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
                      return (
                        <li key={a.user_id} className="border-b last:border-b-0">
                          <button
                            type="button"
                            onClick={() => handleArtistClick(a)}
                            className="w-full text-left px-3 py-2 text-[15px] hover:bg-gray-100"
                          >
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <ul className="mt-3 max-h-[45vh] overflow-y-auto divide-y divide-gray-100">
                {categories.map((c) => (
                  <li key={c.value}>
                    <button
                      type="button"
                      onClick={() => handlePickCategory(c)}
                      className="w-full text-left px-3 py-3 text-[15px] hover:bg-gray-100 rounded-lg"
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between">
                {category ? (
                  <button
                    type="button"
                    onClick={() => setCategory(null)}
                    className="inline-flex items-center gap-1 text-sm text-slate-600"
                  >
                    <XMarkIcon className="h-4 w-4" /> Clear category
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setActive('when')}
                  className="text-sm font-semibold text-slate-900 underline"
                >
                  Next: When
                </button>
              </div>
            </CardShell>

            {/* WHEN */}
            <CardShell
              icon={<CalendarIcon className="h-5 w-5 text-slate-700" aria-hidden="true" />}
              title={
                when ? (
                  <>
                    <span className="font-semibold">When:</span>{' '}
                    <span className="font-normal">{dateFmt.format(when)}</span>
                  </>
                ) : (
                  'When'
                )
              }
              subtitle={!when ? 'Select a date' : undefined}
              isOpen={active === 'when'}
              onToggle={() => setActive(active === 'when' ? null : 'when')}
            >
              <div className="w-full overflow-x-hidden">
                <ReactDatePicker
                  selected={when}
                  onChange={(d: Date | null) => handlePickDate(d)}  
                  inline
                  calendarClassName="react-datepicker-custom-calendar rdp-mobile"
                  renderCustomHeader={({
                    date,
                    decreaseMonth,
                    increaseMonth,
                    prevMonthButtonDisabled,
                    nextMonthButtonDisabled,
                  }: ReactDatePickerCustomHeaderProps) => (
                    <div className="rdp-mobile-header">
                      <button
                        type="button"
                        onClick={decreaseMonth}
                        disabled={prevMonthButtonDisabled}
                        aria-label="Previous month"
                        className="rdp-nav-btn"
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                      <div className="rdp-month-label" aria-live="polite">
                        {monthFmt.format(date)}
                      </div>
                      <button
                        type="button"
                        onClick={increaseMonth}
                        disabled={nextMonthButtonDisabled}
                        aria-label="Next month"
                        className="rdp-nav-btn"
                      >
                        <ChevronRightIcon className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                {when ? (
                  <button
                    type="button"
                    onClick={() => setWhen?.(null)}
                    className="inline-flex items-center gap-1 text-sm text-slate-600"
                  >
                    <XMarkIcon className="h-4 w-4" /> Clear date
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => setActive('location')}
                  className="text-sm font-semibold text-slate-900 underline"
                >
                  Next: Location
                </button>
              </div>
            </CardShell>

            {/* LOCATION */}
            <CardShell
              icon={<MapPinIcon className="h-5 w-5 text-slate-700" aria-hidden="true" />}
              title={
                location ? (
                  <>
                    <span className="font-semibold">Where:</span>{' '}
                    <span className="font-normal">{location}</span>
                  </>
                ) : (
                  'Location'
                )
              }
              subtitle={!location ? 'Add location' : undefined}
              isOpen={active === 'location'}
              onToggle={() => setActive(active === 'location' ? null : 'location')}
            >
              <div className="space-y-2">
                <LocationInput
                  value={location}
                  onValueChange={(v) => setLocation?.(v)}
                  onPlaceSelect={handlePickLocation}
                  onFocus={keepLocationOpenOnFocus}                  
                  onPredictionsChange={(preds) => setLocationPredictions(preds)} /* safe wrapper */
                  placeholder="Search location"
                  className="w-full"
                  inputClassName="w-full rounded-lg border border-gray-200 px-3 py-2 text-[16px] outline-none"
                  showDropdown={false}
                />

                {!!location && locationPredictions.length > 0 && (
                  <ul className="max-h-[45vh] overflow-y-auto rounded-lg divide-y-0">
                    {locationPredictions.map((p) => (
                      <li key={p.place_id || p.description}>
                        <button
                          type="button"
                          onClick={() => (setLocation?.(p.description), setActive(null))}
                          className="w-full text-left px-3 py-2 text-[15px] hover:bg-gray-100"
                        >
                          <div className="font-medium">
                            {p.structured_formatting?.main_text || p.description}
                          </div>
                          {p.structured_formatting?.secondary_text && (
                            <div className="text-xs text-slate-500">
                              {p.structured_formatting.secondary_text}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!location && (
                  <p className="text-xs text-slate-500">
                    Start typing your area or venue — suggestions will appear if available.
                  </p>
                )}

                {!!location && (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setLocation?.('')}
                      className="inline-flex items-center gap-1 text-sm text-slate-600"
                    >
                      <XMarkIcon className="h-4 w-4" /> Clear location
                    </button>
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="text-sm font-semibold text-slate-900 underline"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </CardShell>

            {/* FOOTER */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={closeAndReset}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 bg-white active:scale-[0.99]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!canSearch}
                onClick={handleSubmit}
                className={clsx(
                  'text-sm px-4 py-2 rounded-lg active:scale-[0.99]',
                  canSearch ? 'bg-slate-900 text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                )}
              >
                Search
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default MobileSearch;
