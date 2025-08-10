import { updateQueryParams, type RouterLike } from '../urlParams';

const router: RouterLike = { push: jest.fn() };

afterEach(() => {
  (router.push as jest.Mock).mockClear();
});

describe('updateQueryParams', () => {
  it('formats Date objects as YYYY-MM-DD', () => {
    const d = new Date('2025-07-25T22:00:00.000Z');
    updateQueryParams(router, '/service-providers', { when: d });
    expect(router.push).toHaveBeenCalledWith('/service-providers?when=2025-07-25');
  });
});
