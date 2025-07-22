import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import SendQuoteModal from '../SendQuoteModal';
import * as api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const flushPromises = () =>
  new Promise<void>((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });

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
    expect(inputs[0].disabled).toBe(false);
    expect(inputs[1].disabled).toBe(false);
    expect(inputs[2].disabled).toBe(false);
    await act(async () => {
      inputs[0].value = '6';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '2';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].value = '3';
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(inputs[0].value).toBe('6');
    expect(inputs[1].value).toBe('2');
    expect(inputs[2].value).toBe('3');
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
    const summary = Array.from(div.querySelectorAll('div.text-sm')).find((el) =>
      el.textContent?.includes('Subtotal')
    ) as HTMLDivElement;
    expect(summary.textContent).toContain(formatCurrency(8));
    root.unmount();
  });

  it('adds item row styled like fee rows', async () => {
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
    const addButton = Array.from(div.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Item'),
    ) as HTMLButtonElement;
    expect(addButton).not.toBeNull();
    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const dynamicRow = Array.from(div.querySelectorAll('div')).find((el) =>
      el.className.includes('border') &&
      Array.from(el.children).some(
        (c) => (c as HTMLElement).getAttribute('placeholder') === 'Description',
      ),
    ) as HTMLDivElement;
    expect(dynamicRow).not.toBeNull();
    const classes = [
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
      'font-normal',
      'mb-2',
      'border',
      'rounded',
      'p-2',
    ];
    classes.forEach((cls) => {
      expect(dynamicRow.className).toContain(cls);
    });
    root.unmount();
  });

  it('shows remove button for a single added item', async () => {
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
    const addButton = Array.from(div.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Item'),
    ) as HTMLButtonElement;
    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const removeButton = div.querySelector('button[aria-label="Remove item"]');
    expect(removeButton).not.toBeNull();
    root.unmount();
  });

  it('matches snapshot', async () => {
    (api.getQuoteTemplates as jest.Mock).mockResolvedValue({ data: [] });
    jest.spyOn(Math, 'random').mockReturnValue(0.3772);
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
    await act(async () => {
      await flushPromises();
    });
    expect(div.firstChild).toMatchSnapshot();
    root.unmount();
    (Math.random as jest.Mock).mockRestore();
  });
});
