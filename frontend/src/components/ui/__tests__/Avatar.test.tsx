import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import React from 'react';
import Avatar from '../Avatar';

describe('Avatar component', () => {
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
  });

  it('renders default placeholder avatar image when no props provided', () => {
    act(() => {
      root.render(<Avatar />);
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('avatar');
    expect(img?.getAttribute('src')).toContain('/default-avatar.svg');
    // wrapped in a rounded container with fixed size
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('40px');
    expect(wrapper.style.height).toBe('40px');
  });

  it('renders initials when provided and no src', () => {
    act(() => {
      root.render(<Avatar initials="A" />);
    });
    const img = container.querySelector('img');
    expect(img).toBeNull();
    expect(container.textContent).toBe('A');
  });
});
