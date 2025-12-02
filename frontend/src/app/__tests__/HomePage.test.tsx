import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import HomePage from '../page';

jest.mock('@/components/layout/MainLayout', () => {
  const Mock = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Mock.displayName = 'MockMainLayout';
  return Mock;
});

jest.mock('@/components/home/ArtistsSection', () => {
  const Mock = ({ title, query }: { title: string; query?: unknown }) => (
    <div data-title={title} data-query={JSON.stringify(query ?? {})}>
      {title}
    </div>
  );
  Mock.displayName = 'MockArtistsSection';
  return Mock;
});

describe('HomePage', () => {
  it('renders artist sections', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      // HomePage is an async App Router page; call it and render the resolved element.
      const element = (await (HomePage() as any)) as React.ReactElement;
      root.render(element);
    });
    const musicians = div.querySelector('[data-title="Musicians"]');
    expect(musicians).not.toBeNull();
    expect(musicians?.getAttribute('data-query')).toContain('"category":"musician"');
    expect(div.textContent).toContain('Photography');
    expect(div.textContent).toContain('Sound Services');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
