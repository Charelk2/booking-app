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
  className?: string; // wrapper di
  inputClassName?: string; // input element
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"]; // mobile keyboard hint
  onPredictionsChange?: (
    predictions: google.maps.places.AutocompletePrediction[]
  ) => void;
  showDropdown?: boolean;
  /** NEW: bubble input focus to parent if needed */
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  /** When true, only show towns/cities and fill input with the town name (ZA only). */
  cityOnly?: boolean;
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
      enterKeyHint,
      showDropdown = true,
      onFocus, // NEW
      cityOnly = false,
    },
    ref
  ) => {
    const [predictions, setPredictions] =
      useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [isFocused, setFocused] = useState(false);
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
    // Suppress immediate autocomplete reopen/fetch after a selection
    const suppressAutocompleteRef = useRef(false);

    // Lazily initialize Google Places API on user intent (focus/typing)
    const initStartedRef = useRef(false);
    const ensurePlacesReady = async () => {
      if (isPlacesReady || initStartedRef.current) return;
      initStartedRef.current = true;
      const places = await loadPlaces();
      if (!places || typeof document === 'undefined') {
        initStartedRef.current = false;
        return;
      }
      try {
        autocompleteServiceRef.current = new places.AutocompleteService();
        placesServiceRef.current = new places.PlacesService(document.createElement("div"));
        sessionTokenRef.current = new places.AutocompleteSessionToken();
        setIsPlacesReady(true);
      } finally {
        // keep initStartedRef true to avoid retrigger loops even if Places fails
      }
    };

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
      if (suppressAutocompleteRef.current) return;
      const handler = setTimeout(() => {
        const req: any = {
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
        };
        if (cityOnly) {
          // Prefer cities in predictions
          req.types = ["(cities)"];
        }
        autocompleteServiceRef.current?.getPlacePredictions(
          req,
          (results) => {
            let preds = results || [];
            if (cityOnly) {
              // In cityOnly mode, ensure we list unique city names, with province if present (strip country)
              const seen = new Set<string>();
              preds = preds
                .map((p) => {
                  const city = p.structured_formatting?.main_text || p.description || "";
                  let secondary = p.structured_formatting?.secondary_text || "";
                  secondary = secondary.replace(/,?\s*South Africa$/i, "").trim();
                  const key = `${city}|${secondary}`;
                  return { p, city, secondary, key } as const;
                })
                .filter((x) => {
                  if (!x.city) return false;
                  if (seen.has(x.key)) return false;
                  seen.add(x.key);
                  return true;
                })
                .map((x) => x.p);

              // Fallback: If no cities returned, derive cities from general predictions
              if (preds.length === 0) {
                const fallbackReq: any = { ...req };
                delete fallbackReq.types;
                autocompleteServiceRef.current?.getPlacePredictions(
                  fallbackReq,
                  (fallback) => {
                    const items = (fallback || []).map((p) => {
                      const sec = p.structured_formatting?.secondary_text || '';
                      const cleaned = sec.replace(/,?\s*South Africa$/i, '').trim();
                      const [cityGuess, provinceGuess] = cleaned.split(/,\s*/);
                      const city = cityGuess || p.structured_formatting?.main_text || '';
                      const province = provinceGuess || '';
                      const key = `${city}|${province}`;
                      return { city, province, key, original: p };
                    });
                    const uniqSeen = new Set<string>();
                    const transformed = items
                      .filter((it) => it.city && !uniqSeen.has(it.key) && (uniqSeen.add(it.key) || true))
                      .map((it) => ({
                        ...it.original,
                        structured_formatting: {
                          ...(it.original.structured_formatting as any),
                          main_text: it.city,
                          secondary_text: it.province ? `${it.province}` : (it.original.structured_formatting?.secondary_text || ''),
                        },
                      } as google.maps.places.AutocompletePrediction));
                    setPredictions(transformed);
                    onPredictionsChange?.(transformed);
                    setDropdownVisible(isFocused && transformed.length > 0);
                    if (transformed.length > 0) setHighlightedIndex(-1);
                  }
                );
                return; // Stop normal flow; fallback path will update state
              }
            }
            setPredictions(preds);
            onPredictionsChange?.(preds);
            // Only show dropdown when user has focused the input
            setDropdownVisible(isFocused && preds.length > 0);
            if (preds.length > 0) setHighlightedIndex(-1);
          }
        );
      }, 300);
      return () => clearTimeout(handler);
    }, [value, userLocation, isPlacesReady, onPredictionsChange, isFocused]);

    // Close dropdown on outside click
    useEffect(() => {
      if (typeof document === "undefined") return;
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
      // Kick off Places load on first keystroke to keep UX snappy
      void ensurePlacesReady();
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

      if (cityOnly) {
        // Prefer only the Town/City name for the input value.
        const main = prediction.structured_formatting?.main_text || prediction.description || '';
        let secondary = prediction.structured_formatting?.secondary_text || '';
        // Strip country, then try to extract the city from secondary when main is a suburb.
        secondary = secondary.replace(/,?\s*South Africa$/i, '').trim();
        const parts = secondary.split(/,\s*/).filter(Boolean);
        let city = '';
        if (parts.length >= 1) {
          // Usually parts[0] is the city/town when main is a suburb; if it's actually the province, we'll fall back to main.
          city = parts[0];
        }
        if (!city) city = main;
        const displayCity = city;

        const fakePlace: PlaceResult = {
          name: displayCity,
          formatted_address: `${displayCity}, South Africa`,
        } as any;
        onPlaceSelect(fakePlace);
        onValueChange(displayCity);
        setLiveMessage(`Location selected: ${displayCity}`);
        suppressAutocompleteRef.current = true;
        setTimeout(() => {
          suppressAutocompleteRef.current = false;
        }, 600);
        return;
      }

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

              const name = (placeDetails.name || "").trim();
              const formatted = (placeDetails.formatted_address || "").trim();
              let combined: string;

              if (name && formatted) {
                const nameLower = name.toLowerCase();
                const formattedLower = formatted.toLowerCase();
                // Avoid duplicating the name when it already prefixes the formatted address.
                if (
                  formattedLower === nameLower ||
                  formattedLower.startsWith(nameLower + ",")
                ) {
                  combined = formatted;
                } else {
                  combined = `${name}, ${formatted}`;
                }
              } else {
                combined = formatted || name || prediction.description;
              }

              onValueChange(combined);
              setLiveMessage(`Location selected: ${combined}`);
              suppressAutocompleteRef.current = true;
              setTimeout(() => {
                suppressAutocompleteRef.current = false;
              }, 600);
            } else {
              console.error("PlacesService.getDetails failed:", status);
              onPlaceSelect({
                name: prediction.description,
                formatted_address: prediction.description,
              } as PlaceResult);
              onValueChange(prediction.description);
              setLiveMessage(`Location selected: ${prediction.description}`);
              suppressAutocompleteRef.current = true;
              setTimeout(() => {
                suppressAutocompleteRef.current = false;
              }, 600);
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
        suppressAutocompleteRef.current = true;
        setTimeout(() => {
          suppressAutocompleteRef.current = false;
        }, 600);
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
            setFocused(true);
            // Initialize Places on first focus
            void ensurePlacesReady();
            // Keep current behavior: open dropdown if we have content…
            if (predictions.length > 0) {
              setDropdownVisible(true);
            }
            // …and bubble to parent if provided
            onFocus?.(e);
          }}
          onBlur={() => {
            setFocused(false);
            setDropdownVisible(false);
          }}
          placeholder={placeholder}
          enterKeyHint={enterKeyHint}
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
              let placeName = prediction.structured_formatting.main_text;
              let placeDetails = prediction.structured_formatting.secondary_text;
              if (cityOnly) {
                // Ensure we present City, Province (without country)
                if (placeDetails) {
                  placeDetails = placeDetails.replace(/,?\s*South Africa$/i, '').trim();
                }
              }

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
                    <span className="font-medium text-gray-800">{placeName}</span>
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
