"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

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
  const date = new Date(timestamp);
  const isValid = !Number.isNaN(date.getTime());

  const [relative, setRelative] = useState(() =>
    isValid ? formatDistanceToNow(date, { addSuffix }) : "",
  );

  useEffect(() => {
    if (!isValid) return undefined;

    function update() {
      setRelative(formatDistanceToNow(date, { addSuffix }));
    }
    const id = setInterval(update, intervalMs);
    update();
    return () => clearInterval(id);
  }, [timestamp, addSuffix, intervalMs, isValid]);

  if (!isValid) {
    return (
      <time className={className} dateTime="">
        <span className="sr-only">Invalid date</span>
        Invalid date
      </time>
    );
  }

  const iso = date.toISOString();
  const full = date.toLocaleString();

  return (
    <time dateTime={iso} title={full} className={className}>
      <span className="sr-only">{full}</span>
      {relative}
    </time>
  );
}
