import { calculateTravelMode, getDrivingDistance } from '../travel';

describe('calculateTravelMode', () => {
  it('returns drive when no direct flight route exists', async () => {
    const result = await calculateTravelMode(
      {
        artistLocation: 'George, South Africa',
        eventLocation: 'Durban, South Africa',
        numTravellers: 2,
        drivingEstimate: 1500,
      },
      async () => 10,
    );

    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(1500);
  });

  it('selects fly when cheaper than driving', async () => {
    const distanceStub = jest.fn(async (from: string, to: string) => {
      if (from.startsWith('Cape Town') && to === 'CPT') return 20;
      if (from === 'JNB' && to.startsWith('Johannesburg')) return 30;
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
    );

    expect(result.mode).toBe('fly');
    expect(result.totalCost).toBeCloseTo(3625);
    expect(result.breakdown.fly.flightSubtotal).toBe(2500);
    expect(distanceStub).toHaveBeenCalledTimes(2);
  });

  it('defaults to drive when driving is cheaper', async () => {
    const result = await calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 2000,
      },
      async () => 50,
    );

    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(2000);
  });
});

describe('getDrivingDistance', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'abc123' };
  });

  afterEach(() => {
    process.env = originalEnv;
    const globals = global as typeof global & { fetch?: jest.Mock };
    globals.fetch?.mockRestore?.();
  });

  it('calls Google API and returns kilometers', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [{ elements: [{ status: 'OK', distance: { value: 1234 } }] }],
      }),
    });

    const km = await getDrivingDistance('A', 'B');
    expect(globals.fetch).toHaveBeenCalledWith(
      expect.stringContaining('distancematrix'),
    );
    expect(globals.fetch.mock.calls[0][0]).toContain('key=abc123');
    expect(km).toBeCloseTo(1.234);
  });

  it('returns 0 on fetch error', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockRejectedValue(new Error('fail'));
    const km = await getDrivingDistance('A', 'B');
    expect(km).toBe(0);
  });
});

