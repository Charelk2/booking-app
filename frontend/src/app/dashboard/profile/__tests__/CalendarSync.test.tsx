import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import EditArtistProfilePage from '../edit/page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
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
  (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: { user_id: 1 } });
  (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: false } });
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('Google Calendar connect/disconnect', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('calls connect and disconnect endpoints', async () => {
    (api.connectGoogleCalendar as jest.Mock).mockResolvedValue({ data: { auth_url: 'http://auth' } });
    (api.disconnectGoogleCalendar as jest.Mock).mockResolvedValue({});
    const { div, root } = setup();
    await act(async () => {
      root.render(<EditArtistProfilePage />);
    });
    await act(async () => { await Promise.resolve(); });
    const connectBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent === 'Connect') as HTMLButtonElement;
    await act(async () => {
      connectBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.connectGoogleCalendar).toHaveBeenCalled();

    await act(async () => { await Promise.resolve(); });
    act(() => { root.unmount(); });
    const newRoot = createRoot(div);
    (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: true } });
    await act(async () => { newRoot.render(<EditArtistProfilePage />); });
    await act(async () => { await Promise.resolve(); });
    const disconnectBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent === 'Disconnect') as HTMLButtonElement;
    await act(async () => {
      disconnectBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.disconnectGoogleCalendar).toHaveBeenCalled();
    act(() => { newRoot.unmount(); });
    div.remove();
  });

  it('shows connection status', async () => {
    const { div, root } = setup();
    await act(async () => {
      root.render(<EditArtistProfilePage />);
    });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('Status: Not connected');
    act(() => { root.unmount(); });
    const newRoot = createRoot(div);
    (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ data: { connected: true } });
    await act(async () => { newRoot.render(<EditArtistProfilePage />); });
    await act(async () => { await Promise.resolve(); });
    expect(div.textContent).toContain('Status: Connected');
    act(() => { newRoot.unmount(); });
    div.remove();
  });
});
