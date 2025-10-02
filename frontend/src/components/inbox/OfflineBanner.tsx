import React from 'react';

interface OfflineBannerProps {
  message?: string;
}

const OfflineBanner: React.FC<OfflineBannerProps> = ({ message }) => (
  <div
    className="w-full bg-amber-100 border-b border-amber-200 px-4 py-2 text-amber-900 text-xs flex items-center gap-2 justify-center"
    role="status"
    aria-live="polite"
  >
    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
    <span>{message ?? "You're offline. We'll sync your inbox as soon as the connection returns."}</span>
  </div>
);

export default OfflineBanner;
