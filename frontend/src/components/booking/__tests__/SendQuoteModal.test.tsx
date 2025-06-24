import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import SendQuoteModal from '../SendQuoteModal';
import * as api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

jest.mock('@/lib/api');

describe('SendQuoteModal', () => {
  it('loads templates and applies selection', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          artist_id: 2,
          name: 'Base',
          services: [{ description: 'A', price: 5 }],
          sound_fee: 1,
          travel_fee: 2,
          accommodation: null,
          discount: null,
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SendQuoteModal
          open
          onClose={() => {}}
          onSubmit={() => {}}
          artistId={2}
          clientId={3}
          bookingRequestId={4}
          serviceName="Live Performance"
        />,
      );
    });
    const select = div.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    await act(async () => {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const inputs = div.querySelectorAll('input[type="number"]');
    expect(inputs[0].value).toBe('5'); // service fee
    expect(inputs[1].value).toBe('1'); // sound fee
    expect(inputs[2].value).toBe('2'); // travel fee
    const serviceLabel = div.querySelector('label[for="service-fee"]');
    const soundLabel = div.querySelector('label[for="sound-fee"]');
    const travelLabel = div.querySelector('label[for="travel-fee"]');
    const discountLabel = div.querySelector('label[for="discount"]');
    const accommodationLabel = div.querySelector('label[for="accommodation"]');
    const expiryLabel = div.querySelector('label[for="expires-hours"]');
    expect(serviceLabel?.textContent).toContain('Live Performance fee');
    expect(soundLabel?.textContent).toContain('Sound fee');
    expect(travelLabel?.textContent).toContain('Travel fee');
    expect(discountLabel?.textContent).toContain('Discount');
    expect(accommodationLabel?.textContent).toContain('Accommodation');
    expect(expiryLabel?.textContent).toContain('Expires in');
    root.unmount();
  });

  it('shows formatted totals', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          artist_id: 2,
          name: 'Base',
          services: [{ description: 'A', price: 5 }],
          sound_fee: 1,
          travel_fee: 2,
          accommodation: null,
          discount: null,
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SendQuoteModal
          open
          onClose={() => {}}
          onSubmit={() => {}}
          artistId={2}
          clientId={3}
          bookingRequestId={4}
          serviceName="Live Performance"
        />,
      );
    });
    const select = div.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const summary = div.querySelector('div.text-sm.mt-2') as HTMLDivElement;
    expect(summary.textContent).toContain(formatCurrency(8));
    root.unmount();
  });

  it('matches snapshot', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({ data: [] });
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SendQuoteModal
          open
          onClose={() => {}}
          onSubmit={() => {}}
          artistId={1}
          clientId={2}
          bookingRequestId={3}
          serviceName="Live Performance"
        />,
      );
    });
    expect(div.firstChild).toMatchSnapshot();
    root.unmount();
  });
});
