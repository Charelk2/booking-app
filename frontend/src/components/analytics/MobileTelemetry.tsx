'use client';

import { useEffect } from 'react';
import { onINP, onLCP, Metric } from 'web-vitals/attribution';
import { trackEvent } from '@/lib/analytics';

const MOBILE_LCP_SLO = 2500;
const MOBILE_INP_SLO = 200;

const isMobile = () => window.matchMedia('(pointer: coarse)').matches;

export default function MobileTelemetry(): null {
  useEffect(() => {
    if (!isMobile()) return;

    const basePayload = () => ({
      viewport: window.innerWidth,
      dpr: window.devicePixelRatio,
    });

    const handleMetric = (metric: Metric) => {
      const payload = { name: metric.name, value: metric.value, ...basePayload() };
      trackEvent('web_vital', payload);
      const slo = metric.name === 'LCP' ? MOBILE_LCP_SLO : metric.name === 'INP' ? MOBILE_INP_SLO : null;
      if (slo && metric.value > slo) {
        trackEvent('web_vital_slo_violation', { ...payload, slo });
      }
    };

    onLCP(handleMetric);
    onINP(handleMetric);

    let taps: { x: number; y: number; t: number }[] = [];
    const handleClick = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      const t = Date.now();
      taps = taps.filter((tap) => t - tap.t < 1000);
      taps.push({ x, y, t });
      const sameSpot = taps.filter((tap) => Math.abs(tap.x - x) < 30 && Math.abs(tap.y - y) < 30);
      if (sameSpot.length >= 3) {
        trackEvent('rage_tap', { x, y, ...basePayload() });
      }
      const target = e.target as HTMLElement | null;
      if (target && target.matches('button:disabled, button[aria-disabled="true"], a[aria-disabled="true"]')) {
        trackEvent('tap_error', { x, y, ...basePayload() });
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  return null;
}

