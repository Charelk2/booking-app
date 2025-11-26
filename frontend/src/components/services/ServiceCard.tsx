"use client";

import React from 'react';
import { Service } from '@/types';
import { getServiceDisplay } from '@/lib/display';
import SafeImage from '@/components/ui/SafeImage';

type Props = {
  service: Service;
  variant?: 'mobile' | 'desktop';
  onClick?: () => void;
};

export default function ServiceCard({ service, variant = 'mobile', onClick }: Props) {
  const d = getServiceDisplay(service);
  const any: any = service as any;
  const description: string | null = any.description || (any.details && any.details.description) || null;

  if (variant === 'desktop') {
    return (
      <div className="group cursor-pointer rounded-xl bg-white transition outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0" onClick={onClick}>
        <div className="flex items-center gap-4">
          <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-3xl bg-gray-100">
            {d.mediaUrl ? (
              <SafeImage src={d.mediaUrl} alt="" fill className="object-cover" sizes="(max-width: 1024px) 33vw, 25vw" />
            ) : (
              <div className="h-full w-full grid place-items-center text-gray-400">No image</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 group-hover:text-gray-700 transition-colors truncate">{d.title}</h3>
              <p className="text-sm text-gray-900">{[d.type, d.durationLabel, d.priceText].filter(Boolean).join(' · ')}</p>
              {description && (
                <p className="mt-6 text-sm text-gray-800 line-clamp-3">{description}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // mobile variant
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-gray-100 p-3 shadow-sm hover:border-gray-200 active:scale-[0.99] transition text-left"
      aria-label={`View ${d.title}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative aspect-square w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
          {d.mediaUrl ? (
            <SafeImage src={d.mediaUrl} alt="" fill className="object-cover" sizes="(max-width: 640px) 64px, (max-width: 1024px) 96px, 128px" />
          ) : (
            <div className="h-full w-full bg-gray-100" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-left text-gray-900 truncate">{d.title}</p>
          <p className="mt-1 text-xs text-left text-gray-600">{[d.type, d.durationLabel, d.priceText].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    </button>
  );
}
