import { useState, useEffect } from 'react';
import isMobileScreen from '@/lib/isMobile';

export default function useIsMobile(): boolean {
  // Initialize to false so server and client render the same markup.
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const check = () => setIsMobile(isMobileScreen());
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}
