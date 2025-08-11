import api, { calculateQuote, __clearQuoteCache } from '../api';

describe('calculateQuote cache', () => {
  beforeEach(() => {
    __clearQuoteCache();
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
});
