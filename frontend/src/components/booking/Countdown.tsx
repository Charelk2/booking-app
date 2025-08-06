import React, { useEffect, useState } from 'react';

interface CountdownProps {
  /** Date when the countdown should reach zero */
  expiresAt: string | Date;
}

/**
 * Displays a simple live-updating countdown used for expiring system messages.
 * The timer updates every second and renders days, hours and minutes remaining.
 */
const Countdown: React.FC<CountdownProps> = ({ expiresAt }) => {
  const calculate = () => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts: string[] = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
  };

  const [remaining, setRemaining] = useState(calculate());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(calculate());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span data-testid="countdown">{remaining}</span>;
};

export default Countdown;
