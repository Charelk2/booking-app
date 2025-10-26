"use client";

import React from 'react';

export default function VettedBanner({ displayName }: { displayName: string }) {
  return (
    <section aria-label="Vetted by Booka" className="mt-16 pt-16">
      <div className="relative isolate overflow-hidden rounded-3xl bg-gray-100 p-6 shadow-sm md:p-10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-6">
          <div className="flex justify-center mb-4">
            <img src="/booka-vetted.jpg" alt="Booka vetted" className="h-24 w-24 md:h-32 md:w-32 rounded-2xl object-contain" loading="lazy" decoding="async" />
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900">{displayName} is vetted by Booka</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">Booka evaluates every service provider’s professional experience, portfolio, and verified client feedback to ensure consistent quality.</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <a href="/trust-and-safety" className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline">Learn how we vet
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </a>
              <span className="hidden text-sm text-gray-400 md:inline">•</span>
              <span className="hidden text-sm text-gray-500 md:inline">Backed by verified reviews</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

