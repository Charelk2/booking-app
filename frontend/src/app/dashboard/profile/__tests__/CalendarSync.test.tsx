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

const flushPromises = async () => {
  await act(async () => {});
};

function setup(calendarParam: string | null = null, status = false) {
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 1, user_type: 'artist' } });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue({
    get: (key: string) => (key === 'calendarSync' ? calendarParam : null),
  });
  (api.getArtistProfileMe as jest.Mock).mockResolvedValue({ data: { user_id: 1 } });
  (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({
    data: { connected: status, email: status ? 'test@example.com' : undefined },
  });
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
    await flushPromises();
    const connectBtn = Array.from(div.querySelectorAll('button')).find((b) => b.textContent === 'Connect') as HTMLButtonElement;
    await act(async () => {
      connectBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(api.connectGoogleCalendar).toHaveBeenCalled();

    await flushPromises();
    act(() => { root.unmount(); });
    const newRoot = createRoot(div);
    (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({
      data: { connected: true, email: 'test@example.com' },
    });
    await act(async () => { newRoot.render(<EditArtistProfilePage />); });
    await flushPromises();
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
    await flushPromises();
    expect(div.textContent).toContain('Status: Not connected');
    act(() => { root.unmount(); });
    const newRoot = createRoot(div);
    (api.getGoogleCalendarStatus as jest.Mock).mockResolvedValue({
      data: { connected: true, email: 'test@example.com' },
    });
    await act(async () => { newRoot.render(<EditArtistProfilePage />); });
    await flushPromises();
    expect(div.textContent).toContain('Status: Connected - test@example.com');
    act(() => { newRoot.unmount(); });
    div.remove();
  });

  it('displays success message from query param', async () => {
    const { div, root } = setup('success', true);
    await act(async () => {
      root.render(<EditArtistProfilePage />);
    });
    await flushPromises();
    expect(div.textContent).toContain('Google Calendar connected successfully!');
    expect(div.textContent).toContain('Status: Connected - test@example.com');
    act(() => { root.unmount(); });
    div.remove();
  });

  it('displays error message from query param', async () => {
    const { div, root } = setup('error');
    await act(async () => {
      root.render(<EditArtistProfilePage />);
    });
    await flushPromises();
    expect(div.textContent).toContain('Failed to connect Google Calendar.');
    expect(div.textContent).toContain('Status: Not connected');
    act(() => { root.unmount(); });
    div.remove();
  });
});
