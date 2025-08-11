"use client";

import { useEffect, useState } from "react";

function formatTimeAgo(date: Date, addSuffix: boolean): string {
  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Infinity, unit: 'year' },
  ];
  let duration = diffSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      const rtf = new Intl.RelativeTimeFormat('en', {
        numeric: addSuffix ? 'always' : 'auto',
      });
      return rtf.format(
        Math.round(duration),
        division.unit as Intl.RelativeTimeFormatUnit,
      );
    }
    duration /= division.amount;
  }
  return '';
}

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
    isValid ? formatTimeAgo(date, addSuffix) : '',
  );

  useEffect(() => {
    if (!isValid) return undefined;

    function update() {
      setRelative(formatTimeAgo(date, addSuffix));
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
  // Display full timestamp in South Africa's GMT+2 timezone.
  const full = date.toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
  });

  return (
    <time dateTime={iso} title={full} className={className}>
      <span className="sr-only">{full}</span>
      {relative}
    </time>
  );
}
