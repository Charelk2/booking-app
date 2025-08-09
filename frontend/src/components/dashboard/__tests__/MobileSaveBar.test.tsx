import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import { MobileSaveBar } from '..';

describe('MobileSaveBar', () => {
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

  it('triggers onSave when clicked', () => {
    const onSave = jest.fn();
    act(() => {
      root.render(React.createElement(MobileSaveBar, { onSave, isSaving: false }));
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSave).toHaveBeenCalled();
  });

  it('disables button when isSaving', () => {
    act(() => {
      root.render(React.createElement(MobileSaveBar, { onSave: () => {}, isSaving: true }));
    });
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
