"use client";

import React, { useState } from 'react';
import { ServiceProviderProfile } from '@/types';
import SafeImage from '@/components/ui/SafeImage';
import { 
  UserIcon, 
  MapPinIcon, 
  ChatBubbleOvalLeftIcon, 
  CheckBadgeIcon,
  BriefcaseIcon,
  SparklesIcon,
  ShieldCheckIcon
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
  highlights = [], 
  onMessageClick, 
  bare = false 
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = variant === 'mobile';
  
  const formattedLocation = serviceProvider?.location ? getTownProvinceFromAddress(serviceProvider.location) : '';
  const description = (serviceProvider?.description || '').trim();
  
  // Determine if text is long enough to need truncation (approx 240 chars)
  const isLongText = description.length > 240;

  return (
    <section aria-labelledby={`about-heading-${variant}`} className={bare ? '' : 'py-6'}>
      <div className="flex flex-col gap-8">
        
        {/* 1. Identity Card (The "Airbnb Passport" Look) */}
        <div className="flex flex-row items-center gap-6">
            {/* Avatar Card */}
            <div className="relative shrink-0">
                <div className="h-24 w-24 md:h-28 md:w-28 overflow-hidden rounded-full border border-gray-100 shadow-xl relative bg-white">
                  {profilePictureUrl ? (
                    <SafeImage 
                      src={profilePictureUrl} 
                      alt={displayName} 
                      fill 
                      className="object-cover" 
                      sizes="(max-width: 768px) 96px, 112px" 
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-gray-50 text-gray-300">
                      <UserIcon className="h-10 w-10" />
                    </div>
                  )}
                </div>
                
                {/* Verified Badge - Floating over avatar */}
                {serviceProvider.verified && (
                  <div className="absolute bottom-1 right-0 rounded-full bg-white p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-gray-50">
                    <ShieldCheckIcon className="h-5 w-5 text-rose-500" />
                  </div>
                )}
            </div>

            {/* Name & Key Details */}
            <div className="flex flex-col">
                <h2 id={`about-heading-${variant}`} className="text-2xl md:text-3xl font-bold text-gray-900">
                  {displayName.split(' ')[0]}
                </h2>
                <div className="flex flex-col gap-1 mt-1">
                     {serviceProvider.primary_role && (
                        <span className="text-sm font-medium text-gray-900">
                           {serviceProvider.primary_role}
                        </span>
                     )}
                     {formattedLocation && (
                         <span className="text-sm text-gray-500 flex items-center gap-1">
                            <MapPinIcon className="h-3.5 w-3.5"/> {formattedLocation}
                         </span>
                     )}
                </div>
            </div>
        </div>

        {/* 2. Highlights / "Fun Facts" Row */}
        {highlights.length > 0 && (
            <div className="flex flex-wrap gap-3">
                {highlights.slice(0, 4).map((highlight, i) => (
                    <div key={i} className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 bg-transparent text-sm text-gray-700">
                        <SparklesIcon className="h-4 w-4 text-gray-400" />
                        <span>{highlight}</span>
                    </div>
                ))}
            </div>
        )}

        {/* 3. Bio Text */}
        {description && (
          <div className="relative">
            <div className={`text-gray-700 leading-relaxed text-[15px] md:text-base whitespace-pre-line transition-all duration-200 ${!isExpanded && isLongText ? 'line-clamp-4' : ''}`}>
              {description}
            </div>
            
            {isLongText && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 flex items-center gap-1 font-semibold text-gray-900 underline decoration-gray-300 underline-offset-4 hover:text-gray-700 text-sm focus:outline-none transition-colors"
              >
                {isExpanded ? 'Show less' : 'Read more'}
                <ChevronRightIcon className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
          </div>
        )}

        {/* 4. Message CTA */}
        {onMessageClick && (
          <div className="pt-2">
            <button
              onClick={onMessageClick}
              className="group inline-flex items-center justify-center gap-2 rounded-xl border border-gray-900 bg-white px-6 py-3.5 text-sm font-bold text-gray-900 transition-all hover:bg-gray-50 active:scale-[0.98] w-full sm:w-auto shadow-sm"
            >
              <ChatBubbleOvalLeftIcon className="h-5 w-5 text-gray-900" />
              Message {displayName}
            </button>
            <p className="mt-3 text-xs text-gray-400 max-w-md flex gap-2 items-start">
                <ShieldCheckIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <span>To protect your payment, never transfer money or communicate outside of the Booka website or app.</span>
            </p>
          </div>
        )}

      </div>
    </section>
  );
}