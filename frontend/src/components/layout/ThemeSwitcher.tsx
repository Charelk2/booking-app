'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

export default function ThemeSwitcher() {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'high-contrast') {
      setHighContrast(true);
      document.documentElement.setAttribute('data-theme', 'high-contrast');
      document.body.classList.add('high-contrast');
    }
  }, []);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.setAttribute('data-theme', 'high-contrast');
      document.body.classList.add('high-contrast');
      localStorage.setItem('theme', 'high-contrast');
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.body.classList.remove('high-contrast');
      localStorage.setItem('theme', 'default');
    }
  }, [highContrast]);

  return (
    <button
      type="button"
      aria-pressed={highContrast}
      onClick={() => setHighContrast(!highContrast)}
      className={clsx(
        'px-3 py-1.5 rounded-md border text-sm',
        highContrast
          ? 'bg-black text-white border-white'
          : 'bg-white text-black border-black',
      )}
    >
      {highContrast ? 'Standard colors' : 'High contrast'}
    </button>
  );
}
