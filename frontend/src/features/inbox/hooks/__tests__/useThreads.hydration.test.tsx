import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { useThreads } from '@/features/inbox/hooks/useThreads';
import { getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';

const TestComp = ({ user }: any) => {
  useThreads(user);
  return <div data-count={cacheGetSummaries().length} />;
};

describe('useThreads hydration', () => {
  it('hydrates thread cache from session cache', async () => {
    const user = { id: 1, user_type: 'client' } as any;
    const key = `inbox:threadsCache:v2:client:1`;
    const sample = [
      {
        id: 123,
        client_id: 1,
        service_provider_id: 2,
        status: 'pending_quote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_content: 'Hi',
        last_message_timestamp: new Date().toISOString(),
        is_unread_by_current_user: false,
      },
    ];
    sessionStorage.setItem(key, JSON.stringify(sample));
    const { container } = render(<TestComp user={user} />);
    await waitFor(() => {
      const div = container.querySelector('div[data-count]');
      expect(div?.getAttribute('data-count')).toBe('1');
    });
  });
});
