import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import SendQuoteModal from '../SendQuoteModal';
import * as api from '@/lib/api';
import { flushPromises } from '@/test/utils/flush';

jest.mock('@/lib/api');

describe('SendQuoteModal', () => {
  beforeEach(() => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('prefills travel and sound fees', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <SendQuoteModal
          open
          onClose={() => {}}
          onSubmit={async () => {}}
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          initialBaseFee={500}
          initialTravelCost={150}
          initialSoundNeeded
        />,
      );
      await flushPromises();
    });

    const travelInput = div.querySelector('#travel-fee') as HTMLInputElement;
    const soundInput = div.querySelector('#sound-fee') as HTMLInputElement;
    expect(travelInput.value).toBe('150');
    expect(soundInput.value).toBe('250');

    act(() => {
      root.unmount();
    });
    div.remove();
  });

  it('renders full screen on mobile', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SendQuoteModal
          open
          onClose={() => {}}
          onSubmit={async () => {}}
          artistId={1}
          clientId={2}
          bookingRequestId={3}
        />,
      );
      await flushPromises();
    });

    const sheet = div.querySelector('[data-testid="send-quote-modal"]');
    expect(sheet?.querySelector('.h-screen')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
