import { flushPromises, nextTick } from "@/test/utils/flush";
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import EditArtistProfilePage from '../edit/page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/profile/edit'),
}));
jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});


function setup() {
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'artist' } });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
  (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: { user_id: 1, portfolio_image_urls: ['/img1.jpg', '/img2.jpg'] } });
  (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: false } });
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('Portfolio images upload and reorder', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('uploads images and reorders them', async () => {
    (api.uploadMyArtistPortfolioImages as jest.Mock).mockResolvedValue({
      data: { portfolio_image_urls: ['/img1.jpg', '/img2.jpg', '/img3.jpg'] },
    });
    (api.updateMyArtistPortfolioImageOrder as jest.Mock).mockResolvedValue({ data: {} });
    const { div, root } = setup();
    await act(async () => {
      root.render(<EditArtistProfilePage />);
    });
    await flushPromises();
    const input = div.querySelector('#portfolioImagesInput') as HTMLInputElement;
    const file = new File(['1'], 'a.jpg', { type: 'image/jpeg' });
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.uploadMyArtistPortfolioImages).toHaveBeenCalled();
    await flushPromises();
    const items = div.querySelectorAll('[data-testid="portfolio-item"]');
    expect(items.length).toBe(3);
    await act(async () => {
      items[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
      items[1].dispatchEvent(new Event('drop', { bubbles: true }));
    });
    expect(api.updateMyArtistPortfolioImageOrder).toHaveBeenCalled();
    act(() => { root.unmount(); });
    div.remove();
  });
});
