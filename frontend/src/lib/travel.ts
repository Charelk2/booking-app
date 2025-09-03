// Utilities for deciding the most cost-effective travel mode.

export interface TravelInput {
  artistLocation: string;
  eventLocation: string;
  numTravellers: number;
  drivingEstimate: number;
  /** Per-kilometer travel fee used for driving and transfers */
  travelRate?: number;
  /** Date of travel used for flight price lookups */
  travelDate: Date;
  /** Override default car rental cost */
  carRentalPrice?: number;
  /** Override flight price per traveller */
  flightPricePerPerson?: number;
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

const DEFAULT_FLIGHT_COST_PER_PERSON = 2780;
const DEFAULT_CAR_RENTAL_COST = 1000;
const RATE_PER_KM = 2.5;

/** Maximum one-way transfer drive time to/from any airport */
const MAX_TRANSFER_HOURS = 3;

/** If the direct drive to the gig exceeds this, force a flight (if reachable) */
const DIRECT_DRIVE_THRESHOLD_HOURS = 5;

/** Rough overhead for check-in, security, boarding, taxi etc. */
const FLIGHT_OVERHEAD_HOURS = 2;

/** Even if flight is tiny bit faster, we'll still drive if it's within this */
const DRIVE_COMFORT_BUFFER_HOURS = 0.5;

/** Notional “value of time” rate to convert hours into Rands */
const TIME_COST_RATE = 200;

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

export async function fetchFlightCost(
  depCode: string,
  arrCode: string,
  date: string | Date,
): Promise<number> {
  const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  const url = `/api/v1/flights/cheapest?departure=${depCode}&arrival=${arrCode}&date=${d}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const price = data.price;
    if (typeof price !== 'number') {
      throw new Error('Invalid price');
    }
    return price;
  } catch (err) {
    console.error('Flight cost fetch failed:', err);
    throw err;
  }
}

/**
 * Fetch geographic coordinates for a given city using the Google Geocoding API.
 * Returns `null` if the request fails or results are empty.
 */
export async function getCoordinates(
  city: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set');
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

/** Combined driving metrics so we can weight time against cost. */
export interface DriveMetrics {
  distanceKm: number;
  durationHrs: number;
}

/**
 * Fetch both distance (km) and duration (secs) from the backend and
 * convert the duration into hours. Returns zeros when the request fails.
 */
export async function getDrivingMetrics(
  from: string,
  to: string,
): Promise<DriveMetrics> {
  const url = `/api/v1/distance?from_location=${encodeURIComponent(
    from,
  )}&to_location=${encodeURIComponent(to)}&includeDuration=true`;

  // eslint-disable-next-line no-console -- debug request URL for troubleshooting
  console.log('Fetching metrics from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Distance endpoint HTTP error', res.status);
      return { distanceKm: 0, durationHrs: 0 };
    }
    const data = await res.json();
    const meters = data.rows?.[0]?.elements?.[0]?.distance?.value ?? 0;
    const secs = data.rows?.[0]?.elements?.[0]?.duration?.value ?? 0;
    return {
      distanceKm: meters / 1000,
      durationHrs: secs / 3600,
    };
  } catch (err) {
    console.error('Distance endpoint fetch failed:', err);
    return { distanceKm: 0, durationHrs: 0 };
  }
}

/**
 * Fetch driving distance in kilometers using Google's Distance Matrix API.
 *
 * Returns `0` if the request fails, the API key is missing, or the response
 * is invalid. Errors are logged to aid debugging but will not throw.
 */
export async function getDrivingDistance(
  from: string,
  to: string,
): Promise<number> {
  const metrics = await getDrivingMetrics(from, to);
  return metrics.distanceKm;
}

/**
 * Determine whether flying or driving is cheaper between two locations.
 */
export async function calculateTravelMode(
  input: TravelInput,
  metricsFn: typeof getDrivingMetrics = getDrivingMetrics,
  airportFn: typeof findNearestAirport = findNearestAirport,
): Promise<TravelResult> {
  const depCode = await airportFn(input.artistLocation);
  const arrCode = await airportFn(input.eventLocation);
  if (!depCode || !arrCode) {
    console.warn('Unable to resolve nearest airports', {
      artistLocation: input.artistLocation,
      eventLocation: input.eventLocation,
    });
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: makeEmptyFlyBreakdown(input, input.flightPricePerPerson ?? DEFAULT_FLIGHT_COST_PER_PERSON),
      },
    };
  }

  let flightPrice = input.flightPricePerPerson ?? DEFAULT_FLIGHT_COST_PER_PERSON;
  if (input.flightPricePerPerson == null) {
    try {
      flightPrice = await fetchFlightCost(
        depCode,
        arrCode,
        input.travelDate,
      );
    } catch (err) {
      // eslint-disable-next-line no-console -- log and fall back to default price
      console.error('Flight price lookup failed:', err);
    }
  }
  if (!FLIGHT_ROUTES[depCode]?.includes(arrCode)) {
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: makeEmptyFlyBreakdown(input, flightPrice),
      },
    };
  }

  const direct = await metricsFn(input.artistLocation, input.eventLocation);
  const depXfer = await metricsFn(
    input.artistLocation,
    AIRPORT_ADDRESSES[depCode],
  );
  const arrXfer = await metricsFn(
    AIRPORT_ADDRESSES[arrCode],
    input.eventLocation,
  );

  const flightsReachable =
    depXfer.durationHrs <= MAX_TRANSFER_HOURS &&
    arrXfer.durationHrs <= MAX_TRANSFER_HOURS;

  if (!flightsReachable) {
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: makeEmptyFlyBreakdown(input, flightPrice),
      },
    };
  }

  if (direct.durationHrs > DIRECT_DRIVE_THRESHOLD_HOURS) {
    return computeFlyResult(input, depXfer, arrXfer, flightPrice);
  }

  const totalFlyTime =
    depXfer.durationHrs + arrXfer.durationHrs + FLIGHT_OVERHEAD_HOURS;
  if (totalFlyTime > direct.durationHrs + DRIVE_COMFORT_BUFFER_HOURS) {
    return {
      mode: 'drive',
      totalCost: input.drivingEstimate,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: computeFlyBreakdown(input, depXfer, arrXfer, flightPrice),
      },
    };
  }

  const drivePenalty = direct.durationHrs * TIME_COST_RATE;
  const flyPenalty = totalFlyTime * TIME_COST_RATE;

  const adjustedDriveCost = input.drivingEstimate + drivePenalty;
  const flyBreakdown = computeFlyBreakdown(input, depXfer, arrXfer, flightPrice);
  const adjustedFlyCost = flyBreakdown.total + flyPenalty;

  if (adjustedFlyCost < adjustedDriveCost) {
    return {
      mode: 'fly',
      totalCost: flyBreakdown.total,
      breakdown: {
        drive: { estimate: input.drivingEstimate },
        fly: flyBreakdown,
      },
    };
  }

  return {
    mode: 'drive',
    totalCost: input.drivingEstimate,
    breakdown: {
      drive: { estimate: input.drivingEstimate },
      fly: flyBreakdown,
    },
  };
}

function makeEmptyFlyBreakdown(
  input: TravelInput,
  pricePerPerson: number,
): FlyBreakdown {
  const carRental = input.carRentalPrice ?? DEFAULT_CAR_RENTAL_COST;
  return {
    perPerson: pricePerPerson,
    travellers: input.numTravellers,
    flightSubtotal: 0,
    carRental: carRental,
    localTransferKm: 0,
    departureTransferKm: 0,
    transferCost: 0,
    total: 0,
  };
}

function computeFlyBreakdown(
  input: TravelInput,
  depXfer: DriveMetrics,
  arrXfer: DriveMetrics,
  pricePerPerson: number,
): FlyBreakdown {
  const flightSubtotal = input.numTravellers * pricePerPerson;
  const rate = input.travelRate ?? RATE_PER_KM;
  const transferCost = (depXfer.distanceKm + arrXfer.distanceKm) * rate * 2;
  const carRental = input.carRentalPrice ?? DEFAULT_CAR_RENTAL_COST;

  return {
    perPerson: pricePerPerson,
    travellers: input.numTravellers,
    flightSubtotal,
    carRental,
    localTransferKm: arrXfer.distanceKm,
    departureTransferKm: depXfer.distanceKm,
    transferCost,
    total: flightSubtotal + carRental + transferCost,
  };
}

function computeFlyResult(
  input: TravelInput,
  depXfer: DriveMetrics,
  arrXfer: DriveMetrics,
  pricePerPerson: number,
): TravelResult {
  const flyBreakdown = computeFlyBreakdown(
    input,
    depXfer,
    arrXfer,
    pricePerPerson,
  );
  return {
    mode: 'fly',
    totalCost: flyBreakdown.total,
    breakdown: {
      drive: { estimate: input.drivingEstimate },
      fly: flyBreakdown,
    },
  };
}
