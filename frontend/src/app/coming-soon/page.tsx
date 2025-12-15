import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Booka — Coming Soon',
  description:
    "Your Event, Simplified. South Africa's premier platform for booking event service providers.",
  robots: { index: false, follow: false },
};

type ComingSoonPageProps = {
  searchParams?: {
    subscribed?: string;
    error?: string;
  };
};

function BackgroundDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-slate-50" />

      {/* Soft gradient blobs */}
      <div className="absolute -top-52 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-rose-200 via-fuchsia-100 to-sky-100 blur-3xl opacity-80" />
      <div className="absolute -bottom-56 left-[-200px] h-[620px] w-[620px] rounded-full bg-gradient-to-tr from-emerald-100 via-cyan-100 to-rose-100 blur-3xl opacity-70" />
      <div className="absolute -bottom-64 right-[-260px] h-[720px] w-[720px] rounded-full bg-gradient-to-tr from-violet-100 via-sky-100 to-rose-100 blur-3xl opacity-70" />

      {/* Subtle grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 1200 800">
        <defs>
          <pattern id="cs_grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(15,23,42,0.18)" strokeWidth="1" />
          </pattern>
          <linearGradient id="cs_gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="55%" stopColor="white" stopOpacity="0.65" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#cs_grid)" />
        <rect width="1200" height="800" fill="url(#cs_gridFade)" />
      </svg>
    </div>
  );
}

function HeroVector() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-elevation"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-50" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_25%_30%,rgba(255,122,133,0.30),transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_72%_62%,rgba(56,189,248,0.20),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_55%_90%,rgba(168,85,247,0.16),transparent_60%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 750">
        <defs>
          <linearGradient id="cs_strokeA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,122,133,0.90)" />
            <stop offset="45%" stopColor="rgba(168,85,247,0.55)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.55)" />
          </linearGradient>
          <linearGradient id="cs_strokeB" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,197,94,0.45)" />
            <stop offset="55%" stopColor="rgba(56,189,248,0.35)" />
            <stop offset="100%" stopColor="rgba(255,122,133,0.35)" />
          </linearGradient>
          <filter id="cs_softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sound-wave ribbons */}
        <path
          d="M -40 260 C 80 210, 140 310, 240 260 C 330 215, 390 300, 520 250 C 610 215, 670 250, 720 220"
          fill="none"
          stroke="url(#cs_strokeA)"
          strokeWidth="10"
          strokeLinecap="round"
          filter="url(#cs_softGlow)"
          opacity="0.9"
        />
        <path
          d="M -30 340 C 90 295, 160 395, 260 345 C 350 305, 420 380, 540 340 C 640 305, 690 355, 720 330"
          fill="none"
          stroke="url(#cs_strokeB)"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M -20 420 C 110 365, 180 470, 290 420 C 380 380, 450 455, 560 420 C 660 385, 700 435, 720 410"
          fill="none"
          stroke="rgba(15,23,42,0.14)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Confetti */}
        <g opacity="0.65">
          <circle cx="120" cy="120" r="6" fill="rgba(255,122,133,0.85)" />
          <circle cx="470" cy="140" r="5" fill="rgba(56,189,248,0.80)" />
          <circle cx="520" cy="520" r="6" fill="rgba(168,85,247,0.70)" />
          <circle cx="160" cy="560" r="5" fill="rgba(34,197,94,0.70)" />
          <path d="M 72 220 l 10 -16 l 12 14 l -16 10 z" fill="rgba(56,189,248,0.65)" />
          <path d="M 520 240 l 12 -18 l 12 16 l -18 10 z" fill="rgba(255,122,133,0.60)" />
          <path d="M 420 600 l 12 -16 l 14 12 l -16 10 z" fill="rgba(34,197,94,0.55)" />
        </g>

        {/* Minimal “stage” */}
        <g opacity="0.55">
          <rect x="120" y="610" width="360" height="46" rx="18" fill="rgba(15,23,42,0.06)" />
          <rect x="170" y="624" width="260" height="16" rx="8" fill="rgba(15,23,42,0.07)" />
        </g>
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/90 to-transparent" />
    </div>
  );
}

export default function ComingSoonPage({ searchParams }: ComingSoonPageProps) {
  const subscribed = searchParams?.subscribed === '1';
  const hasError = searchParams?.error === '1';

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-900">
      <BackgroundDecor />

      <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/booka_logo.jpg"
              alt="Booka"
              width={120}
              height={48}
              priority
              className="h-auto w-[120px] rounded-md"
            />
            <div className="hidden sm:block">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                <Sparkles className="h-4 w-4 text-accent" />
                Launching soon
              </div>
            </div>
          </div>

          <a
            href="#waitlist"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Get early access
            <ArrowRight className="h-4 w-4" />
          </a>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm sm:hidden">
              <Sparkles className="h-4 w-4 text-accent" />
              Launching soon
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              Your Event,
              <span className="block bg-gradient-to-r from-slate-900 via-slate-900 to-slate-500 bg-clip-text text-transparent">
                Simplified
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
              South Africa&apos;s premier platform for booking event service providers. From DJs to
              caterers, photographers to decorators—find and book trusted professionals for
              your perfect event.
            </p>

            <div
              id="waitlist"
              className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-elevation"
            >
              <div className="px-6 py-6 sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Be the First to Know</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Sign up to get early access, exclusive launch offers, and a launch-day
                      notification.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    Join 500+ others waiting for launch
                  </div>
                </div>

                {subscribed ? (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Thanks — you&apos;re on the list.
                  </div>
                ) : null}
                {hasError ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    Something went wrong. Please try again.
                  </div>
                ) : null}

                <form className="mt-5 flex flex-col gap-3 sm:flex-row" action="/api/waitlist" method="post">
                  <label className="flex-1">
                    <span className="sr-only">Email Address</span>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  <input
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[10000px] h-px w-px opacity-0"
                  />
                  <button
                    type="submit"
                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(225,29,72,0.20)] hover:from-rose-600 hover:to-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  >
                    Notify Me at Launch
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </form>
                <p className="mt-3 text-xs text-slate-500">No spam. Unsubscribe anytime.</p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">For clients</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Find trusted pros and book faster with chat, quotes, and payments in one place.
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">For providers</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Get discovered, manage enquiries, send quotes, and get paid—without the chaos.
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-8 text-xs text-slate-500">All Rights reserved © Booka 2025</p>
          </section>

          <aside className="space-y-6">
            <HeroVector />

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Service Categories Coming Soon</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  'DJs & Entertainment',
                  'Catering Services',
                  'Photography & Video',
                  'Event Décor',
                  'Venues',
                  'Sound & Lighting',
                  'Event Planning',
                  'Security Services',
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
