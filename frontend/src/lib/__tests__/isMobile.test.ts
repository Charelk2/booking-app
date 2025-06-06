import isMobileScreen from '../isMobile';

describe('isMobileScreen', () => {
  const g = global as unknown as { window?: { innerWidth: number } };

  it('returns true when window width is below 640', () => {
    g.window = { innerWidth: 500 };
    expect(isMobileScreen()).toBe(true);
  });

  it('returns false when window width is 640 or more', () => {
    g.window = { innerWidth: 800 };
    expect(isMobileScreen()).toBe(false);
  });

  it('returns false when window is undefined', () => {
    const win = g.window;
    delete g.window;
    expect(isMobileScreen()).toBe(false);
    g.window = win;
  });
});
