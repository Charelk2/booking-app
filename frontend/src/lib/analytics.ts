export type AnalyticsPayload = Record<string, unknown>;

export const trackEvent = (event: string, payload: AnalyticsPayload = {}): void => {
  if (typeof window !== 'undefined') {
    const anyWindow = window as any;
    if (anyWindow.analytics && typeof anyWindow.analytics.track === 'function') {
      anyWindow.analytics.track(event, payload);
      return;
    }
  }
  // Fallback to console so events are still visible during development
  // eslint-disable-next-line no-console
  console.info('analytics event', event, payload);
};
