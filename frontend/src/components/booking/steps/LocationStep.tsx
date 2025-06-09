'use client';
// TODO: Hide the map preview until a location is chosen and add a tooltip
// explaining distance warnings. This keeps the step short on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { useLoadScript } from '@react-google-maps/api';
const GoogleMap = dynamic(() => import('@react-google-maps/api').then((m) => m.GoogleMap), { ssr: false });
const Marker = dynamic(() => import('@react-google-maps/api').then((m) => m.Marker), { ssr: false });
const Autocomplete = dynamic(() => import('@react-google-maps/api').then((m) => m.Autocomplete), { ssr: false });
import { useRef, useState, useEffect } from 'react';
import { geocodeAddress, calculateDistanceKm, LatLng } from '@/lib/geo';

interface Props {
  control: Control<FieldValues>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
}

const containerStyle = { width: '100%', height: '250px' };

export default function LocationStep({
  control,
  artistLocation,
  setWarning,
}: Props): JSX.Element {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places'],
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
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
      <Autocomplete
        onLoad={(a) => (autocompleteRef.current = a)}
        onPlaceChanged={async () => {
          const place = autocompleteRef.current?.getPlace();
          if (place && place.geometry?.location) {
            const loc = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            };
            setMarker(loc);
          }
        }}
      >
        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              className="border p-2 rounded w-full"
              placeholder="Search address"
              autoFocus
            />
          )}
        />
      </Autocomplete>
      {marker && (
        <GoogleMap center={marker} zoom={14} mapContainerStyle={containerStyle}>
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
      {geoError && <p className="text-red-600 text-sm">{geoError}</p>}
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
