import api from '../api';
import type { AxiosRequestConfig } from 'axios';

describe('request interceptor', () => {
  const handler = (api as any).interceptors.request.handlers[0].fulfilled;

  beforeEach(() => {
    localStorage.clear();
  });

  it('adds Authorization header when token present', () => {
    localStorage.setItem('token', 'abc');
    const config: AxiosRequestConfig = { headers: {} };
    const result = handler(config);
    expect(result.headers!.Authorization).toBe('Bearer abc');
  });

  it('removes Authorization header when token missing', () => {
    const config: AxiosRequestConfig = { headers: { Authorization: 'old' } };
    const result = handler(config);
    expect(result.headers!.Authorization).toBeUndefined();
  });

  it('returns config when window is undefined', () => {
    const g = global as any;
    const win = g.window;
    delete g.window;
    const config: AxiosRequestConfig = { headers: {} };
    expect(() => handler(config)).not.toThrow();
    expect(config.headers!.Authorization).toBeUndefined();
    g.window = win;
  });
});
