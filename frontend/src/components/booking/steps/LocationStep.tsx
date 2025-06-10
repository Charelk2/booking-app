'use client';
// The map only appears after a location is selected. A tooltip explains any
// distance warnings so users understand why we show them.
import { Controller, Control, FieldValues } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { useLoadScript } from '@react-google-maps/api';
const GoogleMap = dynamic(() => import('@react-google-maps/api').then((m) => m.GoogleMap), { ssr: false });
const Marker = dynamic(() => import('@react-google-maps/api').then((m) => m.Marker), { ssr: false });
import { useRef, useState, useEffect } from 'react';
import { geocodeAddress, calculateDistanceKm, LatLng } from '@/lib/geo';

// Keeping the libraries array stable avoids unnecessary re-renders from
// useLoadScript when this component rerenders.
const MAP_LIBRARIES = ['places'] as const;

interface Props {
  control: Control<FieldValues>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
}

const containerStyle = { width: '100%', height: '250px' };

interface AutocompleteProps {
  value: string | undefined;
  onChange: (v: string) => void;
  onSelect: (loc: LatLng) => void;
  isLoaded: boolean;
}

interface GmpSelectEvent {
  placePrediction?: { toPlace: () => { fetchFields: (o: { fields: string[] }) => Promise<void>; formattedAddress?: string; location?: { lat: number; lng: number }; } };
}

function AutocompleteInput({ value, onChange, onSelect, isLoaded }: AutocompleteProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isLoaded || elementRef.current || !divRef.current) return;
    let el: HTMLElement;
    (async () => {
      const mod = await import('@googlemaps/places');
      el = new mod.PlaceAutocompleteElement();
      el.setAttribute('placeholder', 'Search address');
      if (value) el.setAttribute('value', value);
      divRef.current!.appendChild(el);
      elementRef.current = el;
      el.addEventListener('gmp-select', async (event: GmpSelectEvent) => {
        const pred = event.placePrediction;
        if (pred) {
          const place = pred.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'location'] });
          if (place.location) {
            onSelect({ lat: place.location.lat, lng: place.location.lng });
          }
          if (place.formattedAddress) onChange(place.formattedAddress);
        }
      });
      el.addEventListener('input', (e) => {
        onChange((e.target as HTMLInputElement).value);
      });
    })();
    return () => {
      if (el) el.remove();
      elementRef.current = null;
    };
  }, [isLoaded, onChange, onSelect, value]);

  useEffect(() => {
    if (elementRef.current && value !== undefined) {
      elementRef.current.setAttribute('value', value);
    }
  }, [value]);

  return <div ref={divRef} data-testid="autocomplete-container" />;
}

export default function LocationStep({
  control,
  artistLocation,
  setWarning,
}: Props): JSX.Element {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: MAP_LIBRARIES,
  });
  const [marker, setMarker] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  if (!isLoaded) return <p>Loading map...</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">Where is the show?</p>
      <Controller
        name="location"
        control={control}
        render={({ field }) => (
          <AutocompleteInput
            value={field.value}
            onChange={field.onChange}
            onSelect={(loc) => setMarker(loc)}
            isLoaded={isLoaded}
          />
        )}
      />
      {marker && (
        <GoogleMap
          center={marker}
          zoom={14}
          mapContainerStyle={containerStyle}
          data-testid="map"
        >
          <Marker position={marker} />
        </GoogleMap>
      )}
      <button
        type="button"
        className="mt-2 text-sm text-indigo-600 underline"
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
      </button>
      <span
        className="ml-1 text-gray-400 cursor-help"
        title="A warning appears if this address is over 100km from the artist."
      >
        ?
      </span>
      {geoError && <p className="text-red-600 text-sm">{geoError}</p>}
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
