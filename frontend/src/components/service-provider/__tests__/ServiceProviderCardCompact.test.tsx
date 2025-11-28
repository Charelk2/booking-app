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

  it('matches snapshot', () => {
    const { container, root, allProps } = setup();
    act(() => {
      root.render(React.createElement(ServiceProviderCardCompact, allProps));
    });
    expect(container.firstChild).toMatchSnapshot();
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
    expect(container.textContent).toContain('Worcester');
    expect(container.textContent).not.toContain('123 Main St');
    expect(container.textContent).not.toContain('Suburb');
    expect(container.textContent).not.toContain('6850');
    expect(container.textContent).not.toContain('Western Cape');
    act(() => root.unmount());
    container.remove();
  });
});
