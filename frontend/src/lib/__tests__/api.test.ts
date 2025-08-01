import api, {
  updateBookingRequestArtist,
  createPayment,
  updateBookingStatus,
  downloadBookingIcs,
  downloadQuotePdf,
  getMyArtistQuotes,
  getMyClientQuotes,
  updateQuoteAsArtist,
  updateQuoteAsClient,
  confirmQuoteBooking,
  acceptQuoteV2,
  createReviewForBooking,
  getReview,
  getServiceReviews,
} from '../api';
import type { AxiosRequestConfig } from 'axios';

describe('request interceptor', () => {
  const typedApi = api as unknown as {
    interceptors: {
      request: { handlers: { fulfilled: (c: AxiosRequestConfig) => AxiosRequestConfig }[] };
    };
  };
  const handler = typedApi.interceptors.request.handlers[0].fulfilled;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('adds Authorization header when token present', () => {
    localStorage.setItem('token', 'abc');
    const config: AxiosRequestConfig = { headers: {} };
    const result = handler(config);
    expect(result.headers!.Authorization).toBe('Bearer abc');
  });

  it('reads token from sessionStorage when available', () => {
    sessionStorage.setItem('token', 'def');
    const config: AxiosRequestConfig = { headers: {} };
    const result = handler(config);
    expect(result.headers!.Authorization).toBe('Bearer def');
  });

  it('removes Authorization header when token missing', () => {
    const config: AxiosRequestConfig = { headers: { Authorization: 'old' } };
    const result = handler(config);
    expect(result.headers!.Authorization).toBeUndefined();
  });

  it('returns config when window is undefined', () => {
    const g = global as unknown as { window?: unknown };
    const win = g.window;
    delete g.window;
    const config: AxiosRequestConfig = { headers: {} };
    expect(() => handler(config)).not.toThrow();
    expect(config.headers!.Authorization).toBeUndefined();
    g.window = win;
  });
});

describe('updateBookingRequestArtist', () => {
  it('calls the correct endpoint', async () => {
    const spy = jest.spyOn(api, 'put').mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await updateBookingRequestArtist(5, { status: 'request_declined' });
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/booking-requests/5/artist',
      { status: 'request_declined' },
    );
    spy.mockRestore();
  });
});

describe('updateBookingStatus', () => {
  it('patches the booking status endpoint', async () => {
    const spy = jest
      .spyOn(api, 'patch')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await updateBookingStatus(7, 'completed');
    expect(spy).toHaveBeenCalledWith('/api/v1/bookings/7/status', {
      status: 'completed',
    });
    spy.mockRestore();
  });
});

describe('downloadBookingIcs', () => {
  it('requests the calendar file as a blob', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: new Blob() } as unknown as { data: Blob });
    await downloadBookingIcs(2);
    expect(spy).toHaveBeenCalledWith('/api/v1/bookings/2/calendar.ics', {
      responseType: 'blob',
    });
    spy.mockRestore();
  });
});

describe('downloadQuotePdf', () => {
  it('requests the quote PDF as a blob', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: new Blob() } as unknown as { data: Blob });
    await downloadQuotePdf(5);
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/5/pdf', {
      responseType: 'blob',
    });
    spy.mockRestore();
  });
});

describe('createPayment', () => {
  it('posts to the payments endpoint', async () => {
    const spy = jest.spyOn(api, 'post').mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await createPayment({ booking_request_id: 3, amount: 50 });
    expect(spy).toHaveBeenCalledWith('/api/v1/payments', { booking_request_id: 3, amount: 50 });
    spy.mockRestore();
  });
});

describe('response interceptor', () => {
  const typedApi = api as unknown as {
    interceptors: {
      response: {
        handlers: { rejected: (e: unknown) => Promise<never> }[];
      };
    };
  };
  const rejected = typedApi.interceptors.response.handlers[0].rejected;

  it('maps HTTP status to user message when detail is missing', async () => {
    expect.assertions(1);
    const err: unknown = {
      isAxiosError: true,
      response: { status: 401, data: { detail: null } },
    };
    await rejected(err).catch((e: Error) => {
      expect(e.message).toBe('Authentication required. Please log in.');
    });
  });

  it('falls back to extracted detail and logs error', async () => {
    expect.assertions(2);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err: unknown = {
      isAxiosError: true,
      response: { status: 499, data: { detail: 'oops' } },
    };
    await rejected(err).catch((e: Error) => {
      expect(e.message).toBe('oops');
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses server detail when provided for 422', async () => {
    expect.assertions(1);
    const err: unknown = {
      isAxiosError: true,
      response: { status: 422, data: { detail: 'missing date' } },
    };
    await rejected(err).catch((e: Error) => {
      expect(e.message).toBe('missing date');
    });
  });
});

describe('getMyArtistQuotes', () => {
  it('requests quotes with params', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: [] } as unknown as { data: unknown });
    await getMyArtistQuotes({ skip: 1, limit: 5 });
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/me/artist', {
      params: { skip: 1, limit: 5 },
    });
    spy.mockRestore();
  });
});

describe('getMyClientQuotes', () => {
  it('requests client quotes with params', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: [] } as unknown as { data: unknown });
    await getMyClientQuotes({ skip: 2, limit: 10, status: 'pending' });
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/me/client', {
      params: { skip: 2, limit: 10, status: 'pending' },
    });
    spy.mockRestore();
  });
});

describe('updateQuoteAsArtist', () => {
  it('puts to the artist endpoint', async () => {
    const spy = jest
      .spyOn(api, 'put')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await updateQuoteAsArtist(2, { quote_details: 'hi' });
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/2/artist', {
      quote_details: 'hi',
    });
    spy.mockRestore();
  });
});

describe('updateQuoteAsClient', () => {
  it('puts to the client endpoint', async () => {
    const spy = jest
      .spyOn(api, 'put')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await updateQuoteAsClient(4, { status: 'accepted_by_client' });
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/4/client', {
      status: 'accepted_by_client',
    });
    spy.mockRestore();
  });
});

describe('confirmQuoteBooking', () => {
  it('posts to confirm-booking', async () => {
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await confirmQuoteBooking(3);
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/3/confirm-booking', {});
    spy.mockRestore();
  });
});

describe('acceptQuoteV2', () => {
  it('posts to accept endpoint', async () => {
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await acceptQuoteV2(2);
    expect(spy).toHaveBeenCalledWith('/api/v1/quotes/2/accept', {});
    spy.mockRestore();
  });

  it('appends service_id when provided', async () => {
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await acceptQuoteV2(2, 5);
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/quotes/2/accept?service_id=5',
      {},
    );
    spy.mockRestore();
  });
});

describe('review helpers', () => {
  it('creates a booking review', async () => {
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await createReviewForBooking(2, { rating: 5 });
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/reviews/bookings/2/reviews',
      { rating: 5 },
    );
    spy.mockRestore();
  });

  it('fetches a single review', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: {} } as unknown as { data: unknown });
    await getReview(5);
    expect(spy).toHaveBeenCalledWith('/api/v1/reviews/5');
    spy.mockRestore();
  });

  it('gets service reviews', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({ data: [] } as unknown as { data: unknown });
    await getServiceReviews(7);
    expect(spy).toHaveBeenCalledWith('/api/v1/services/7/reviews');
    spy.mockRestore();
  });
});

describe('getArtists', () => {
  it('passes include_price_distribution param when requested', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({
        data: { data: [], total: 0, price_distribution: [] },
      } as unknown as { data: unknown });
    await getArtists({ includePriceDistribution: true, page: 2 });
    expect(spy).toHaveBeenCalledWith('/api/v1/artist-profiles/', {
      params: { page: 2, include_price_distribution: true },
    });
    spy.mockRestore();
  });

  it('forwards the when parameter', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({
        data: { data: [], total: 0, price_distribution: [] },
      } as unknown as { data: unknown });
    await getArtists({ when: '2025-07-25' });
    expect(spy).toHaveBeenCalledWith('/api/v1/artist-profiles/', {
      params: { when: '2025-07-25' },
    });
    spy.mockRestore();
  });

  it('formats Date when parameter', async () => {
    const spy = jest
      .spyOn(api, 'get')
      .mockResolvedValue({
        data: { data: [], total: 0, price_distribution: [] },
      } as unknown as { data: unknown });
    await getArtists({ when: new Date('2025-07-25T22:00:00.000Z') });
    expect(spy).toHaveBeenCalledWith('/api/v1/artist-profiles/', {
      params: { when: '2025-07-25' },
    });
    spy.mockRestore();
  });
});
