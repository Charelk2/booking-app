import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import AlertBanner from '../AlertBanner';

describe('AlertBanner component', () => {
  function renderBanner(variant?: 'success' | 'info' | 'error') {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<AlertBanner variant={variant}>Message</AlertBanner>);
    });
    return { container, root };
  }

  it('renders info variant by default', () => {
    const { container, root } = renderBanner();
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-blue-50');
    expect(div.textContent).toBe('Message');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders success variant', () => {
    const { container, root } = renderBanner('success');
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-green-50');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders error variant', () => {
    const { container, root } = renderBanner('error');
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-red-50');
    act(() => { root.unmount(); });
    container.remove();
  });
});
