import { mergeNotifications } from '../notificationUtils';
import type { Notification } from '@/types';

describe('mergeNotifications', () => {
  const base: Notification = {
    id: 0,
    user_id: 1,
    type: 'booking_update',
    message: '',
    link: '/foo',
    is_read: false,
    timestamp: '2024-01-01T00:00:00Z',
  } as Notification;

  it('deduplicates by id and sorts newest first', () => {
    const first = { ...base, id: 1, message: 'one', timestamp: '2024-01-02T00:00:00Z' };
    const dup = { ...base, id: 1, message: 'updated', timestamp: '2024-01-02T00:00:00Z' };
    const newer = { ...base, id: 2, message: 'two', timestamp: '2024-01-03T00:00:00Z' };

    const result = mergeNotifications([first], [dup, newer]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
    expect(result[1].message).toBe('updated');
  });
});
