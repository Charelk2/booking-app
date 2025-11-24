'use client';

import SafeImage from '@/components/ui/SafeImage';

type Props = {
  displayName: string;
  verified?: boolean;
};

export default function VettedBanner({ displayName, verified = true }: Props) {
  if (!verified) return null;

  return (
    <section aria-label="Vetted by Booka" className="mt-16 pt-12">
      <div className="relative isolate overflow-hidden rounded-3xl bg-gray-100 p-6 shadow-sm md:p-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center md:flex-row md:text-left">
          <div className="flex justify-center md:justify-start md:mr-6">
            <div className="relative h-24 w-24 md:h-28 md:w-28 overflow-hidden rounded-2xl bg-white shadow">
              <SafeImage
                src="/booka-vetted.jpg"
                alt="Booka vetted"
                fill
                sizes="96px"
                loading="lazy"
                className="object-contain"
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              {displayName} is vetted by Booka
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Booka evaluates every service provider’s experience, portfolio and
              verified client feedback to ensure consistent quality.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <a
                href="/trust-and-safety"
                className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline"
              >
                Learn how we vet
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <span className="hidden text-sm text-gray-400 md:inline">•</span>
              <span className="hidden text-sm text-gray-500 md:inline">
                Backed by verified reviews
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
