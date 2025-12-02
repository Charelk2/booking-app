'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-10 text-white shadow-xl ring-1 ring-white/10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-300">
          Privacy Policy
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">Booka South Africa</h1>
        <p className="mt-2 text-sm text-slate-200">Last Updated: November 2025</p>
        <p className="mt-4 max-w-3xl text-slate-100">
          This Privacy Policy explains how Booka SA Pty Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
          &ldquo;our&rdquo;) collects, uses, discloses, and protects personal information when
          Clients and Service Providers use the Platform. We comply with the Protection of
          Personal Information Act, 4 of 2013 (POPIA).
        </p>
      </section>

      <article className="prose prose-slate mt-10 max-w-none lg:prose-lg">
        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy explains how Booka SA Pty Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
          &ldquo;our&rdquo;) collects, uses, discloses, and protects personal information when Users
          (&ldquo;you&rdquo;, &ldquo;Clients&rdquo;, &ldquo;Service Providers&rdquo;) interact with
          Booka (&ldquo;the Platform&rdquo;). We comply with the Protection of Personal Information
          Act, 4 of 2013 (POPIA).
        </p>

        <h2>2. Information We Collect</h2>
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
        <p>
          We may receive information from payment gateways, social login services, and public
          sources.
        </p>

        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>Operating the Platform</li>
          <li>Booking processing and confirmations</li>
          <li>Payments and financial management</li>
          <li>Communication and notifications</li>
          <li>Verification and fraud prevention</li>
          <li>Analytics and improvements</li>
        </ul>

        <h2>4. Legal Basis for Processing (POPIA)</h2>
        <p>
          We process personal information based on consent, contractual necessity, legal
          obligations, and legitimate interests.
        </p>

        <h2>5. Sharing of Personal Information</h2>
        <p>We may share information with:</p>
        <ul>
          <li>Service Providers (to fulfill bookings)</li>
          <li>Clients (when a provider is booked)</li>
          <li>Third-party payment, hosting, and communication providers</li>
          <li>Legal authorities if required</li>
        </ul>

        <h2>6. Cookies and Tracking</h2>
        <p>
          We use cookies for performance, analytics, and user experience. Users may disable cookies
          in browser settings.
        </p>

        <h2>7. Data Storage and Security</h2>
        <p>
          We implement reasonable technical and organizational measures including encryption,
          secure servers, and role-based access.
        </p>

        <h2>8. Data Retention</h2>
        <p>
          Data is retained only as long as necessary for service provision, legal compliance, or
          business operations. Users may request deletion of personal data.
        </p>

        <h2>9. Your POPIA Rights</h2>
        <p>You may request:</p>
        <ul>
          <li>Access to your data</li>
          <li>Corrections or updates</li>
          <li>Deletion (where legally possible)</li>
          <li>Objection to processing</li>
          <li>Withdrawal of consent</li>
        </ul>

        <h2>10. Children's Privacy</h2>
        <p>The Platform is not for users under 18 years old. We do not knowingly collect minor data.</p>

        <h2>11. International Data Transfers</h2>
        <p>Any transfers outside South Africa are protected by POPIA-compliant safeguards.</p>

        <h2>12. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy. Continued use of the Platform means acceptance of
          updates.
        </p>

        <h2>13. Contact Information</h2>
        <p className="not-prose mt-4 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <span className="block font-semibold text-slate-900">Booka SA Pty Ltd</span>
          <span className="mt-1 block text-sm text-slate-600">
            Midlands Office Park West, Mount Quray road, Midstream Estate, Centurion, 1683
          </span>
          <span className="mt-3 block text-sm text-slate-600">
            Email:{' '}
            <a className="text-slate-900 underline" href="mailto:support@booka.co.za">
              support@booka.co.za
            </a>
          </span>
          <span className="block text-sm text-slate-600">Phone: tbc</span>
        </p>

        <p className="text-sm text-slate-500">
          See also our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </article>
    </main>
  );
}
