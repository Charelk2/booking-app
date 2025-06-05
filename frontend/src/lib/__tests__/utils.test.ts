import { extractErrorMessage, normalizeService } from '../utils';
import type { Service, ArtistProfile } from '@/types';

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
      service_type: 'Other',
      price: '12.5' as unknown as number,
      duration_minutes: '30' as unknown as number,
      display_order: 1,
      artist: {} as unknown as ArtistProfile,
    };
    const normalized = normalizeService(input);
    expect(typeof normalized.price).toBe('number');
    expect(typeof normalized.duration_minutes).toBe('number');
    expect(normalized.price).toBeCloseTo(12.5);
    expect(normalized.duration_minutes).toBe(30);
  });
});
