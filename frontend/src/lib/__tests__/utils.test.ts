import { extractErrorMessage } from '../utils';

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
