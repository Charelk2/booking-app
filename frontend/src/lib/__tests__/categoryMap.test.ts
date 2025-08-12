import { categorySlug } from '@/lib/categoryMap';

describe('categoryMap helpers', () => {
  it('slugifies names consistently', () => {
    expect(categorySlug('MC & Host')).toBe('mc_host');
    expect(categorySlug('Wedding Venue')).toBe('wedding_venue');
    expect(categorySlug("DJ's")).toBe('dj');
    expect(categorySlug('Sound Services')).toBe('sound_service');
  });
});
