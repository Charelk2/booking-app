import { flushPromises } from '@/test/utils/flush';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ProviderOnboardingModal from '../ProviderOnboardingModal';
import { useAuth } from '@/contexts/AuthContext';
import { becomeServiceProvider } from '@/lib/api';
import { useRouter } from 'next/navigation';

jest.mock('@/lib/api');

const mockUseAuth = useAuth as jest.Mock;
const mockBecomeServiceProvider = becomeServiceProvider as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

describe('ProviderOnboardingModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it('shows a success step and redirects on CTA', async () => {
    const onClose = jest.fn();
    const refreshUser = jest.fn().mockResolvedValue(undefined);
    const replace = jest.fn();

    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        user_type: 'client',
        email: 'client@example.com',
        first_name: 'Client',
        last_name: 'User',
        phone_number: '',
      },
      refreshUser,
    });
    mockUseRouter.mockReturnValue({ replace });
    mockBecomeServiceProvider.mockResolvedValue({});

    await act(async () => {
      root.render(
        <ProviderOnboardingModal
          isOpen
          onClose={onClose}
          next="/dashboard/profile/edit?from=become-provider"
        />,
      );
    });
    await flushPromises();

    const phoneInput = container.querySelector(
      'input[placeholder="+27 82 123 4567"]',
    ) as HTMLInputElement | null;
    expect(phoneInput).toBeTruthy();
    if (!phoneInput) throw new Error('Missing phone input');

    await act(async () => {
      phoneInput.value = '+27821234567';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const termsCheckbox = container.querySelector(
      '#acceptProviderTerms',
    ) as HTMLInputElement | null;
    expect(termsCheckbox).toBeTruthy();
    if (!termsCheckbox) throw new Error('Missing terms checkbox');

    await act(async () => {
      termsCheckbox.click();
    });

    const submitButton = container.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null;
    expect(submitButton).toBeTruthy();
    if (!submitButton) throw new Error('Missing submit button');

    await act(async () => {
      submitButton.click();
    });
    await flushPromises();

    expect(mockBecomeServiceProvider).toHaveBeenCalledTimes(1);
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent || '').toContain('Your details are saved');

    const editProfileButton = Array.from(
      container.querySelectorAll('button'),
    ).find((b) => b.textContent === 'Edit profile') as HTMLButtonElement | undefined;
    expect(editProfileButton).toBeTruthy();

    await act(async () => {
      editProfileButton && editProfileButton.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/dashboard/profile/edit?from=become-provider');
  });
});

