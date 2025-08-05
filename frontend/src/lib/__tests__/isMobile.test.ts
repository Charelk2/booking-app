import isMobileScreen from '../isMobile';
import { BREAKPOINT_SM } from '@/lib/breakpoints';

describe('isMobileScreen', () => {
  const g = global as unknown as { window?: typeof window };
  const query = `(max-width: ${BREAKPOINT_SM - 1}px)`;

  it('returns true when screen width is below sm breakpoint', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn().mockImplementation((q) => ({
        matches: q === query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
      writable: true,
    });
    expect(isMobileScreen()).toBe(true);
  });

  it('returns false when screen width is sm breakpoint or wider', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
      writable: true,
    });
    expect(isMobileScreen()).toBe(false);
  });

  it('returns false when window is undefined', () => {
    const win = g.window;
    delete g.window;
    expect(isMobileScreen()).toBe(false);
    g.window = win;
  });
});
