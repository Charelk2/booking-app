"use client";

import React, { useMemo, useState } from "react";
import SafeImage from "@/components/ui/SafeImage";
import {
  UserIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import type { ServiceProviderProfile } from "@/types";
import { formatProfileLocation } from "@/lib/shared/mappers/location";

type Props = {
  variant?: "mobile" | "desktop";
  displayName: string;
  profilePictureUrl: string | null;
  serviceProvider: ServiceProviderProfile;
  highlights?: string[];
  onMessageClick?: () => void;
  bare?: boolean;
};

export default function AboutSection({
  variant = "mobile",
  displayName,
  profilePictureUrl,
  serviceProvider,
  highlights = [],
  onMessageClick,
  bare = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = variant === "mobile";

  const formattedLocation = formatProfileLocation(serviceProvider);

  const description = (serviceProvider?.description || "").trim();

  const sentences: string[] = useMemo(() => {
    if (!description) return [];
    const out: string[] = [];
    let current = "";

    for (let i = 0; i < description.length; i += 1) {
      const ch = description[i];
      current += ch;
      const next = description[i + 1];

      if (ch === "\n") {
        if (current.trim()) out.push(current.trim());
        current = "";
        continue;
      }

      if (ch === "." || ch === "!" || ch === "?") {
        if (!next || /\s/.test(next)) {
          if (current.trim()) out.push(current.trim());
          current = "";
        }
      }
    }

    if (current.trim()) out.push(current.trim());
    return out;
  }, [description]);

  const hasMoreThanOneSentence = sentences.length > 1;
  const collapsedText =
    hasMoreThanOneSentence && sentences[0] ? sentences[0] : description;
  const expandedText = description;

  const cardWrapper = (children: React.ReactNode) =>
    bare ? (
      <div className="mt-4">{children}</div>
    ) : (
      <div className="mt-6 relative isolate overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.06)]">
        {children}
      </div>
    );

  const mainContent = (
    <div className="flex flex-col gap-6">
      {/* Header: avatar + basic info */}
      <div className="flex flex-row items-center gap-5">
        <div className="relative shrink-0">
          <div className="relative h-24 w-24 md:h-28 md:w-28 overflow-hidden rounded-full border border-gray-100 bg-white shadow-lg">
            {profilePictureUrl ? (
              <SafeImage
                src={profilePictureUrl}
                alt={displayName || "Profile photo"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 96px, 112px"
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

        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold text-gray-900 md:text-3xl">
            {displayName}
          </h3>
          <div className="mt-1 flex flex-col gap-0.5">
            {serviceProvider?.primary_role && (
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <BriefcaseIcon className="h-4 w-4 text-gray-400" />
                <span>{serviceProvider.primary_role}</span>
              </div>
            )}
            {formattedLocation && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <span>{formattedLocation}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bio */}
      {description && (
        <div className="relative">
          <div className="text-[15px] leading-relaxed text-gray-600 whitespace-pre-line transition-all duration-200">
            {isExpanded ? expandedText : collapsedText}
          </div>

          {hasMoreThanOneSentence && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-4 hover:text-gray-700 focus:outline-none"
            >
              {isExpanded ? "Show less" : "Read more"}
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform duration-200 ${
                  isExpanded ? "-rotate-90" : "rotate-90"
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
            ? "text-lg font-bold tracking-tight text-gray-900"
            : "mt-12 text-lg font-bold tracking-tight text-gray-900"
        }
      >
        About {displayName}
      </h2>

      {cardWrapper(
        <>
          {mainContent}

          {onMessageClick && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onMessageClick}
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                Message {displayName}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">
                For your safety, only send payments and messages to artists through Booka.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
