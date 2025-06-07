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
      if (Math.abs(y - lastY) < 5) return;
      setDirection(y > lastY ? 'down' : 'up');
      lastY = y;
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return direction;
}

