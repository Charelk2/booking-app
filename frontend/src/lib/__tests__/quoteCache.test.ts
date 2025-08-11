import api, { calculateQuote, clearQuoteCache } from '../api';

describe('calculateQuote cache', () => {
  beforeEach(() => {
    clearQuoteCache();
  });

  it('reuses cached responses for identical params', async () => {
    const params = { base_fee: 100, distance_km: 10 };
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { total: 123 } });

    const first = await calculateQuote(params);
    const second = await calculateQuote(params);

    expect(first.total).toBe(123);
    expect(second.total).toBe(123);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('expires cache entries after TTL', async () => {
    jest.useFakeTimers();

    const params = { base_fee: 100, distance_km: 10 };
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { total: 123 } });

    await calculateQuote(params);
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    await calculateQuote(params);

    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
    jest.useRealTimers();
  });

  it('evicts least recently used entries when max size exceeded', async () => {
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { total: 123 } });

    const baseParams = { base_fee: 100, distance_km: 10 };
    await calculateQuote(baseParams);

    for (let i = 0; i < 50; i += 1) {
      await calculateQuote({ base_fee: i, distance_km: i });
    }

    await calculateQuote(baseParams);

    expect(spy).toHaveBeenCalledTimes(52);
    spy.mockRestore();
  });
});
