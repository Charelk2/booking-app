"use client";

import React, { useState } from 'react';
import { ServiceProviderProfile } from '@/types';
import SafeImage from '@/components/ui/SafeImage';
import { 
  UserIcon, 
  MapPinIcon, 
  ChatBubbleOvalLeftIcon, 
  CheckBadgeIcon,
  BriefcaseIcon
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
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

export default function AboutSection({ 
  variant = 'mobile', 
  displayName, 
  profilePictureUrl, 
  serviceProvider, 
  highlights, 
  onMessageClick, 
  bare = false 
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = variant === 'mobile';
  
  // Data formatting
  const formattedLocation = serviceProvider?.location ? getTownProvinceFromAddress(serviceProvider.location) : '';
  const description = (serviceProvider?.description || '').trim();
  
  // Smooth "Read More" Logic
  const MAX_LENGTH = 240; // Char limit before truncation
  const shouldTruncate = description.length > MAX_LENGTH;
  const displayDescription = isExpanded || !shouldTruncate 
    ? description 
    : `${description.slice(0, MAX_LENGTH).trim()}...`;

  return (
    <section 
      aria-labelledby={`about-heading-${variant}`} 
      className={`group ${!bare && !isMobile ? 'rounded-2xl border border-gray-100 bg-white p-6 shadow-sm' : 'py-4'}`}
    >
      <div className="flex flex-col gap-6">
        
        {/* Header: Avatar & Key Info */}
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="relative h-16 w-16 overflow-hidden rounded-full border border-gray-100 shadow-sm">
              {profilePictureUrl ? (
                <SafeImage 
                  src={profilePictureUrl} 
                  alt={displayName || 'Profile photo'} 
                  fill 
                  className="object-cover" 
                  sizes="64px" 
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gray-50 text-gray-400">
                  <UserIcon className="h-8 w-8" />
                </div>
              )}
            </div>
            {/* Optional: Verified Badge Mockup */}
            {serviceProvider.verified && (
              <div className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm">
                <CheckBadgeIcon className="h-5 w-5 text-rose-500" />
              </div>
            )}
          </div>

          {/* Name & Role */}
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={`about-heading-${variant}`} className="text-xl font-bold text-gray-900 truncate">
              About {displayName.split(' ')[0]}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              {serviceProvider?.primary_role && (
                <div className="flex items-center gap-1">
                  <BriefcaseIcon className="h-4 w-4 text-gray-400" />
                  <span>{serviceProvider.primary_role}</span>
                </div>
              )}
              {formattedLocation && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4 text-gray-400" />
                  <span>{formattedLocation}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="text-gray-600 leading-relaxed text-[15px]">
            <p className="whitespace-pre-line transition-all duration-300">
              {displayDescription}
            </p>
            
            {shouldTruncate && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 flex items-center gap-1 font-semibold text-gray-900 hover:underline decoration-gray-300 underline-offset-4 text-sm focus:outline-none"
              >
                {isExpanded ? 'Show less' : 'Read more'}
                <ChevronRightIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
          </div>
        )}

        {/* Message CTA */}
        {onMessageClick && (
          <div className="pt-2">
            <button
              onClick={onMessageClick}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gray-900 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-50 active:scale-[0.98]"
            >
              <ChatBubbleOvalLeftIcon className="h-5 w-5 text-gray-900" />
              Message {displayName}
            </button>
            <p className="mt-3 text-[11px] text-gray-400 max-w-md">
              To protect your payment, never transfer money or communicate outside of the Booka website or app.
            </p>
          </div>
        )}

      </div>
    </section>
  );
}