'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="bg-slate-50 pb-16 pt-10 text-slate-900">
      <section className="mx-auto max-w-6xl rounded-3xl bg-amber-300 px-8 py-10 shadow-lg ring-1 ring-amber-200 sm:px-12 sm:py-12">
        <div className="max-w-3xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-900/80">Privacy &amp; Data</p>
          <h1 className="text-4xl font-semibold leading-tight text-amber-950 sm:text-5xl">Booka Privacy Policy</h1>
          <p className="text-lg leading-relaxed text-amber-950/90">
            How we collect, use, store, and protect your information when you book through Booka or provide services on our
            platform.
          </p>
          <p className="text-sm font-medium text-amber-950/80">Last Updated: November 2025</p>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-6xl gap-10 px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-24 self-start rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">On this page</p>
          <nav className="mt-4 space-y-3 text-sm font-medium text-slate-800">
            {[
              ['intro', 'Introduction'],
              ['info', 'Information We Collect'],
              ['use', 'How We Use Data'],
              ['legal', 'Legal Basis'],
              ['sharing', 'Sharing'],
              ['cookies', 'Cookies'],
              ['security', 'Security'],
              ['retention', 'Retention'],
              ['rights', 'Your POPIA Rights'],
              ['children', "Children's Privacy"],
              ['transfers', 'International Transfers'],
              ['changes', 'Changes'],
              ['contact', 'Contact'],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block rounded-md px-2 py-1 text-slate-900 underline-offset-4 transition hover:bg-slate-50 hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="prose prose-slate max-w-none rounded-3xl bg-white p-8 text-slate-900 shadow-sm ring-1 ring-slate-200 prose-headings:text-slate-900 prose-p:text-slate-800 prose-li:text-slate-800 prose-strong:text-slate-900 prose-a:text-slate-900 prose-a:font-semibold prose-a:underline-offset-4 hover:prose-a:underline lg:prose-lg">
          <h2 id="intro">1. Introduction</h2>
          <p>
            This Privacy Policy explains how Booka SA Pty Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects,
            uses, discloses, and protects personal information when Users (&ldquo;you&rdquo;, &ldquo;Clients&rdquo;,
            &ldquo;Service Providers&rdquo;) interact with Booka (&ldquo;the Platform&rdquo;). We comply with the Protection of
            Personal Information Act, 4 of 2013 (POPIA).
          </p>

          <h2 id="info">2. Information We Collect</h2>
          <h3>2.1 Information Provided Directly by Users</h3>
          <p>Clients:</p>
          <ul>
            <li>Name and surname</li>
            <li>Contact details</li>
            <li>Event details</li>
            <li>Payment information (processed via third-party providers)</li>
          </ul>
          <p>Service Providers:</p>
          <ul>
            <li>Name and business name</li>
            <li>Contact information</li>
            <li>Portfolio media</li>
            <li>Professional details</li>
            <li>Pricing and availability</li>
            <li>Banking details for payouts</li>
          </ul>

          <h3>2.2 Automatically Collected Information</h3>
          <ul>
            <li>IP address</li>
            <li>Device and browser details</li>
            <li>Usage data</li>
            <li>Cookies and tracking data</li>
          </ul>

          <h3>2.3 Third-Party Information</h3>
          <p>We may receive information from payment gateways, social login services, and public sources.</p>

          <h2 id="use">3. How We Use Your Information</h2>
          <ul>
            <li>Operating the Platform</li>
            <li>Booking processing and confirmations</li>
            <li>Payments and financial management</li>
            <li>Communication and notifications</li>
            <li>Verification and fraud prevention</li>
            <li>Analytics and improvements</li>
          </ul>

          <h2 id="legal">4. Legal Basis for Processing (POPIA)</h2>
          <p>We process personal information based on consent, contractual necessity, legal obligations, and legitimate interests.</p>

          <h2 id="sharing">5. Sharing of Personal Information</h2>
          <p>We may share information with:</p>
          <ul>
            <li>Service Providers (to fulfill bookings)</li>
            <li>Clients (when a provider is booked)</li>
            <li>Third-party payment, hosting, and communication providers</li>
            <li>Legal authorities if required</li>
          </ul>

          <h2 id="cookies">6. Cookies and Tracking</h2>
          <p>We use cookies for performance, analytics, and user experience. Users may disable cookies in browser settings.</p>

          <h2 id="security">7. Data Storage and Security</h2>
          <p>We implement reasonable technical and organizational measures including encryption, secure servers, and role-based access.</p>

          <h2 id="retention">8. Data Retention</h2>
          <p>Data is retained only as long as necessary for service provision, legal compliance, or business operations. Users may request deletion of personal data.</p>

          <h2 id="rights">9. Your POPIA Rights</h2>
          <p>You may request:</p>
          <ul>
            <li>Access to your data</li>
            <li>Corrections or updates</li>
            <li>Deletion (where legally possible)</li>
            <li>Objection to processing</li>
            <li>Withdrawal of consent</li>
          </ul>

          <h2 id="children">10. Children's Privacy</h2>
          <p>The Platform is not for users under 18 years old. We do not knowingly collect minor data.</p>

          <h2 id="transfers">11. International Data Transfers</h2>
          <p>Any transfers outside South Africa are protected by POPIA-compliant safeguards.</p>

          <h2 id="changes">12. Changes to This Policy</h2>
          <p>We may update this Privacy Policy. Continued use of the Platform means acceptance of updates.</p>

          <h2 id="contact">13. Contact Information</h2>
          <p className="not-prose mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 shadow-sm">
            <span className="block font-semibold text-slate-900">Booka SA Pty Ltd</span>
            <span className="mt-1 block text-sm text-slate-700">
              Midlands Office Park West, Mount Quray road, Midstream Estate, Centurion, 1683
            </span>
            <span className="mt-3 block text-sm text-slate-700">
              Email:{' '}
              <a className="text-slate-900 underline-offset-4 hover:underline" href="mailto:support@booka.co.za">
                support@booka.co.za
              </a>
            </span>
          </p>

          <p className="text-sm text-slate-600">
            See also our{' '}
            <Link className="text-slate-900 underline-offset-4 hover:underline" href="/terms">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </article>
      </div>
    </main>
  );
}
