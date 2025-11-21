"use client";

import React from 'react';
import { ServiceProviderProfile } from '@/types';
import SafeImage from '@/components/ui/SafeImage';
import { UserIcon } from '@heroicons/react/24/outline';
import Chip from '@/components/ui/Chip';
import { getTownProvinceFromAddress } from '@/lib/utils';

type Props = {
  variant?: 'mobile' | 'desktop';
  displayName: string;
  profilePictureUrl: string | null;
  serviceProvider: ServiceProviderProfile;
  highlights: string[];
  onMessageClick?: () => void;
  bare?: boolean;
};

export default function AboutSection({ variant = 'mobile', displayName, profilePictureUrl, serviceProvider, highlights, onMessageClick, bare = false }: Props) {
  const isMobile = variant === 'mobile';
  const withCard = (children: React.ReactNode) =>
    bare ? (
      <div className="mt-4">{children}</div>
    ) : (
      <div className="mt-4 relative isolate overflow-hidden  bg-white p-4 md:p-4">
        {children}
      </div>
    );

  const formattedLocation = serviceProvider?.location ? getTownProvinceFromAddress(serviceProvider.location) : '';

  const content = (
    <div className="flex items-start gap-5">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 dark:ring-gray-700">
        {profilePictureUrl ? (
          <SafeImage src={profilePictureUrl} alt={displayName || 'Profile photo'} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="grid h-full w-full place-items-center text-gray-400">
            <UserIcon className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">{displayName}</p>
          {serviceProvider?.primary_role && (
            <span className="text-sm text-gray-600">· {serviceProvider.primary_role}</span>
          )}
        </div>
        {formattedLocation && (
          <div className="flex flex-wrap gap-2">
            <span className="pb-1 text-xs font-medium text-gray-700">
              Based in {formattedLocation}
            </span>
          </div>
        )}
        {/* Tags below the location removed per request */}
        {(() => {
          const desc = (serviceProvider?.description || '').trim();
          if (!desc) return null;

          const parts = desc.split(/\r?\n/);
          const firstLine = (parts[0] || '').trim();

          // Take only the first sentence from the first line.
          // If we can't find a clear sentence boundary, treat the whole
          // first line as the only sentence and don't duplicate it in
          // the "rest" block.
          const sentenceMatch = firstLine.match(/(.+?[.!?])(\s+|$)/);
          let firstSentence: string;
          let restOfFirstLine = '';
          if (sentenceMatch) {
            firstSentence = sentenceMatch[1].trim();
            restOfFirstLine = firstLine.slice(sentenceMatch[0].length).trimStart();
          } else {
            firstSentence = firstLine;
          }

          const restCombined = [restOfFirstLine, ...parts.slice(1)]
            .filter(Boolean)
            .join('\n')
            .trim();

          return (
            <>
              <p className="mt-3 text-sm text-gray-800 dark:text-gray-100">
                {firstSentence}
              </p>
              {restCombined && (
                <details className="mt-2 group/open">
                  <summary className="mb-2 cursor-pointer list-none text-sm font-medium text-gray-900 hover:opacity-80 dark:text-gray-100">
                    <span className="underline decoration-dotted underline-offset-4">
                      Read more
                    </span>
                  </summary>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p className="whitespace-pre-line">{restCombined}</p>
                  </div>
                  <div className="mt-2 hidden text-xs text-gray-500 group-open:block">
                    Click to collapse
                  </div>
                </details>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );

  return (
    <section aria-labelledby={`about-heading-${variant}`} className="group pb-10">
      <h2 id={`about-heading-${variant}`} className={isMobile ? 'text-2xl font-bold tracking-tight text-gray-900' : 'mt-12 text-2xl font-bold tracking-tight text-gray-900'}>
        About
      </h2>
      {withCard(
        <>
          {content}
          {onMessageClick && (
            <div className="mt-4">
              <button
                onClick={onMessageClick}
                className="w-full inline-flex items-center justify-center rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
              >
                Message {displayName}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">To help protect your payment, always use Booka to send money and communicate with artists.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
