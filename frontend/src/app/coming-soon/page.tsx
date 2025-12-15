import Image from 'next/image';

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

export default function ComingSoonPage({ searchParams }: ComingSoonPageProps) {
  const subscribed = searchParams?.subscribed === '1';
  const hasError = searchParams?.error === '1';

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <header className="flex items-center justify-between">
          <Image
            src="/booka_logo.jpg"
            alt="Booka"
            width={120}
            height={48}
            priority
            className="h-auto w-[120px] rounded-md"
          />
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
          <section>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Your Event, Simplified
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              South Africa&apos;s premier platform for booking event service providers. From DJs
              to caterers, photographers to decorators—find and book trusted professionals for
              your perfect event.
            </p>

            <dl className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-slate-900">Easy Booking</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                  Browse, compare, and book service providers in just a few clicks
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-slate-900">Verified Professionals</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                  All service providers are vetted and reviewed by real customers
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-slate-900">All-in-One Platform</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                  Manage all your event bookings and payments in one place
                </dd>
              </div>
            </dl>

            <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Be the First to Know</h2>
              <p className="mt-2 text-sm text-slate-600">
                Sign up now to get early access, exclusive launch offers, and be notified the
                moment we go live.
              </p>

              {subscribed ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Thanks — you&apos;re on the list.
                </div>
              ) : null}
              {hasError ? (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  Something went wrong. Please try again.
                </div>
              ) : null}

              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row"
                action="/api/waitlist"
                method="post"
              >
                <label className="flex-1">
                  <span className="sr-only">Email Address</span>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Notify Me at Launch
                </button>
              </form>
              <p className="mt-3 text-xs text-slate-500">Join 500+ others waiting for launch</p>
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Service Categories Coming Soon</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                DJs &amp; Entertainment
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Catering Services
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Photography &amp; Video
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Event Décor
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Venues
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Sound &amp; Lighting
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Event Planning
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                Security Services
              </li>
            </ul>

            <p className="mt-10 text-xs text-slate-500">All Rights reserved © Booka 2025</p>
          </aside>
        </div>
      </div>
    </main>
  );
}

