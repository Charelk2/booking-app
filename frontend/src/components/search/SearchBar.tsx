'use client';

import {
  Fragment,
  type RefObject,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { SearchFields } from './SearchFields';
import type { Category, SearchFieldId, ActivePopup } from './types';
import useClickOutside from '@/hooks/useClickOutside';
import { Transition } from '@headlessui/react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';

// ActivePopup lives in './types' to avoid import cycles

export interface SearchBarProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}

const DynamicSearchPopupContent = dynamic(() => import('./SearchPopupContent'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-slate-600">Loading search options…</div>,
});

export default function SearchBar({
  category,
  setCategory,
  location,
  setLocation,
  when,
  setWhen,
  onSearch,
  onCancel,
  compact = false,
}: SearchBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<ActivePopup>(null);
  const [showInternalPopup, setShowInternalPopup] = useState(false);
  const [locationPredictions, setLocationPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);

  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; width: number; height?: number } | null>(null);

  const lastActiveButtonRef = useRef<HTMLElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const categoryListboxOptionsRef = useRef<HTMLUListElement>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (showInternalPopup && formRef.current) {
      const formRect = formRef.current.getBoundingClientRect();
      const top = formRect.bottom + window.scrollY + 6;
      let left = formRect.left + window.scrollX;
      let width = formRect.width;

      if (activeField === 'category') {
        width = formRect.width / 2;
      } else if (activeField === 'location') {
        width = formRect.width / 2;
        left = formRect.left + window.scrollX + formRect.width / 2;
      }
      setPopupPosition({ top, left, width });
    } else {
      setPopupPosition(null);
    }
  }, [showInternalPopup, activeField]);

  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapseHeaderIfOverlayVisible = useCallback(() => {
    if (showInternalPopup && document.getElementById('expanded-search-overlay')) {
      onCancel?.();
    }
  }, [showInternalPopup, onCancel]);

  const closeThisSearchBarsInternalPopups = useCallback(() => {
    if (!showInternalPopup) return;
    setShowInternalPopup(false);

    // Collapse desktop overlay only when it exists
    collapseHeaderIfOverlayVisible();

    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(() => {
      setActiveField(null);
      if (lastActiveButtonRef.current) {
        if (activeField === 'location' && locationInputRef.current) {
          locationInputRef.current.blur();
        } else {
          lastActiveButtonRef.current.focus();
        }
        lastActiveButtonRef.current = null;
      }
      resetTimeoutRef.current = null;
    }, 180);
  }, [activeField, showInternalPopup, collapseHeaderIfOverlayVisible]);

  const handleLocationChange = useCallback((value: string) => setLocation(value), [setLocation]);

  const handleFieldClick = useCallback((fieldId: SearchFieldId, element: HTMLElement) => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setActiveField(fieldId);
    setShowInternalPopup(true);
    lastActiveButtonRef.current = element;
  }, []);

  useClickOutside([formRef, popupContainerRef] as Array<RefObject<HTMLElement | null>>, () => {
    if (showInternalPopup) closeThisSearchBarsInternalPopups();
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeThisSearchBarsInternalPopups();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    closeThisSearchBarsInternalPopups();
    try {
      await onSearch({ category: category?.value, location: location || undefined, when });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <form
        ref={formRef}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        autoComplete="off"
        role="search"
        aria-label="Service Provider booking search"
        className={clsx(
          'relative flex items-stretch rounded-full transition-all duration-200 ease-out',
          'bg-white border border-black/10 ring-1 ring-white/20 backdrop-blur-2xl',
          'shadow-sm',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        <SearchFields
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={handleLocationChange}
          when={when}
          setWhen={setWhen}
          activeField={activeField}
          onFieldClick={handleFieldClick}
          locationInputRef={locationInputRef}
          compact={compact}
          onPredictionsChange={setLocationPredictions}
          classNameOverrides={{
            fieldBase: 'px-4 py-3 first:pl-5 last:pr-0 text-slate-800/90 placeholder:text-slate-600/60',
            divider: 'w-px self-stretch bg-white/30',
          }}
          submitBusy={isSubmitting}
          showExpanded={showInternalPopup}
          locationCityOnly
        />
      </form>

      {showInternalPopup &&
        popupPosition &&
        createPortal(
          <>
            <div className="pointer-events-none fixed inset-0 z-40 bg-black/30" aria-hidden="true" />
            <Transition
              show={showInternalPopup}
              as={Fragment}
              key={activeField}
              enter="transition ease-out duration-300"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 -translate-y-2"
            >
              <div
                ref={popupContainerRef}
                className={clsx(
                  'absolute z-[60] rounded-2xl p-4',
                  'bg-white border border-white/40 ring-1 ring-white/30 backdrop-blur-2xl shadow-xl',
                  'origin-top-left',
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby={activeField ? `search-popup-label-${activeField}` : undefined}
                style={{
                  top: popupPosition.top,
                  left: popupPosition.left,
                  width: popupPosition.width,
                  height: popupPosition.height,
                }}
              >
                {activeField && (
                  <DynamicSearchPopupContent
                    activeField={activeField}
                    category={category}
                    setCategory={setCategory}
                    location={location}
                    setLocation={setLocation}
                    when={when}
                    setWhen={setWhen}
                    closeAllPopups={closeThisSearchBarsInternalPopups}
                    setActiveField={(f) => {
                      // Keep popup open and switch to requested field
                      if (resetTimeoutRef.current) {
                        clearTimeout(resetTimeoutRef.current);
                        resetTimeoutRef.current = null;
                      }
                      setActiveField(f);
                      setShowInternalPopup(true);
                    }}
                    locationInputRef={locationInputRef}
                    categoryListboxOptionsRef={categoryListboxOptionsRef}
                    locationPredictions={locationPredictions}
                    locationCityOnly
                  />
                )}
              </div>
            </Transition>
          </>,
          document.body,
        )}
    </>
  );
}
