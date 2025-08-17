"use client";

import React, {
  useState,
  useEffect,
  useRef,
  KeyboardEvent,
  forwardRef,
  useImperativeHandle,
} from "react";
import { MapPinIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { loadPlaces } from "@/lib/loadPlaces";

// Keep a handy alias for Google's PlaceResult
export type PlaceResult = google.maps.places.PlaceResult;

export interface LocationInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string; // wrapper div
  inputClassName?: string; // input element
  onPredictionsChange?: (
    predictions: google.maps.places.AutocompletePrediction[]
  ) => void;
  showDropdown?: boolean;
  /** NEW: bubble input focus to parent if needed */
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

export const AUTOCOMPLETE_LISTBOX_ID = "autocomplete-options";

const LocationInput = forwardRef<HTMLInputElement, LocationInputProps>(
  (
    {
      value,
      onValueChange,
      onPlaceSelect,
      placeholder = "Search location",
      className,
      inputClassName,
      onPredictionsChange,
      showDropdown = true,
      onFocus, // NEW
    },
    ref
  ) => {
    const [predictions, setPredictions] =
      useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [userLocation, setUserLocation] =
      useState<google.maps.LatLngLiteral | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const [isPlacesReady, setIsPlacesReady] = useState(false);
    const [liveMessage, setLiveMessage] = useState("");

    const containerRef = useRef<HTMLDivElement>(null);
    const inputInternalRef = useRef<HTMLInputElement>(null);

    // Expose <input> to parents
    useImperativeHandle(
      ref,
      () => inputInternalRef.current as HTMLInputElement,
      []
    );

    const listboxId = AUTOCOMPLETE_LISTBOX_ID;

    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
      console.error(
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Location autocomplete will be disabled."
      );
    }

    const placesServiceRef = useRef<google.maps.places.PlacesService | null>(
      null
    );
    const autocompleteServiceRef =
      useRef<google.maps.places.AutocompleteService | null>(null);
    const sessionTokenRef =
      useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    // Load Google Places API once
    useEffect(() => {
      let mounted = true;
      (async () => {
        const places = await loadPlaces();
        if (!mounted || !places) return;
        autocompleteServiceRef.current = new places.AutocompleteService();
        placesServiceRef.current = new places.PlacesService(
          document.createElement("div")
        );
        sessionTokenRef.current = new places.AutocompleteSessionToken();
        setIsPlacesReady(true);
      })();
      return () => {
        mounted = false;
      };
    }, []);

    // Get user geolocation once (soft optional)
    useEffect(() => {
      if (typeof window !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            console.warn("Geolocation error:", error);
          }
        );
      }
    }, []);

    // Clear predictions when input is emptied
    useEffect(() => {
      if (value.trim().length === 0) {
        setPredictions([]);
        setDropdownVisible(false);
        setHighlightedIndex(-1);
        onPredictionsChange?.([]);
      }
    }, [value, onPredictionsChange]);

    // Debounced predictions fetch
    useEffect(() => {
      if (value.trim().length === 0 || !isPlacesReady) return;
      const handler = setTimeout(() => {
        autocompleteServiceRef.current?.getPlacePredictions(
          {
            input: value,
            componentRestrictions: { country: ["za"] },
            ...(userLocation && {
              location: new google.maps.LatLng(
                userLocation.lat,
                userLocation.lng
              ),
              radius: 30000,
            }),
            sessionToken: sessionTokenRef.current || undefined,
          },
          (results) => {
            const preds = results || [];
            setPredictions(preds);
            onPredictionsChange?.(preds);
            setDropdownVisible(preds.length > 0);
            if (preds.length > 0) setHighlightedIndex(-1);
          }
        );
      }, 300);
      return () => clearTimeout(handler);
    }, [value, userLocation, isPlacesReady, onPredictionsChange]);

    // Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent | TouchEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setDropdownVisible(false);
          setHighlightedIndex(-1);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, {
        passive: true,
      });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }, []);

    // Input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value);
      setDropdownVisible(true);
      setHighlightedIndex(-1);
    };

    // Keyboard accessibility
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isDropdownVisible || predictions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % predictions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(
          (prev) => (prev - 1 + predictions.length) % predictions.length
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && predictions[highlightedIndex]) {
          handleSelect(predictions[highlightedIndex]);
        } else if (value.trim().length > 0 && predictions.length > 0) {
          handleSelect(predictions[0]);
        } else if (value.trim().length > 0) {
          onPlaceSelect({
            name: value.trim(),
            formatted_address: value.trim(),
          } as PlaceResult);
          setDropdownVisible(false);
          setPredictions([]);
        }
      } else if (e.key === "Escape") {
        setDropdownVisible(false);
        inputInternalRef.current?.blur();
        onValueChange("");
      }
    };

    // Select a prediction
    const handleSelect = (
      prediction: google.maps.places.AutocompletePrediction
    ) => {
      setPredictions([]);
      setDropdownVisible(false);

      const service = placesServiceRef.current;
      if (!service) {
        console.error(
          "Google Places Service not available. Check API key and script loading."
        );
        onPlaceSelect({
          name: prediction.description,
          formatted_address: prediction.description,
        } as PlaceResult);
        onValueChange(prediction.description);
        return;
      }

      if (prediction.place_id) {
        service.getDetails(
          {
            placeId: prediction.place_id,
            fields: ["name", "formatted_address", "geometry"],
          },
          (
            placeDetails: google.maps.places.PlaceResult | null,
            status: google.maps.places.PlacesServiceStatus
          ) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              placeDetails
            ) {
              onPlaceSelect(placeDetails as PlaceResult);
              onValueChange(
                placeDetails.formatted_address ||
                  placeDetails.name ||
                  prediction.description
              );
              setLiveMessage(
                `Location selected: ${
                  placeDetails.formatted_address ||
                  placeDetails.name ||
                  prediction.description
                }`
              );
            } else {
              console.error("PlacesService.getDetails failed:", status);
              onPlaceSelect({
                name: prediction.description,
                formatted_address: prediction.description,
              } as PlaceResult);
              onValueChange(prediction.description);
              setLiveMessage(`Location selected: ${prediction.description}`);
            }
          }
        );
      } else {
        onPlaceSelect({
          name: prediction.description,
          formatted_address: prediction.description,
        } as PlaceResult);
        onValueChange(prediction.description);
        setLiveMessage(`Location selected: ${prediction.description}`);
      }
    };

    return (
      <div ref={containerRef} className={clsx("relative w-full", className)}>
        <input
          ref={inputInternalRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            // Keep current behavior: open dropdown if we have content…
            if (predictions.length > 0 || value.length > 0) {
              setDropdownVisible(true);
            }
            // …and bubble to parent if provided
            onFocus?.(e);
          }}
          placeholder={placeholder}
          className={clsx(
            "w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none",
            inputClassName
          )}
          role="combobox"
          aria-expanded={isDropdownVisible}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedIndex >= 0 && predictions[highlightedIndex]
              ? predictions[highlightedIndex].place_id ||
                `prediction-${highlightedIndex}`
              : undefined
          }
        />

        {showDropdown && isDropdownVisible && predictions.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="pac-container scrollbar-thin absolute left-0 top-full z-50 mt-2 max-h-60 w-full overflow-auto rounded-xl bg-white p-2 shadow-xl"
          >
            {predictions.map((prediction, index) => {
              const isActive = index === highlightedIndex;
              const placeName = prediction.structured_formatting.main_text;
              const placeDetails =
                prediction.structured_formatting.secondary_text;

              return (
                <div
                  key={
                    prediction.place_id || `${prediction.description}-${index}`
                  }
                  id={prediction.place_id || `prediction-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={() => handleSelect(prediction)}
                  className={clsx(
                    "flex min-h-[44px] cursor-pointer items-center px-4 py-2 text-sm",
                    isActive ? "bg-gray-100" : "hover:bg-gray-50"
                  )}
                  data-testid="location-option"
                >
                  <MapPinIcon className="mr-3 h-5 w-5 shrink-0 text-gray-400" />
                  <div>
                    <span className="font-medium text-gray-800">
                      {placeName}
                    </span>
                    {placeDetails && (
                      <span className="ml-2 text-gray-500">{placeDetails}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {liveMessage && (
          <div aria-live="polite" className="sr-only">
            {liveMessage}
          </div>
        )}
      </div>
    );
  }
);

LocationInput.displayName = "LocationInput";
export default LocationInput;
