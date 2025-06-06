import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ChatThreadView from '../ChatThreadView';

describe('ChatThreadView', () => {
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

  it('renders contact name and layout sections', () => {
    act(() => {
      root.render(
        <ChatThreadView contactName="Alice" inputBar={<div>input</div>}>
          <div>messages</div>
        </ChatThreadView>,
      );
    });

    const header = container.querySelector('[data-testid="contact-name"]');
    const messageContainer = container.querySelector('[data-testid="message-container"]');
    const inputBar = container.querySelector('[data-testid="input-bar"]');

    expect(header?.textContent).toBe('Alice');
    expect(messageContainer).not.toBeNull();
    expect(inputBar).not.toBeNull();
    expect(container.firstChild).toHaveClass('h-screen');
  });
});
