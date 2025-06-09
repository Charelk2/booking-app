import { useState, useEffect } from 'react';

/**
 * Returns the height of the on-screen keyboard in pixels if visible.
 * Useful for shifting fixed elements so they remain above the keyboard.
 */
export default function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const keyboard = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(keyboard > 0 ? keyboard : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return offset;
}

