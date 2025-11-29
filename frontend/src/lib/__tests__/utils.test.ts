import {
  extractErrorMessage,
  normalizeService,
  normalizeQuoteTemplate,
  getNextAvailableDates,
  getFullImageUrl,
  formatCurrency,
  formatStatus,
  generateQuoteNumber,
  applyDisplayOrder,
  getStreetFromAddress,
  getCityFromAddress,
} from '../utils';
import { DEFAULT_CURRENCY } from '../constants';
import { format } from 'date-fns';
import type { Service, ServiceProviderProfile, QuoteTemplate } from '@/types';

describe('extractErrorMessage', () => {
  it('returns the string unchanged when given a string', () => {
    expect(extractErrorMessage('failure')).toBe('failure');
  });

  it('joins messages from an array of objects', () => {
    const input = [{ msg: 'one' }, { msg: 'two' }];
    expect(extractErrorMessage(input)).toBe('one, two');
  });

  it('returns msg from an object', () => {
    const input = { msg: 'oops' };
    expect(extractErrorMessage(input)).toBe('oops');
  });

  it('handles unexpected values', () => {
    expect(extractErrorMessage(null)).toBe('An unexpected error occurred.');
    expect(extractErrorMessage(42)).toBe('42');
  });
});

describe('normalizeService', () => {
  it('converts price and duration to numbers', () => {
    const input: Service = {
      id: 1,
      artist_id: 1,
      title: 'Foo',
      description: 'Bar',
      media_url: 'img.jpg',
      service_type: 'Other',
      price: '12.5' as unknown as number,
      duration_minutes: '30' as unknown as number,
      display_order: 1,
      artist: {} as unknown as ServiceProviderProfile,
    };
    const normalized = normalizeService(input);
    expect(typeof normalized.price).toBe('number');
    expect(typeof normalized.duration_minutes).toBe('number');
    expect(normalized.price).toBeCloseTo(12.5);
    expect(normalized.duration_minutes).toBe(30);
  });
});

describe('applyDisplayOrder', () => {
  it('increments display_order sequentially', () => {
    const services: Service[] = [
      { id: 1, artist_id: 1, title: 'A', description: '', media_url: 'img.jpg', service_type: 'Other', duration_minutes: 10, display_order: 5, price: 1, artist: {} as ServiceProviderProfile },
      { id: 2, artist_id: 1, title: 'B', description: '', media_url: 'img.jpg', service_type: 'Other', duration_minutes: 10, display_order: 2, price: 1, artist: {} as ServiceProviderProfile },
    ];
    const ordered = applyDisplayOrder(services);
    expect(ordered[0].display_order).toBe(1);
    expect(ordered[1].display_order).toBe(2);
  });
});

describe('normalizeQuoteTemplate', () => {
  it('converts numeric strings to numbers', () => {
    const input = {
      id: 1,
      artist_id: 1,
      name: 'Foo',
      services: [{ description: 'X', price: '10' as unknown as number }],
      sound_fee: '2' as unknown as number,
      travel_fee: '3' as unknown as number,
      accommodation: null,
      discount: '1' as unknown as number,
      created_at: '',
      updated_at: '',
    } as QuoteTemplate;
    const tmpl = normalizeQuoteTemplate(input);
    expect(typeof tmpl.sound_fee).toBe('number');
    expect(typeof tmpl.services[0].price).toBe('number');
    expect(tmpl.sound_fee).toBe(2);
    expect(tmpl.services[0].price).toBe(10);
  });
});

describe('getNextAvailableDates', () => {
  it('returns the next available dates skipping unavailable ones', () => {
    const start = new Date('2024-06-10');
    const unavailable = ['2024-06-10', '2024-06-12'];
    const dates = getNextAvailableDates(unavailable, 3, 5, start);
    expect(dates.length).toBe(3);
    expect(format(dates[0], 'yyyy-MM-dd')).toBe('2024-06-11');
    expect(format(dates[1], 'yyyy-MM-dd')).toBe('2024-06-13');
    expect(format(dates[2], 'yyyy-MM-dd')).toBe('2024-06-14');
  });
});

describe('getFullImageUrl', () => {
  it('joins base url and path removing /api suffix', () => {
    const origEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://example.com/api';
    const result = getFullImageUrl('profile_pics/foo.jpg');
    expect(result).toBe('http://example.com/static/profile_pics/foo.jpg');
    if (origEnv === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = origEnv;
    }
  });

  it('returns absolute path unchanged', () => {
    const url = 'https://cdn.example.com/img.png';
    expect(getFullImageUrl(url)).toBe(url);
  });

  it('returns data URLs unchanged', () => {
    const url = 'data:image/png;base64,abc';
    expect(getFullImageUrl(url)).toBe(url);
  });
});

describe('formatCurrency', () => {
  it('formats numbers using DEFAULT_CURRENCY and locale', () => {
    expect(formatCurrency(1000.5)).toBe('R\u00A01\u00A0000,50');
  });

  it('uses the provided currency code', () => {
    expect(formatCurrency(100, 'USD')).toBe('US$100,00');
  });

  it('accepts a custom locale', () => {
    expect(formatCurrency(100, DEFAULT_CURRENCY, 'en-US')).toBe('ZAR\u00A0100.00');
  });

  it('uses currency from environment variable', async () => {
    process.env.NEXT_PUBLIC_DEFAULT_CURRENCY = 'EUR';
    jest.resetModules();
    const { formatCurrency: fmt } = await import('../utils');
    const { DEFAULT_CURRENCY: cur } = await import('../constants');
    expect(cur).toBe('EUR');
    expect(fmt(10)).toBe('€10,00');
    delete process.env.NEXT_PUBLIC_DEFAULT_CURRENCY;
  });

  it('fetches currency from API when env missing', async () => {
    delete process.env.NEXT_PUBLIC_DEFAULT_CURRENCY;
    jest.resetModules();
    const globals = global as typeof global & { fetch: jest.Mock };
    globals.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ default_currency: 'EUR' }),
    });
    const { fetchDefaultCurrency } = await import('../constants');
    const { formatCurrency: fmt } = await import('../utils');
    await fetchDefaultCurrency();
    expect(fmt(20)).toBe('€20,00');
    globals.fetch.mockRestore();
  });
});

describe('formatStatus', () => {
  it('uses predefined labels when available', () => {
    expect(formatStatus('pending_quote')).toBe('Pending Quote');
  });

  it('humanises unknown values', () => {
    expect(formatStatus('foo_bar')).toBe('Foo Bar');
  });
});

describe('getStreetFromAddress', () => {
  it('returns text before the first comma', () => {
    expect(getStreetFromAddress('123 Main St, Cape Town, South Africa')).toBe('123 Main St');
  });

  it('returns original when no comma is present', () => {
    expect(getStreetFromAddress('Cape Town')).toBe('Cape Town');
  });
});

describe('getCityFromAddress', () => {
  it('returns the city portion of a full address', () => {
    expect(
      getCityFromAddress('123 Main St, Suburb, Cape Town, Western Cape, South Africa'),
    ).toBe('Cape Town');
  });

  it('handles addresses without country or province', () => {
    expect(getCityFromAddress('123 Main St, Suburb, Durban')).toBe('Durban');
  });

  it('removes trailing postal codes and returns the city', () => {
    const addr = '123 Main St, Suburb, Worcester, 6850, Western Cape, South Africa';
    expect(getCityFromAddress(addr)).toBe('Worcester');
  });
});

describe('generateQuoteNumber', () => {
  it('returns a formatted quote number', () => {
    const quote = generateQuoteNumber();
    expect(quote).toMatch(/^Quote #\d{4}-\d{4}$/);
  });
});
