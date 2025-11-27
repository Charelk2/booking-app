import * as travel from '../travel';

describe('travel.calculateTravelMode', () => {
  let fetchFlightCostSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchFlightCostSpy = jest.spyOn(travel, 'fetchFlightCost').mockResolvedValue(9999);
  });

  afterEach(() => {
    fetchFlightCostSpy.mockRestore();
  });

  it('returns drive when no direct flight route exists', async () => {
    fetchFlightCostSpy.mockResolvedValue(3000);
    const airportStub = jest.fn(async (city: string) => {
      if (city.startsWith('George')) return 'GRJ';
      if (city.startsWith('Durban')) return 'DUR';
      return null;
    });
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'George, South Africa',
        eventLocation: 'Durban, South Africa',
        numTravellers: 2,
        drivingEstimate: 1500,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      async () => ({ distanceKm: 0, durationHrs: 0 }),
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
    const metricsStub = jest.fn(async (from: string, to: string) => {
      if (to.includes('Cape Town International Airport')) {
        return { distanceKm: 20, durationHrs: 0.5 };
      }
      if (from.includes('O. R. Tambo International Airport')) {
        return { distanceKm: 30, durationHrs: 0.5 };
      }
      return { distanceKm: 50, durationHrs: 3 };
    });
    fetchFlightCostSpy.mockResolvedValue(1200);
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 5000,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
        flightPricePerPerson: 1200,
      },
      metricsStub,
      airportStub,
    );
    expect(result.mode).toBe('fly');
    expect(result.breakdown.fly.flightSubtotal).toBe(1200);
    expect(metricsStub).toHaveBeenCalledTimes(3);
    expect(airportStub).toHaveBeenCalledTimes(2);
  });

  it('defaults to drive when driving is cheaper', async () => {
    fetchFlightCostSpy.mockResolvedValue(3000);
    const airportStub = jest.fn(async () => 'CPT');
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 2000,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      async () => ({ distanceKm: 50, durationHrs: 3 }),
      airportStub,
    );
    expect(result.mode).toBe('drive');
    expect(result.totalCost).toBe(2000);
  });

  it('falls back to drive on airport lookup failure', async () => {
    const airportStub = jest.fn(async () => null);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'Nowhere',
        eventLocation: 'Johannesburg, South Africa',
        numTravellers: 1,
        drivingEstimate: 0,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      async () => ({ distanceKm: 20, durationHrs: 1 }),
      airportStub,
    );
    expect(result.mode).toBe('drive');
    // 20 km * 2.5 * 2 (roundtrip)
    expect(result.totalCost).toBeCloseTo(100);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('derives driving estimate from metrics when no route and drivingEstimate is zero', async () => {
    const airportStub = jest.fn(async (city: string) => {
      if (city.startsWith('George')) return 'GRJ';
      if (city.startsWith('Durban')) return 'DUR';
      return null;
    });
    const metricsStub = jest.fn(async () => ({ distanceKm: 123, durationHrs: 2 }));
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'George, South Africa',
        eventLocation: 'Durban, South Africa',
        numTravellers: 1,
        drivingEstimate: 0,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      metricsStub,
      airportStub,
    );
    expect(result.mode).toBe('drive');
    // 123 km * 2.5 * 2 (roundtrip)
    expect(result.totalCost).toBeCloseTo(615);
  });

  it('returns drive when transfer time exceeds limit', async () => {
    fetchFlightCostSpy.mockResolvedValue(3000);
    const airportStub = jest.fn(async () => 'CPT');
    const metricsStub = jest.fn(async (from: string, to: string) => {
      if (to.includes('Cape Town International Airport')) {
        return { distanceKm: 10, durationHrs: 4 };
      }
      if (from.includes('Cape Town International Airport')) {
        return { distanceKm: 10, durationHrs: 2 };
      }
      return { distanceKm: 100, durationHrs: 1 };
    });
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Pretoria, South Africa',
        numTravellers: 1,
        drivingEstimate: 500,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      metricsStub,
      airportStub,
    );
    expect(result.mode).toBe('drive');
  });

  it('forces fly when direct drive is very long', async () => {
    fetchFlightCostSpy.mockResolvedValue(400);
    const airportStub = jest.fn(async (city: string) => {
      if (city.startsWith('Cape Town')) return 'CPT';
      if (city.startsWith('Windhoek')) return 'JNB';
      return null;
    });
    const metricsStub = jest.fn(async (from: string, to: string) => {
      if (from.includes('Cape Town International Airport') || to.includes('Cape Town International Airport')) {
        return { distanceKm: 10, durationHrs: 1 };
      }
      if (from.includes('O. R. Tambo International Airport') || to.includes('O. R. Tambo International Airport')) {
        return { distanceKm: 10, durationHrs: 1 };
      }
      return { distanceKm: 900, durationHrs: 9 };
    });
    const result = await travel.calculateTravelMode(
      {
        artistLocation: 'Cape Town, South Africa',
        eventLocation: 'Windhoek, Namibia',
        numTravellers: 1,
        drivingEstimate: 10000,
        travelRate: 2.5,
        travelDate: new Date('2025-01-01'),
      },
      metricsStub,
      airportStub,
    );
    expect(result.mode).toBe('fly');
  });
});

describe('travel.getDrivingDistance', () => {
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
        rows: [
          {
            elements: [
              { status: 'OK', distance: { value: 1234 }, duration: { value: 3600 } },
            ],
          },
        ],
      }),
    });
    const km = await travel.getDrivingDistance('A', 'B');
    expect(globals.fetch).toHaveBeenCalledWith(
      'http://api/api/v1/distance?from_location=A&to_location=B&includeDuration=true',
    );
    expect(km).toBeCloseTo(1.234);
  });

  it('returns 0 on fetch error', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockRejectedValue(new Error('fail'));
    const km = await travel.getDrivingDistance('A', 'B');
    expect(km).toBe(0);
  });
});

describe('travel.getDrivingMetrics', () => {
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

  it('parses distance and duration', async () => {
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          {
            elements: [
              { status: 'OK', distance: { value: 2000 }, duration: { value: 1800 } },
            ],
          },
        ],
      }),
    });
    const metrics = await travel.getDrivingMetrics('A', 'B');
    expect(globals.fetch).toHaveBeenCalledWith(
      'http://api/api/v1/distance?from_location=A&to_location=B&includeDuration=true',
    );
    expect(metrics.distanceKm).toBeCloseTo(2);
    expect(metrics.durationHrs).toBeCloseTo(0.5);
  });
});
