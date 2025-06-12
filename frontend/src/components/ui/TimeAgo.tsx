'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface TimeAgoProps {
  timestamp: string | number | Date;
  addSuffix?: boolean;
  intervalMs?: number;
  className?: string;
}

export default function TimeAgo({
  timestamp,
  addSuffix = true,
  intervalMs = 60000,
  className,
}: TimeAgoProps) {
  const [relative, setRelative] = useState(() =>
    formatDistanceToNow(new Date(timestamp), { addSuffix }),
  );

  useEffect(() => {
    function update() {
      setRelative(formatDistanceToNow(new Date(timestamp), { addSuffix }));
    }
    const id = setInterval(update, intervalMs);
    update();
    return () => clearInterval(id);
  }, [timestamp, addSuffix, intervalMs]);

  const iso = new Date(timestamp).toISOString();
  const full = new Date(timestamp).toLocaleString();

  return (
    <time dateTime={iso} title={full} className={className}>
      <span className="sr-only">{full}</span>
      {relative}
    </time>
  );
}
