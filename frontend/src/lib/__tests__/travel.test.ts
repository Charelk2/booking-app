import { calculateTravelMode } from '../travel';

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

