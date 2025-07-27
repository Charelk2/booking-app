'use client';

import { useEffect, useState, useRef } from 'react';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { GoogleMap, Marker } from '@react-google-maps/api'; // Assuming these imports
import { Button } from '../../ui'; // Assuming Button component and its variants
import Tooltip from '../../ui/Tooltip'; // Assuming Tooltip component
import { GoogleMapsLoader, calculateDistanceKm } from '@/lib/maps'; // Assuming these utilities
import LocationInput from '../../ui/LocationInput'; // Assuming this component

interface Props {
  control: Control<FieldValues>;
  artistLocation: { lat: number; lng: number }; // Example prop
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

const mapContainerCollapsed = { width: '100%', height: '0', overflow: 'hidden' };
const mapContainerExpanded = { width: '100%', height: '300px', overflow: 'hidden', transition: 'height 0.3s ease-in-out' };

export default function LocationStep({
  control,
  artistLocation,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoadMap, setShouldLoadMap] = useState(false);

  // Lazy load map when component is in viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadMap(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (marker && artistLocation) {
        if (typeof calculateDistanceKm === 'function') { // Ensure function exists
          const artistPos = artistLocation; // Adjust if artistLocation is not directly a LatLng literal
          const dist = calculateDistanceKm(artistPos, marker);
          if (dist > 100) setWarning('This location is over 100km from the artist.');
          else setWarning(null);
        }
      }
    })();
  }, [artistLocation, marker]);

  function Map({ isLoaded }: { isLoaded: boolean }) {
    if (!marker) return null;
    if (!isLoaded) return <div className="w-full h-full bg-gray-200 rounded-lg animate-pulse" />; // Skeleton for map
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
    <div className="wizard-step-container"> {/* Main card for this step */}
      <h2 className="step-title">Event Location</h2>
      <p className="step-description">Where is the show?</p>

      <div ref={containerRef} className="flex flex-col gap-4"> {/* Container for input and map */}
        {shouldLoadMap ? (
          <GoogleMapsLoader>
            {(loaded) => (
              <>
                <Controller
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <LocationInput
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      onPlaceSelect={(place) => {
                        if (place.geometry?.location) {
                          setMarker({
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng(),
                          });
                        }
                      }}
                      placeholder="Search address"
                      inputClassName="input-field" /* Apply input-field styling */
                    />
                  )}
                />
                <div
                  style={marker ? mapContainerExpanded : mapContainerCollapsed}
                  className="rounded-lg overflow-hidden border border-gray-300 shadow-sm" /* Map container styling */
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
                <LocationInput
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onPlaceSelect={(place) => {
                    if (place.geometry?.location) {
                      setMarker({
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                      });
                    }
                  }}
                  placeholder="Search address"
                  inputClassName="input-field" /* Apply input-field styling */
                />
              )}
            />
            <div
              style={marker ? mapContainerExpanded : mapContainerCollapsed}
              className="rounded-lg overflow-hidden border border-gray-300 shadow-sm" /* Map container styling */
              data-testid="map-container"
            />
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
        <Button
          type="button"
          variant="link" /* Using Button component variant for link style */
          className="text-base font-semibold" /* Additional text styling */
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
        {/* Assuming Tooltip handles its own base styling */}
        <Tooltip
          text="A warning appears if this address is over 100km from the artist."
          className="ml-1"
        />
      </div>
      {geoError && <p className="text-sm text-red-600 mt-2">{geoError}</p>}
      {warning && <p className="text-sm text-orange-600 mt-2">{warning}</p>}
    </div>
  );
}
