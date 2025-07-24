import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistsPageHeader from '../ArtistsPageHeader';

jest.mock('@/hooks/useMediaQuery', () => jest.fn(() => true));

describe('ArtistsPageHeader iconOnly', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders only the funnel icon when iconOnly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ArtistsPageHeader
          iconOnly
          initialMinPrice={0}
          initialMaxPrice={100}
          verifiedOnly={false}
          onFilterApply={jest.fn()}
          onFilterClear={jest.fn()}
          onSearchEdit={jest.fn()}
        />,
      );
    });

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('');
    const icon = button?.querySelector('svg');
    expect(icon).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
