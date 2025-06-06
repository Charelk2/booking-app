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
});
