import { useMemo, useEffect, useState } from 'react';
import { subscribe as cacheSubscribe, getSummaries as cacheGetSummaries } from '@/lib/chat/threadCache';

export default function useUnreadThreadsCount() {
  const summaries = useMemo(() => cacheGetSummaries(), []);
  const [count, setCount] = useState<number>(() => (Array.isArray(summaries) ? summaries.reduce((a, s: any) => a + (Number(s?.unread_count || 0) || 0), 0) : 0));

  useEffect(() => {
    const selector = () => {
      const list = cacheGetSummaries() as any[];
      return Array.isArray(list) ? list.reduce((a, s: any) => a + (Number(s?.unread_count || 0) || 0), 0) : 0;
    };
    const onChange = () => setCount(selector());
    const unsub = cacheSubscribe(onChange);
    onChange();
    return unsub;
  }, []);

  return useMemo(() => ({ count }), [count]);
}
