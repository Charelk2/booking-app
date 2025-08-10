import { render, screen } from '@testing-library/react';
import ServiceProviderServiceCard from '@/components/service-provider/ServiceProviderServiceCard';
import type { Service } from '@/types';

describe('ServiceProviderServiceCard', () => {
  const baseService: Service = {
    id: 1,
    artist_id: 1,
    title: 'Test Service',
    description: 'desc',
    media_url: '/test.jpg',
    service_type: 'Live Performance',
    duration_minutes: 60,
    display_order: 1,
    price: 100,
    artist: {} as any,
  };

  it('renders service media image when media_url is provided', () => {
    render(<ServiceProviderServiceCard service={baseService} onBook={jest.fn()} />);
    const img = screen.getByRole('img', { name: baseService.title });
    expect(img).toBeTruthy();
  });
});
