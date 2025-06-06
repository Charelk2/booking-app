import { useState, useEffect } from 'react';
import isMobileScreen from '@/lib/isMobile';

export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(isMobileScreen());

  useEffect(() => {
    const check = () => setIsMobile(isMobileScreen());
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}
