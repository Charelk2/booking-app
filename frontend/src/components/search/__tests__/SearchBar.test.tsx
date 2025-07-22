import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SearchBar from '../SearchBar';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));



describe('SearchBar location input', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('updates location via autocomplete and pushes correct URL', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBar />);
    });

    const mock = (global as { mockAutocomplete: jest.Mock }).mockAutocomplete;
    const instance = mock.mock.instances[0];
    instance.getPlace.mockReturnValue({ formatted_address: 'Cape Town' });

    await act(async () => {
      instance._cb();
      await flushPromises();
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
      await flushPromises();
    });

    expect(push).toHaveBeenCalledWith(
      '/artists?category=Live+Performance&location=Cape+Town',
    );

    act(() => root.unmount());
    container.remove();
  });

  it('opens map modal on button click', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBar />);
    });

    const openBtn = container.querySelector('[data-testid="open-map-modal"]') as HTMLButtonElement;
    act(() => {
      openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="location-map-modal"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('closes map modal on button click', async () => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SearchBar />);
    });

    const openBtn = container.querySelector('[data-testid="open-map-modal"]') as HTMLButtonElement;
    act(() => {
      openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const closeBtn = document
      .querySelector('[data-testid="location-map-modal"] button[type="button"]') as HTMLButtonElement;

    await act(async () => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('[data-testid="location-map-modal"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

