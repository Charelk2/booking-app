'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { GoogleMap, Marker, useLoadScript, Autocomplete } from '@react-google-maps/api';
import { useRef, useState, useEffect } from 'react';
import { geocodeAddress, calculateDistanceKm, LatLng } from '@/lib/geo';

interface Props {
  control: Control<FieldValues>;
  artistLocation?: string | null;
  setWarning: (w: string | null) => void;
}

const containerStyle = { width: '100%', height: '250px' };

export default function LocationStep({ control, artistLocation, setWarning }: Props) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places'],
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [marker, setMarker] = useState<LatLng | null>(null);

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
          navigator.geolocation.getCurrentPosition((pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setMarker(loc);
          });
        }}
      >
        Use my location
      </button>
    </div>
  );
}
