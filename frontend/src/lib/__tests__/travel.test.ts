import { calculateTravelMode, getDrivingDistance } from '../travel';

describe('calculateTravelMode', () => {
  it('returns drive when no direct flight route exists', async () => {
    const airportStub = jest.fn(async (city: string) => {
      if (city.startsWith('George')) return 'GRJ';
      if (city.startsWith('Durban')) return 'DUR';
      return null;
    });
    const result = await calculateTravelMode(
      {
        artistLocation: 'George, South Africa',
        eventLocation: 'Durban, South Africa',
        numTravellers: 2,
        drivingEstimate: 1500,
      },
      async () => 10,
      airportStub,
    );
    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(1500);
    expect(airportStub).toHaveBeenCalledTimes(2);
  });

  it('selects fly when cheaper than driving', async () => {
    const airportStub = jest.fn(async (city: string) => {
      if (city.startsWith('Cape Town')) return 'CPT';
      if (city.startsWith('Johannesburg')) return 'JNB';
      return null;
    });
    const distanceStub = jest.fn(async (_from: string, to: string) => {
      if (to.includes('International Airport')) return 20;
      if (to.includes('Johannesburg')) return 30;
      return 0;
    });
    const result = await calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 5000,
      },
      distanceStub,
      airportStub,
    );
    expect(result.mode).toBe('fly');
    expect(result.totalCost).toBeCloseTo(3750);
    expect(result.breakdown.fly.flightSubtotal).toBe(2500);
    expect(distanceStub).toHaveBeenCalledTimes(2);
    expect(airportStub).toHaveBeenCalledTimes(2);
  });

  it('defaults to drive when driving is cheaper', async () => {
    const airportStub = jest.fn(async () => 'CPT');
    const result = await calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 2000,
      },
      async () => 50,
      airportStub,
    );
    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(2000);
  });

  it('falls back to drive on airport lookup failure', async () => {
    const airportStub = jest.fn(async () => null);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await calculateTravelMode(
      {
        artistLocation: 'Nowhere',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 3000,
      },
      async () => 20,
      airportStub,
    );
    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(3000);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('getDrivingDistance', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_API_URL: 'http://api' };
  });

  afterEach(() => {
    process.env = originalEnv;
    const globals = global as typeof global & { fetch?: jest.Mock };
    globals.fetch?.mockRestore?.();
  });

  it('calls distance endpoint and returns kilometers', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [{ elements: [{ status: 'OK', distance: { value: 1234 } }] }],
      }),
    });
    const km = await getDrivingDistance('A', 'B');
    expect(globals.fetch).toHaveBeenCalledWith(
      'http://api/api/v1/distance?from_location=A&to_location=B',
    );
    expect(km).toBeCloseTo(1.234);
  });

  it('returns 0 on fetch error', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockRejectedValue(new Error('fail'));
    const km = await getDrivingDistance('A', 'B');
    expect(km).toBe(0);
  });
});
