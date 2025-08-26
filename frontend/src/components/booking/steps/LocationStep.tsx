'use client';
// The map only appears after a location is selected. A tooltip explains any
// distance warnings so users understand why we show them.
import { Controller, Control } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { loadPlaces } from '@/lib/loadPlaces';
import LocationInput from '../../ui/LocationInput';
import clsx from 'clsx';
import { useRef, useState, useEffect } from 'react';
import { Button } from '../../ui';
import { LatLng } from '@/lib/geo';
import { EventDetails } from '@/contexts/BookingContext';

const GoogleMap = dynamic(
  () => import('@react-google-maps/api').then((m) => m.GoogleMap),
  { ssr: false },
);
const Marker = dynamic(
  () => import('@react-google-maps/api').then((m) => m.Marker),
  { ssr: false },
);

interface Props {
  control: Control<EventDetails>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
  open?: boolean;
  onToggle?: () => void;
}

interface MapProps {
  isLoaded: boolean;
  marker: LatLng | null;
}

function Map({ isLoaded, marker }: MapProps) {
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

export default function LocationStep({
  control,
  artistLocation,
  setWarning,
  open = true,
  onToggle = () => {},
}: Props): JSX.Element {
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

  // Distance warning removed per UX; keep function in props but unused

  return (
    <section className="wizard-step-container rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-bold text-neutral-900">Location</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">Where is the show?</p>
      </div>
      <div className="mt-6" ref={containerRef}>
        <div className="space-y-3">
        {shouldLoadMap ? (
          <GoogleMapsLoader>
            {(loaded) => (
              <>
                {/* Hidden controller for venue/place name */}
                <Controller<EventDetails, 'locationName'>
                  name="locationName"
                  control={control}
                  render={({ field }) => {
                    // Expose setter so we can set it in onPlaceSelect
                    (locationNameSetterRef as any).current = field.onChange;
                    return null;
                  }}
                />

                <Controller<EventDetails, 'location'>
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <LocationInput
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      onPlaceSelect={(place: google.maps.places.PlaceResult) => {
                        if (place.geometry?.location) {
                          setMarker({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng(),
                          });
                        }
                        const nm = (place.name || '').toString();
                        if (locationNameSetterRef.current) {
                          locationNameSetterRef.current(nm);
                        }
                      }}
                      placeholder="Search address"
                      inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                    />
                  )}
                />
                {marker && (
                  <div className="mt-2 rounded-2xl overflow-hidden h-56" data-testid="map-container">
                    {loaded ? (
                      <Map isLoaded={loaded} marker={marker} />
                    ) : (
                      <div className="h-full w-full bg-gray-100 animate-pulse" />
                    )}
                  </div>
                )}
              </>
            )}
          </GoogleMapsLoader>
        ) : (
          <>
            {/* Hidden controller for venue/place name */}
            <Controller<EventDetails, 'locationName'>
              name="locationName"
              control={control}
              render={({ field }) => {
                (locationNameSetterRef as any).current = field.onChange;
                return null;
              }}
            />

            <Controller<EventDetails, 'location'>
              name="location"
              control={control}
              render={({ field }) => (
                <LocationInput
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onPlaceSelect={(place: google.maps.places.PlaceResult) => {
                    if (place.geometry?.location) {
                      setMarker({
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                      });
                    }
                    const nm = (place.name || '').toString();
                    if (locationNameSetterRef.current) {
                      locationNameSetterRef.current(nm);
                    }
                  }}
                  placeholder="Search address"
                  inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                />
              )}
            />
            {/* No collapsed placeholder map */}
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
            () => {
              setGeoError('Unable to fetch your location');
            },
          );
        }}
      >
        Use my location
      </Button>
      {geoError && <p className="text-sm text-black/80">{geoError}</p>}
    </section>
  );
}
