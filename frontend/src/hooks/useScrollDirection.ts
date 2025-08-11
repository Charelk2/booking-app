import { useEffect, useState } from 'react';

/**
 * Detects the scroll direction of the window.
 * Returns 'up' or 'down' depending on the last scroll movement.
 */
export default function useScrollDirection(): 'up' | 'down' {
  const [direction, setDirection] = useState<'up' | 'down'>('up');

  useEffect(() => {
    let lastY = window.scrollY;

    const handleScroll = () => {
      const y = window.scrollY;
      if (y <= 0) {
        // Stay visible at the top of the page even if scroll "bounces"
        setDirection('up');
        lastY = 0;
        return;
      }
      if (Math.abs(y - lastY) < 5) return;
      setDirection(y > lastY ? 'down' : 'up');
      lastY = y;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return direction;
}

