import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import ThemeSwitcher from '../ThemeSwitcher';

describe('ThemeSwitcher', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.className = '';
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('matches snapshot', () => {
    act(() => {
      root.render(React.createElement(ThemeSwitcher));
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('toggles theme and stores preference', () => {
    act(() => {
      root.render(React.createElement(ThemeSwitcher));
    });
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
    expect(document.body.classList.contains('high-contrast')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('high-contrast');

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.body.classList.contains('high-contrast')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('default');
  });
});
