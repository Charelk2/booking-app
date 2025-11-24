'use client';

import React, { useMemo, useState } from 'react';
import { ServiceProviderProfile } from '@/types';
import SafeImage from '@/components/ui/SafeImage';
import {
  UserIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { getTownProvinceFromAddress } from '@/lib/utils';

type Props = {
  variant?: 'mobile' | 'desktop';
  displayName: string;
  profilePictureUrl: string | null;
  serviceProvider: ServiceProviderProfile;
  highlights?: string[];
  onMessageClick?: () => void;
  bare?: boolean;
};

function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const sentences: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    current += ch;
    const next = text[i + 1];

    if (ch === '\n') {
      if (current.trim()) sentences.push(current.trim());
      current = '';
      continue;
    }

    if (ch === '.' || ch === '!' || ch === '?') {
      if (!next || /\s/.test(next)) {
        if (current.trim()) sentences.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

export default function AboutSection({
  variant = 'mobile',
  displayName,
  profilePictureUrl,
  serviceProvider,
  highlights = [],
  onMessageClick,
  bare = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = variant === 'mobile';

  const formattedLocation = serviceProvider?.location
    ? getTownProvinceFromAddress(serviceProvider.location)
    : '';

  const description = (serviceProvider?.description || '').trim();

  const { collapsedText, expandedText, hasMore } = useMemo(() => {
    if (!description) {
      return { collapsedText: '', expandedText: '', hasMore: false };
    }
    const sentences = splitIntoSentences(description);
    if (sentences.length <= 1) {
      return { collapsedText: description, expandedText: description, hasMore: false };
    }
    return {
      collapsedText: sentences[0],
      expandedText: description,
      hasMore: true,
    };
  }, [description]);

  const wrapInCard = (children: React.ReactNode) =>
    bare ? (
      <div className="mt-4">{children}</div>
    ) : (
      <div className="mt-6 relative isolate overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.05)]">
        {children}
      </div>
    );

  const content = (
    <div className="flex flex-col gap-6">
      {/* Header: avatar + name + primary role + location */}
      <div className="flex flex-row items-center gap-5">
        <div className="relative shrink-0">
          <div className="relative h-24 w-24 md:h-28 md:w-28 overflow-hidden rounded-full border border-gray-100 bg-white shadow-md">
            {profilePictureUrl ? (
              <SafeImage
                src={profilePictureUrl}
                alt={displayName || 'Profile photo'}
                fill
                className="object-cover"
                sizes="96px"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-gray-300">
                <UserIcon className="h-10 w-10" />
              </div>
            )}
          </div>
          {serviceProvider.verified && (
            <div className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-gray-50">
              <CheckBadgeIcon className="h-5 w-5 text-rose-500" />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center min-w-0">
          <h3 className="text-2xl font-bold text-gray-900 md:text-3xl truncate">
            {displayName}
          </h3>
          {serviceProvider?.primary_role && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <BriefcaseIcon className="h-4 w-4 text-gray-400" />
              <span className="truncate">{serviceProvider.primary_role}</span>
            </p>
          )}
          {formattedLocation && (
            <p className="mt-0.5 text-sm text-gray-600 truncate">{formattedLocation}</p>
          )}
        </div>
      </div>

      {!!highlights.length && (
        <div className="flex flex-wrap gap-2">
          {highlights.slice(0, 6).map((h) => (
            <span
              key={h}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-800"
            >
              <CheckBadgeIcon className="h-3.5 w-3.5 text-gray-700" />
              {h}
            </span>
          ))}
        </div>
      )}

      {description && (
        <div className="relative">
          <p className="text-[15px] leading-relaxed text-gray-700 whitespace-pre-line">
            {isExpanded ? expandedText : collapsedText}
          </p>

          {hasMore && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-4 hover:text-gray-700 focus:outline-none"
            >
              {isExpanded ? 'Show less' : 'Read more'}
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform duration-200 ${
                  isExpanded ? '-rotate-90' : 'rotate-90'
                }`}
              />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-labelledby={`about-heading-${variant}`}
      className="group pb-10"
    >
      <h2
        id={`about-heading-${variant}`}
        className={
          isMobile
            ? 'text-lg font-bold tracking-tight text-gray-900'
            : 'mt-12 text-lg font-bold tracking-tight text-gray-900'
        }
      >
        About {displayName}
      </h2>

      {wrapInCard(
        <>
          {content}

          {onMessageClick && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onMessageClick}
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Message {displayName}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">
                To help protect your payment, always use Booka to send money and
                communicate with artists.
              </p>
            </div>
          )}
        </>,
      )}
    </section>
  );
}
