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

const CITY_TO_AIRPORT: Record<string, string> = {
  'Cape Town': 'CPT',
  George: 'GRJ',
  Johannesburg: 'JNB',
  Durban: 'DUR',
  Bloemfontein: 'BFN',
  'Port Elizabeth': 'PLZ',
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
 * Placeholder distance service. Replace with a real call to a mapping API.
 */
export async function getDrivingDistance(from: string, to: string): Promise<number> {
  // TODO: integrate with real distance API
  return 50;
}

/**
 * Determine whether flying or driving is cheaper between two locations.
 */
export async function calculateTravelMode(
  input: TravelInput,
  distanceFn: typeof getDrivingDistance = getDrivingDistance,
): Promise<TravelResult> {
  const artistCity = input.artistLocation.split(',')[0].trim();
  const eventCity = input.eventLocation.split(',')[0].trim();

  const departure = CITY_TO_AIRPORT[artistCity];
  const arrival = CITY_TO_AIRPORT[eventCity];

  if (!departure || !arrival) {
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

  const departureTransferKm = await distanceFn(input.artistLocation, departure);
  const localTransferKm = await distanceFn(arrival, input.eventLocation);
  const flightSubtotal = input.numTravellers * FLIGHT_COST_PER_PERSON;
  const transferCost = (departureTransferKm + localTransferKm) * RATE_PER_KM;
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

