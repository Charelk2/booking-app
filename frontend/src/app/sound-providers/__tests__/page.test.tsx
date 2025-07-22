import { flushPromises, nextTick } from "@/test/utils/flush";
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import SoundProvidersPage from '../page';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/lib/api');
jest.mock('@/contexts/AuthContext');
// eslint-disable-next-line react/display-name
jest.mock('@/components/layout/MainLayout', () => ({ children }: { children: React.ReactNode }) => <div>{children}</div>);


function setup() {
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 2, user_type: 'artist' } });
  (api.getSoundProviders as jest.Mock).mockResolvedValue({ data: [
    { id: 1, name: 'Provider', contact_info: 'c', price_per_event: 10 },
  ]});
  (api.getSoundProvidersForArtist as jest.Mock).mockResolvedValue({ data: [] });
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  return { div, root };
}

describe('SoundProvidersPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('allows editing providers', async () => {
    const { div, root } = setup();
    await act(async () => { root.render(<SoundProvidersPage />); });
    await flushPromises();
    const editBtn = div.querySelector('button[data-edit]') as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    await act(async () => {
      editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const nameInput = div.querySelector('input[data-edit-name]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    act(() => {
      nameInput.value = 'Updated';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveBtn = div.querySelector('button[data-save]') as HTMLButtonElement;
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(api.updateSoundProvider).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); });
    div.remove();
  });

  it('submits artist preferences', async () => {
    const { div, root } = setup();
    await act(async () => { root.render(<SoundProvidersPage />); });
    await flushPromises();
    const select = div.querySelector('select[data-pref-provider]') as HTMLSelectElement;
    act(() => {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const priorityInput = div.querySelector('input[data-pref-priority]') as HTMLInputElement;
    act(() => {
      priorityInput.value = '1';
      priorityInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addBtn = div.querySelector('button[data-add-pref]') as HTMLButtonElement;
    await act(async () => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushPromises();
    expect(api.addArtistSoundPreference).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); });
    div.remove();
  });
});
