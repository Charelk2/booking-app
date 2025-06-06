import isMobileScreen from '../isMobile';

describe('isMobileScreen', () => {
  const g = global as unknown as { window?: { innerWidth: number } };

  it('returns true when window width is below 640', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    expect(isMobileScreen()).toBe(true);
  });

  it('returns false when window width is 640 or more', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
    expect(isMobileScreen()).toBe(false);
  });

  it('returns false when window is undefined', () => {
    const win = g.window;
    delete g.window;
    expect(isMobileScreen()).toBe(false);
    g.window = win;
  });
});
