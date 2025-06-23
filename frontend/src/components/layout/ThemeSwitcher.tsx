'use client';

import { useEffect, useState } from 'react';

export default function ThemeSwitcher() {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'high-contrast') {
      setHighContrast(true);
      document.documentElement.setAttribute('data-theme', 'high-contrast');
    }
  }, []);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.setAttribute('data-theme', 'high-contrast');
      localStorage.setItem('theme', 'high-contrast');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'default');
    }
  }, [highContrast]);

  return (
    <button
      type="button"
      aria-pressed={highContrast}
      onClick={() => setHighContrast(!highContrast)}
      className="px-3 py-1.5 rounded-md border text-sm bg-background text-foreground border-foreground"
    >
      {highContrast ? 'Standard colors' : 'High contrast'}
    </button>
  );
}
