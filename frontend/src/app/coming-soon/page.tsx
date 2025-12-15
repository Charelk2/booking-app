import Image from 'next/image';
import { ArrowRight, CalendarCheck2, ShieldCheck, Sparkles, Zap } from 'lucide-react';

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
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-black" />

      {/* Soft gradient blobs */}
      <div className="absolute -top-44 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-accent/35 via-fuchsia-500/15 to-sky-500/10 blur-3xl" />
      <div className="absolute -bottom-52 left-[-140px] h-[560px] w-[560px] rounded-full bg-gradient-to-tr from-emerald-400/10 via-cyan-400/10 to-accent/25 blur-3xl" />
      <div className="absolute -bottom-56 right-[-220px] h-[640px] w-[640px] rounded-full bg-gradient-to-tr from-violet-500/10 via-slate-900/10 to-accent/25 blur-3xl" />

      {/* Subtle grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.10]" viewBox="0 0 1200 800">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="55%" stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#grid)" />
        <rect width="1200" height="800" fill="url(#gridFade)" />
      </svg>
    </div>
  );
}

function HeroVector() {
  return (
    <div aria-hidden="true" className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-white/0" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_25%_30%,rgba(255,122,133,0.30),transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_72%_62%,rgba(56,189,248,0.18),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_55%_90%,rgba(168,85,247,0.16),transparent_60%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 750">
        <defs>
          <linearGradient id="strokeA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,122,133,0.90)" />
            <stop offset="45%" stopColor="rgba(168,85,247,0.55)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.55)" />
          </linearGradient>
          <linearGradient id="strokeB" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,197,94,0.45)" />
            <stop offset="55%" stopColor="rgba(56,189,248,0.35)" />
            <stop offset="100%" stopColor="rgba(255,122,133,0.35)" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
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
          stroke="url(#strokeA)"
          strokeWidth="10"
          strokeLinecap="round"
          filter="url(#softGlow)"
          opacity="0.9"
        />
        <path
          d="M -30 340 C 90 295, 160 395, 260 345 C 350 305, 420 380, 540 340 C 640 305, 690 355, 720 330"
          fill="none"
          stroke="url(#strokeB)"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M -20 420 C 110 365, 180 470, 290 420 C 380 380, 450 455, 560 420 C 660 385, 700 435, 720 410"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
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
        <g opacity="0.35">
          <rect x="120" y="610" width="360" height="46" rx="18" fill="rgba(255,255,255,0.10)" />
          <rect x="170" y="624" width="260" height="16" rx="8" fill="rgba(255,255,255,0.12)" />
        </g>
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
}

export default function ComingSoonPage({ searchParams }: ComingSoonPageProps) {
  const subscribed = searchParams?.subscribed === '1';
  const hasError = searchParams?.error === '1';

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <BackgroundDecor />

      <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/90 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              <Image
                src="/booka_logo.jpg"
                alt="Booka"
                width={120}
                height={48}
                priority
                className="h-auto w-[120px] rounded-md"
              />
            </div>
            <div className="hidden sm:block">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
                <Sparkles className="h-4 w-4 text-accent" />
                Launching soon
              </div>
            </div>
          </div>

          <a
            href="#waitlist"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
          >
            Get early access
            <ArrowRight className="h-4 w-4" />
          </a>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur sm:hidden">
              <Sparkles className="h-4 w-4 text-accent" />
              Launching soon
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Your Event,
              <span className="block bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
                Simplified
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">
              South Africa&apos;s premier platform for booking event service providers. From DJs to
              caterers, photographers to decorators—find and book trusted professionals for
              your perfect event.
            </p>

            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  <dt className="font-semibold text-white">Easy Booking</dt>
                </div>
                <dd className="mt-2 text-sm leading-relaxed text-white/70">
                  Browse, compare, and book service providers in just a few clicks
                </dd>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <dt className="font-semibold text-white">Verified Pros</dt>
                </div>
                <dd className="mt-2 text-sm leading-relaxed text-white/70">
                  All service providers are vetted and reviewed by real customers
                </dd>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-center gap-2">
                  <CalendarCheck2 className="h-4 w-4 text-accent" />
                  <dt className="font-semibold text-white">All-in-One</dt>
                </div>
                <dd className="mt-2 text-sm leading-relaxed text-white/70">
                  Manage all your event bookings and payments in one place
                </dd>
              </div>
            </dl>

            <div
              id="waitlist"
              className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur"
            >
              <div className="px-6 py-6 sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Be the First to Know</h2>
                    <p className="mt-2 text-sm text-white/70">
                      Sign up to get early access, exclusive launch offers, and a launch-day
                      notification.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">
                    Join 500+ others waiting for launch
                  </div>
                </div>

                {subscribed ? (
                  <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    Thanks — you&apos;re on the list.
                  </div>
                ) : null}
                {hasError ? (
                  <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
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
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 shadow-sm focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/10"
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
                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,122,133,0.25)] hover:from-accent/90 hover:to-fuchsia-500/90 focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    Notify Me at Launch
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </form>
                <p className="mt-3 text-xs text-white/55">
                  No spam. Unsubscribe anytime.
                </p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-white">For clients</div>
                  <div className="mt-1 text-sm text-white/70">
                    Find trusted pros and book faster with chat, quotes, and payments in one place.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-white">For providers</div>
                  <div className="mt-1 text-sm text-white/70">
                    Get discovered, manage enquiries, send quotes, and get paid—without the chaos.
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-8 text-xs text-white/45">All Rights reserved © Booka 2025</p>
          </section>

          <aside className="space-y-6">
            <HeroVector />

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Service Categories Coming Soon</h2>
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
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/80"
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
