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
  const Mock = ({ title, query }: { title: string; query: unknown }) => (
    <div data-title={title} data-query={JSON.stringify(query)}>
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
      root.render(<HomePage />);
    });
    const popular = div.querySelector('[data-title="Popular Musicians"]');
    expect(popular).not.toBeNull();
    expect(popular?.getAttribute('data-query')).toContain('"category":"musician"');
    expect(div.textContent).toContain('Top Rated');
    expect(div.textContent).toContain('New on Booka');
    act(() => {
      root.unmount();
    });
    div.remove();
  });
});
