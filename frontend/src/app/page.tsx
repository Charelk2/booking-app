export const revalidate = 60;

import MainLayout from '@/components/layout/MainLayout';

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <MainLayout>
      <div className="relative isolate">
        {/* Soft background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-sky-50 to-white"
        />

        <section className="mx-auto max-w-3xl px-4 py-20 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
            <span>Booka</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            We’re almost ready.
          </h1>
          <p className="mt-4 text-slate-600">
            Booka is launching soon. We’re polishing things behind the scenes—check back shortly.
          </p>

          {/* Optional: simple link (no forms, no waitlist) */}
          <div className="mt-10 flex items-center justify-center">
            <a
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Return home
            </a>
          </div>
        </section>

        <footer className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-slate-500">
          © {year} Booka. All rights reserved.
        </footer>
      </div>
    </MainLayout>
  );
}
