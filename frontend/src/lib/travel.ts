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

const MINUTE = 60_000;
const FLIGHT_CACHE_TTL = 60 * MINUTE;
const flightCache = new Map<string, { at: number; price: number }>();

export async function fetchFlightCost(
  depCode: string,
  arrCode: string,
  date: string | Date,
): Promise<number> {
  const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  const key = `${depCode}__${arrCode}__${d}`;
  const hit = flightCache.get(key);
  if (hit && Date.now() - hit.at < FLIGHT_CACHE_TTL) {
    return hit.price;
  }
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
    flightCache.set(key, { at: Date.now(), price });
    return price;
  } catch (err) {
    console.error('Flight cost fetch failed:', err);
    const fallback = DEFAULT_FLIGHT_COST_PER_PERSON;
    flightCache.set(key, { at: Date.now(), price: fallback });
    return fallback;
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

const airportCache = new Map<string, { at: number; code: string | null }>();
const AIRPORT_CACHE_TTL = 12 * 60 * MINUTE;

export async function findNearestAirport(
  city: string,
  coordFn: typeof getCoordinates = getCoordinates,
): Promise<string | null> {
  const k = (city || '').trim().toLowerCase();
  if (!k) return null;

  const cached = airportCache.get(k);
  if (cached && Date.now() - cached.at < AIRPORT_CACHE_TTL) {
    return cached.code;
  }

  let nearest: string | null = null;
  let minDist = Infinity;
  try {
    const entries = Object.entries(AIRPORT_ADDRESSES);
    const results = await Promise.all(
      entries.map(async ([code, addr]) => {
        try {
          const metrics = await getDrivingMetricsCached(city, addr);
          return { code, distKm: metrics?.distanceKm ?? 0 };
        } catch {
          return { code, distKm: 0 };
        }
      }),
    );
    for (const { code, distKm } of results) {
      if (distKm > 0 && distKm < minDist) {
        minDist = distKm;
        nearest = code;
      }
    }
  } catch {
    // Fall through to coordinate-based fallback below
  }
  if (nearest) {
    airportCache.set(k, { at: Date.now(), code: nearest });
    return nearest;
  }

  // Fallback: when the distance API is unavailable, fall back to geocoding +
  // haversine so behavior in development remains graceful.
  const coords = await coordFn(city);
  if (!coords) {
    airportCache.set(k, { at: Date.now(), code: null });
    return null;
  }
  nearest = null;
  minDist = Infinity;
  Object.entries(AIRPORT_LOCATIONS).forEach(([code, loc]) => {
    const dist = haversineDistance(coords, loc);
    if (dist < minDist) {
      minDist = dist;
      nearest = code;
    }
  });
  airportCache.set(k, { at: Date.now(), code: nearest });
  return nearest;
}

// Simple fallback coordinates for local development when network is blocked.
const MOCK_COORDS: Record<string, { lat: number; lng: number }> = {
  'Mossel Bay, South Africa': { lat: -34.1831, lng: 22.158 },
  'Paarl, South Africa': { lat: -33.7342, lng: 18.9621 },
  // Common South African cities used in booking flows
  'Stellenbosch, South Africa': { lat: -33.9249, lng: 18.8602 },
  Stellenbosch: { lat: -33.9249, lng: 18.8602 },
  'Pretoria, South Africa': { lat: -25.7479, lng: 28.2293 },
  Pretoria: { lat: -25.7479, lng: 28.2293 },
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

// Small in-memory caches to reduce repeated geocoding and routing calls
export type DrivingMetrics = { distanceKm: number; durationMin: number; durationHrs: number };

const routeCache = new Map<string, { at: number; v: DrivingMetrics }>();
const geoCache = new Map<string, { at: number; v: { lat: number; lng: number } }>();

function remember<K, V>(map: Map<K, { at: number; v: V }>, key: K, val: V, ttlMs = 30 * MINUTE) {
  map.set(key, { at: Date.now(), v: val });
  // Simple size-bound eviction
  if (map.size > 500) {
    const first = map.keys().next();
    if (!first.done) map.delete(first.value as K);
  }
}

export async function geocodeCached(address: string): Promise<{ lat: number; lng: number } | null> {
  const k = (address || '').trim().toLowerCase();
  if (!k) return null;
  const e = geoCache.get(k);
  if (e && Date.now() - e.at < 60 * MINUTE) return e.v;
  try {
    // Reuse existing getCoordinates which already wraps Google Geocoding
    const res = await getCoordinates(address);
    if (res) remember(geoCache, k, res, 60 * MINUTE);
    return res;
  } catch {
    return null;
  }
}

export async function getDrivingMetricsCached(from: string, to: string): Promise<DrivingMetrics> {
  const key = `${(from || '').trim().toLowerCase()}__${(to || '').trim().toLowerCase()}`;
  const e = routeCache.get(key);
  if (e && Date.now() - e.at < 30 * MINUTE) return e.v;
  const raw = await getDrivingMetrics(from, to);
  const v: DrivingMetrics = {
    distanceKm: raw?.distanceKm || 0,
    durationMin: Math.round((raw?.durationHrs || 0) * 60),
    durationHrs: raw?.durationHrs || 0,
  };
  remember(routeCache, key, v, 30 * MINUTE);
  return v;
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

  // Only log in development to avoid noisy consoles in production
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console -- debug request URL for troubleshooting
    console.log('Fetching metrics from:', url);
  }
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
  metricsFn: typeof getDrivingMetrics = getDrivingMetricsCached,
  airportFn: typeof findNearestAirport = findNearestAirport,
): Promise<TravelResult> {
  const [depCode, arrCode] = await Promise.all([
    airportFn(input.artistLocation),
    airportFn(input.eventLocation),
  ]);
  const rate = input.travelRate ?? RATE_PER_KM;

  if (!depCode || !arrCode) {
    // When we cannot resolve airports for either side, fall back to a
    // direct driving estimate using Distance Matrix so travel never
    // silently collapses to zero.
    let drivingEstimate = input.drivingEstimate;
    if (!drivingEstimate || drivingEstimate <= 0) {
      try {
        const direct = await metricsFn(input.artistLocation, input.eventLocation);
        if (direct && Number.isFinite(direct.distanceKm) && direct.distanceKm > 0) {
          drivingEstimate = direct.distanceKm * rate * 2;
        } else {
          drivingEstimate = 0;
        }
      } catch {
        drivingEstimate = 0;
      }
    }

    return {
      mode: 'drive',
      totalCost: drivingEstimate,
      breakdown: {
        drive: { estimate: drivingEstimate },
        fly: makeEmptyFlyBreakdown(input, input.flightPricePerPerson ?? DEFAULT_FLIGHT_COST_PER_PERSON),
      },
    };
  }

  const hasCustomFlightPrice = input.flightPricePerPerson != null;

  const [direct, depXfer, arrXfer, flightPrice] = await Promise.all([
    metricsFn(input.artistLocation, input.eventLocation),
    metricsFn(input.artistLocation, AIRPORT_ADDRESSES[depCode]),
    metricsFn(AIRPORT_ADDRESSES[arrCode], input.eventLocation),
    (async () => {
      if (hasCustomFlightPrice) return input.flightPricePerPerson!;
      return fetchFlightCost(depCode, arrCode, input.travelDate);
    })(),
  ]);

  // If there is no supported flight route between the inferred airports,
  // fall back to a pure driving estimate using Distance Matrix so travel
  // never silently becomes zero.
  if (!FLIGHT_ROUTES[depCode]?.includes(arrCode)) {
    const drivingEstimate =
      input.drivingEstimate && input.drivingEstimate > 0
        ? input.drivingEstimate
        : direct.distanceKm * rate * 2;
    const price = input.flightPricePerPerson ?? DEFAULT_FLIGHT_COST_PER_PERSON;
    return {
      mode: 'drive',
      totalCost: drivingEstimate,
      breakdown: {
        drive: { estimate: drivingEstimate },
        fly: makeEmptyFlyBreakdown(input, price),
      },
    };
  }

  const flightsReachable =
    depXfer.durationHrs <= MAX_TRANSFER_HOURS &&
    arrXfer.durationHrs <= MAX_TRANSFER_HOURS;

  const drivingEstimate =
    input.drivingEstimate && input.drivingEstimate > 0
      ? input.drivingEstimate
      : direct.distanceKm * rate * 2;

  if (!flightsReachable) {
    return {
      mode: 'drive',
      totalCost: drivingEstimate,
      breakdown: {
        drive: { estimate: drivingEstimate },
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
    const flyBreakdown = computeFlyBreakdown(
      input,
      depXfer,
      arrXfer,
      flightPrice,
    );
    return {
      mode: 'drive',
      totalCost: drivingEstimate,
      breakdown: {
        drive: { estimate: drivingEstimate },
        fly: flyBreakdown,
      },
    };
  }

  const drivePenalty = direct.durationHrs * TIME_COST_RATE;
  const flyPenalty = totalFlyTime * TIME_COST_RATE;

  const flyBreakdown = computeFlyBreakdown(
    input,
    depXfer,
    arrXfer,
    flightPrice,
  );

  const adjustedDriveCost = drivingEstimate + drivePenalty;
  const adjustedFlyCost = flyBreakdown.total + flyPenalty;

  if (adjustedFlyCost < adjustedDriveCost) {
    return {
      mode: 'fly',
      totalCost: flyBreakdown.total,
      breakdown: {
        drive: { estimate: drivingEstimate },
        fly: flyBreakdown,
      },
    };
  }

  return {
    mode: 'drive',
    totalCost: drivingEstimate,
    breakdown: {
      drive: { estimate: drivingEstimate },
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
  const rate = input.travelRate ?? RATE_PER_KM;
  const drivingEstimate =
    input.drivingEstimate && input.drivingEstimate > 0
      ? input.drivingEstimate
      : depXfer.distanceKm && arrXfer.distanceKm
        ? (depXfer.distanceKm + arrXfer.distanceKm) * rate * 2
        : 0;
  return {
    mode: 'fly',
    totalCost: flyBreakdown.total,
    breakdown: {
      drive: { estimate: drivingEstimate },
      fly: flyBreakdown,
    },
  };
}
