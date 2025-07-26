'use client';
// The map only appears after a location is selected. A tooltip explains any
// distance warnings so users understand why we show them.
import { Controller, Control, FieldValues } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { loadPlaces } from '@/lib/loadPlaces';
const GoogleMap = dynamic(
  () => import('@react-google-maps/api').then((m) => m.GoogleMap),
  { ssr: false },
);
const Marker = dynamic(
  () => import('@react-google-maps/api').then((m) => m.Marker),
  { ssr: false },
);
import { useRef, useState, useEffect } from 'react';
import { Button, Tooltip } from '../../ui';
import { geocodeAddress, calculateDistanceKm, LatLng } from '@/lib/geo';

// Map libraries are loaded lazily using a shared loader so the Google Maps
// script is only injected once across the app.

interface Props {
  control: Control<FieldValues>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

const mapContainerCollapsed = {
  width: '100%',
  height: 0,
  overflow: 'hidden',
  transition: 'height 0.3s ease',
};

const mapContainerExpanded = {
  width: '100%',
  height: '250px',
  transition: 'height 0.3s ease',
};

function GoogleMapsLoader({
  children,
}: {
  children: (isLoaded: boolean) => JSX.Element;
}) {
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

interface AutocompleteProps {
  value: string | undefined;
  onChange: (v: string) => void;
  onSelect: (loc: LatLng) => void;
}

function AutocompleteInput({ value, onChange, onSelect }: AutocompleteProps) {
  const autoRef = useRef<Element | null>(null);

  useEffect(() => {
    const el = autoRef.current as HTMLElement | null;
    if (!el) return;
    function handleChange(e: Event) {
      const place = (e as any).detail?.place;
      if (place?.geometry?.location) {
        onSelect({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
      if (place?.formatted_address) onChange(place.formatted_address);
    }
    el.addEventListener('placechange', handleChange);
    el.addEventListener('gmpx-placechange', handleChange);
    return () => {
      el.removeEventListener('placechange', handleChange);
      el.removeEventListener('gmpx-placechange', handleChange);
    };
  }, [onChange, onSelect]);

  useEffect(() => {
    if (autoRef.current) {
      // @ts-ignore - value is writable on the web component
      (autoRef.current as any).value = value ?? '';
    }
  }, [value]);

  return (
    <gmpx-place-autocomplete ref={autoRef} data-testid="autocomplete-input">
      <input
        slot="input"
        type="text"
        placeholder="Search address"
        className="block w-full rounded-md border border-gray-300 focus:border-brand focus:ring-brand sm:text-sm p-2"
      />
    </gmpx-place-autocomplete>
  );
}

export default function LocationStep({
  control,
  artistLocation,
  setWarning,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props): JSX.Element {
  const [shouldLoadMap, setShouldLoadMap] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [marker, setMarker] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    if (shouldLoadMap) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShouldLoadMap(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoadMap]);

  useEffect(() => {
    (async () => {
      if (artistLocation) {
        const artistPos = await geocodeAddress(artistLocation);
        if (artistPos && marker) {
          const dist = calculateDistanceKm(artistPos, marker);
          if (dist > 100) setWarning('This location is over 100km from the artist.');
          else setWarning(null);
        }
      }
    })();
  }, [artistLocation, marker, setWarning]);

  function Map({ isLoaded }: { isLoaded: boolean }) {
    if (!marker) return null;
    if (!isLoaded) return <div className="h-full w-full" />;
    return (
      <GoogleMap
        center={marker}
        zoom={14}
        mapContainerStyle={{ width: '100%', height: '100%' }}
        data-testid="map"
      >
        <Marker position={marker} />
      </GoogleMap>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Where is the show?</p>
      <div ref={containerRef}>
        {shouldLoadMap ? (
          <GoogleMapsLoader>
            {(loaded) => (
              <>
                <Controller
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <AutocompleteInput
                      value={field.value}
                      onChange={field.onChange}
                      onSelect={(loc) => setMarker(loc)}
                    />
                  )}
                />
                <div
                  style={marker ? mapContainerExpanded : mapContainerCollapsed}
                  data-testid="map-container"
                >
                  <Map isLoaded={loaded} />
                </div>
              </>
            )}
          </GoogleMapsLoader>
        ) : (
          <>
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <AutocompleteInput
                  value={field.value}
                  onChange={field.onChange}
                  onSelect={(loc) => setMarker(loc)}
                />
              )}
            />
            <div
              style={marker ? mapContainerExpanded : mapContainerCollapsed}
              data-testid="map-container"
            />
          </>
        )}
      </div>
      <Button
        type="button"
        variant="link"
        className="mt-2 text-sm inline-block min-h-[44px]"
        onClick={() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setMarker(loc);
              setGeoError(null);
            },
            () => {
              setGeoError('Unable to fetch your location');
            },
          );
        }}
      >
        Use my location
      </Button>
      <Tooltip
        text="A warning appears if this address is over 100km from the artist."
        className="ml-1"
      />
      {geoError && <p className="text-red-600 text-sm">{geoError}</p>}
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <Button
            type="button"
            onClick={onBack}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Back
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            type="button"
            onClick={onSaveDraft}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
