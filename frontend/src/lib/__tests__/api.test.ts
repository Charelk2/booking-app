import api, { updateBookingRequestArtist, createPayment } from '../api';
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

  it('maps HTTP status to user message', async () => {
    expect.assertions(1);
    const err: unknown = {
      isAxiosError: true,
      response: { status: 401, data: { detail: 'unauth' } },
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
});
