import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ServiceProviderCardCompact from '../ServiceProviderCardCompact';

function setup(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const allProps = {
    serviceProviderId: 1,
    name: 'Test',
    href: '/1',
    ...props,
  };
  return { container, root, allProps };
}

describe('ServiceProviderCardCompact', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders core structure with image, name, and link', () => {
    const { container, root, allProps } = setup();
    act(() => {
      root.render(React.createElement(ServiceProviderCardCompact, allProps));
    });
    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/1');
    expect(container.textContent).toContain('Test');
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // default avatar when no imageUrl provided
    expect(img?.getAttribute('src')).toContain('/default-avatar.svg');
    act(() => root.unmount());
    container.remove();
  });

  it('ignores subtitle and categories props', () => {
    const { container, root, allProps } = setup({ subtitle: 'DJ', categories: ['Photographer'] });
    act(() => {
      root.render(React.createElement(ServiceProviderCardCompact, allProps));
    });
    expect(container.textContent).not.toContain('DJ');
    expect(container.textContent).not.toContain('Photographer');
    act(() => root.unmount());
    container.remove();
  });

  it('shows only the city when full address is provided', () => {
    const { container, root, allProps } = setup({
      location: '123 Main St, Suburb, Worcester, 6850, Western Cape, South Africa',
    });
    act(() => {
      root.render(React.createElement(ServiceProviderCardCompact, allProps));
    });
    // formatCityRegion should collapse to "Worcester, Western Cape"
    expect(container.textContent).toContain('Worcester');
    expect(container.textContent).toContain('Western Cape');
    expect(container.textContent).not.toContain('123 Main St');
    expect(container.textContent).not.toContain('Suburb');
    expect(container.textContent).not.toContain('6850');
    act(() => root.unmount());
    container.remove();
  });
});
