// Utilities for deciding the most cost-effective travel mode.

export interface TravelInput {
  artistLocation: string;
  eventLocation: string;
  numTravellers: number;
  drivingEstimate: number;
}

export interface FlyBreakdown {
  perPerson: number;
  travellers: number;
  flightSubtotal: number;
  carRental: number;
  localTransferKm: number;
  departureTransferKm: number;
  transferCost: number;
  total: number;
}

export interface TravelResult {
  mode: 'fly' | 'drive';
  totalCost: number;
  breakdown: {
    drive: { estimate: number };
    fly: FlyBreakdown;
  };
}

const FLIGHT_COST_PER_PERSON = 2500;
const CAR_RENTAL_COST = 1000;
const RATE_PER_KM = 2.5;

export const AIRPORT_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  CPT: { lat: -33.9715, lng: 18.6021 },
  GRJ: { lat: -34.0056, lng: 22.3789 },
  JNB: { lat: -26.1392, lng: 28.246 },
  DUR: { lat: -29.6144, lng: 31.1197 },
  BFN: { lat: -29.0927, lng: 26.3024 },
  PLZ: { lat: -33.9849, lng: 25.6173 },
};

// Readable airport addresses improve Distance Matrix lookups. Using
// coordinates sometimes yields ZERO_RESULTS because the lat/lng may not
// represent a road-accessible point. Names resolve to the correct drop-off
// location so transfer distances are accurate.
export const AIRPORT_ADDRESSES: Record<string, string> = {
  CPT: 'Cape Town International Airport, Cape Town, South Africa',
  GRJ: 'George Airport, George, South Africa',
  JNB: 'O. R. Tambo International Airport, Kempton Park, South Africa',
  DUR: 'King Shaka International Airport, Durban, South Africa',
  BFN: 'Bram Fischer International Airport, Bloemfontein, South Africa',
  PLZ: 'Chief Dawid Stuurman International Airport, Gqeberha, South Africa',
};

const FLIGHT_ROUTES: Record<string, string[]> = {
  CPT: ['JNB', 'BFN', 'DUR', 'PLZ', 'GRJ'],
  GRJ: ['JNB', 'CPT'],
  JNB: ['CPT', 'BFN', 'DUR', 'PLZ', 'GRJ'],
  DUR: ['CPT', 'JNB'],
  BFN: ['CPT', 'JNB'],
  PLZ: ['CPT', 'JNB'],
};

/**
 * Fetch geographic coordinates for a given city using the Google Geocoding API.
 * Returns `null` if the request fails or results are empty.
 */
export async function getCoordinates(
  city: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    console.warn('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set');
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    city,
  )}&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Geocoding API HTTP error', res.status);
      return null;
    }
    const data = await res.json();
    if (data.status !== 'OK') {
      console.error('Geocoding API response status:', data.status);
      return null;
    }
    const loc = data.results?.[0]?.geometry?.location;
    if (!loc) {
      console.error('Geocoding API missing location data');
      return null;
    }
    return { lat: loc.lat, lng: loc.lng };
  } catch (err) {
    console.error('Geocoding API fetch failed:', err);
    return null;
  }
}

export function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export async function findNearestAirport(
  city: string,
  coordFn: typeof getCoordinates = getCoordinates,
): Promise<string | null> {
  const coords = await coordFn(city);
  if (!coords) return null;
  let nearest: string | null = null;
  let minDist = Infinity;
  Object.entries(AIRPORT_LOCATIONS).forEach(([code, loc]) => {
    const dist = haversineDistance(coords, loc);
    if (dist < minDist) {
      minDist = dist;
      nearest = code;
    }
  });
  return nearest;
}

// Simple fallback coordinates for local development when network is blocked.
const MOCK_COORDS: Record<string, { lat: number; lng: number }> = {
  'Mossel Bay, South Africa': { lat: -34.1831, lng: 22.158 },
  'Paarl, South Africa': { lat: -33.7342, lng: 18.9621 },
};

export function getMockCoordinates(
  city: string,
): { lat: number; lng: number } | null {
  return MOCK_COORDS[city] || null;
}

/**
 * Fetch driving distance in kilometers using Google's Distance Matrix API.
 *
 * Returns `0` if the request fails, the API key is missing, or the response
 * is invalid. Errors are logged to aid debugging but will not throw.
 */
export async function getDrivingDistance(from: string, to: string): Promise<number> {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const url =
    `${base}/api/v1/distance?from_location=${encodeURIComponent(
      from,
    )}&to_location=${encodeURIComponent(to)}`;

  // Log the fully constructed URL so we can inspect the exact request
  // sent to the backend proxy. This helps diagnose encoding or
  // formatting issues that may lead to ZERO_RESULTS from Google.
  // eslint-disable-next-line no-console
  console.log('Fetching distance from:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Distance endpoint HTTP error', res.status);
      return 0;
    }
    const data = await res.json();
    if (data.error) {
      console.error('Distance endpoint error:', data.error);
      return 0;
    }
    if (data.status && data.status !== 'OK') {
      console.error('Distance API status:', data.status);
      return 0;
    }
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.distance?.value) {
      console.error('Distance element status:', element?.status);
      return 0;
    }
    return element.distance.value / 1000;
  } catch (err) {
    console.error('Distance endpoint fetch failed:', err);
    return 0;
  }
}

/**
 * Determine whether flying or driving is cheaper between two locations.
 */
export async function calculateTravelMode(
  input: TravelInput,
  distanceFn: typeof getDrivingDistance = getDrivingDistance,
  airportFn: typeof findNearestAirport = findNearestAirport,
): Promise<TravelResult> {
  const departure = await airportFn(input.artistLocation);
  const arrival = await airportFn(input.eventLocation);

  if (!departure || !arrival) {
    console.warn('Unable to resolve nearest airports', {
      artistLocation: input.artistLocation,
      eventLocation: input.eventLocation,
    });
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: {
          perPerson: FLIGHT_COST_PER_PERSON,
          travellers: input.numTravellers,
          flightSubtotal: 0,
          carRental: CAR_RENTAL_COST,
          localTransferKm: 0,
          departureTransferKm: 0,
          transferCost: 0,
          total: 0,
        },
      },
    };
  }

  if (!FLIGHT_ROUTES[departure]?.includes(arrival)) {
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: {
          perPerson: FLIGHT_COST_PER_PERSON,
          travellers: input.numTravellers,
          flightSubtotal: 0,
          carRental: CAR_RENTAL_COST,
          localTransferKm: 0,
          departureTransferKm: 0,
          transferCost: 0,
          total: 0,
        },
      },
    };
  }

  const departureLoc = AIRPORT_LOCATIONS[departure];
  const arrivalLoc = AIRPORT_LOCATIONS[arrival];
  const departureAddress = AIRPORT_ADDRESSES[departure];
  const arrivalAddress = AIRPORT_ADDRESSES[arrival];
  const departureTransferKm = await distanceFn(
    input.artistLocation,
    departureAddress || `${departureLoc.lat},${departureLoc.lng}`,
  );
  const localTransferKm = await distanceFn(
    arrivalAddress || `${arrivalLoc.lat},${arrivalLoc.lng}`,
    input.eventLocation,
  );
  const flightSubtotal = input.numTravellers * FLIGHT_COST_PER_PERSON;
  // Transfers require a return trip in each direction
  // so we double the distance-based cost.
  const transferCost =
    (departureTransferKm + localTransferKm) * RATE_PER_KM * 2;
  const flyTotal = flightSubtotal + CAR_RENTAL_COST + transferCost;

  if (flyTotal < input.drivingEstimate) {
    return {
      mode: 'fly',
      totalCost: flyTotal,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: {
          perPerson: FLIGHT_COST_PER_PERSON,
          travellers: input.numTravellers,
          flightSubtotal,
          carRental: CAR_RENTAL_COST,
          localTransferKm,
          departureTransferKm,
          transferCost,
          total: flyTotal,
        },
      },
    };
  }

  return {
    mode: 'drive',
    totalCost: input.drivingEstimate,
    breakdown: {
      drive: { estimate: input.drivingEstimate },
      fly: {
        perPerson: FLIGHT_COST_PER_PERSON,
        travellers: input.numTravellers,
        flightSubtotal,
        carRental: CAR_RENTAL_COST,
        localTransferKm,
        departureTransferKm,
        transferCost,
        total: flyTotal,
      },
    },
  };
}

