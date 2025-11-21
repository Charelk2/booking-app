"use client";

import React from "react";
import { ServiceProviderProfile } from "@/types";
import SafeImage from "@/components/ui/SafeImage";
import { UserIcon } from "@heroicons/react/24/outline";
import { getTownProvinceFromAddress } from "@/lib/utils";

type Props = {
  variant?: "mobile" | "desktop";
  displayName: string;
  profilePictureUrl: string | null;
  serviceProvider: ServiceProviderProfile;
  highlights: string[];
  onMessageClick?: () => void;
  bare?: boolean;
};

export default function AboutSection({
  variant = "mobile",
  displayName,
  profilePictureUrl,
  serviceProvider,
  highlights,
  onMessageClick,
  bare = false,
}: Props) {
  const isMobile = variant === "mobile";

  const withCard = (children: React.ReactNode) =>
    bare ? (
      <div className="mt-4">{children}</div>
    ) : (
      <div className="mt-4 relative isolate overflow-hidden rounded-xl border bg-white p-4 md:p-5">
        {children}
      </div>
    );

  const formattedLocation = serviceProvider?.location
    ? getTownProvinceFromAddress(serviceProvider.location)
    : "";

  // --- Description handling: first sentence + expandable rest -----------------
  const rawDescription = (serviceProvider?.description || "").trim();

  let firstSentence: string | null = null;
  let restCombined: string | null = null;

  if (rawDescription) {
    const parts = rawDescription.split(/\r?\n/);
    const firstLine = (parts[0] || "").trim();

    const sentenceMatch = firstLine.match(/(.+?[.!?])(\s+|$)/);
    let restOfFirstLine = "";

    if (sentenceMatch) {
      firstSentence = sentenceMatch[1].trim();
      restOfFirstLine = firstLine.slice(sentenceMatch[0].length).trimStart();
    } else {
      firstSentence = firstLine;
    }

    const rest = [restOfFirstLine, ...parts.slice(1)]
      .filter(Boolean)
      .join("\n")
      .trim();

    restCombined = rest || null;
  }

  const hasHighlights = Array.isArray(highlights) && highlights.length > 0;

  const content = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Avatar */}
      <div className="flex justify-center sm:block">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-white shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
          {profilePictureUrl ? (
            <SafeImage
              src={profilePictureUrl}
              alt={displayName || "Profile photo"}
              fill
              className="object-cover"
              sizes="112px"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-gray-400">
              <UserIcon className="h-8 w-8" />
            </div>
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        {/* Name + role */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">
            {displayName}
          </p>
          {serviceProvider?.primary_role && (
            <span className="text-sm text-gray-600">
              · {serviceProvider.primary_role}
            </span>
          )}
        </div>

        {/* Location */}
        {formattedLocation && (
          <p className="mt-1 text-xs font-medium text-gray-700">
            Based in {formattedLocation}
          </p>
        )}

        {/* Description */}
        {firstSentence && (
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
        )}
      </div>
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
            ? "text-2xl font-bold tracking-tight text-gray-900"
            : "mt-12 text-2xl font-bold tracking-tight text-gray-900"
        }
      >
        About {displayName}
      </h2>

      {withCard(
        <>
          {content}

          {/* Message button block left exactly as before */}
          {onMessageClick && (
            <div className="mt-4">
              <button
                onClick={onMessageClick}
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                Message {displayName}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">
                To help protect your payment, always use Booka to send money and
                communicate with artists.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
