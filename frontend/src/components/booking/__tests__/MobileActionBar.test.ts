import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import MobileActionBar from '../MobileActionBar';

describe('MobileActionBar', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows Next button when showNext is true', () => {
    act(() => {
      root.render(
        React.createElement(MobileActionBar, {
          showBack: true,
          onBack: () => {},
          showNext: true,
          onNext: () => {},
          onSaveDraft: () => {},
          onSubmit: () => {},
          submitting: false,
        }),
      );
    });
    expect(container.textContent).toContain('Next');
  });

  it('shows submit actions when showNext is false', () => {
    act(() => {
      root.render(
        React.createElement(MobileActionBar, {
          showBack: false,
          onBack: () => {},
          showNext: false,
          onNext: () => {},
          onSaveDraft: () => {},
          onSubmit: () => {},
          submitting: false,
        }),
      );
    });
    expect(container.textContent).toContain('Save Draft');
    expect(container.textContent).toContain('Submit');
  });

  it('moves to bottom when scrolling down', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    act(() => {
      root.render(
        React.createElement(MobileActionBar, {
          showBack: false,
          onBack: () => {},
          showNext: true,
          onNext: () => {},
          onSaveDraft: () => {},
          onSubmit: () => {},
          submitting: false,
        }),
      );
    });
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('bottom-14');
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(bar?.className).toContain('bottom-0');
  });

  it('applies pb-safe padding', () => {
    act(() => {
      root.render(
        React.createElement(MobileActionBar, {
          showBack: false,
          onBack: () => {},
          showNext: true,
          onNext: () => {},
          onSaveDraft: () => {},
          onSubmit: () => {},
          submitting: false,
        }),
      );
    });
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('pb-safe');
  });
});
