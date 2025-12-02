'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-10 text-white shadow-xl ring-1 ring-white/10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-300">
          Booka Terms &amp; Conditions
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">Booka SA (Pty) Ltd</h1>
        <p className="mt-2 text-sm text-slate-200">Effective Date: November 2025</p>
        <p className="mt-4 max-w-3xl text-slate-100">
          These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of the Booka website,
          platform, and services (&ldquo;the Platform&rdquo;). By using Booka, you agree to these
          Terms. If you don't agree, you may not use the Platform.
        </p>
      </section>

      <article className="prose prose-slate mt-10 max-w-none lg:prose-lg">
        <h2>1. The Platform</h2>
        <p>
          Booka provides an online platform that connects Service Providers (people or companies
          offering event-related services) with Clients (people seeking services). Booka does not
          provide the services directly, and we are not a broker, agent, or insurer.
        </p>
        <ul>
          <li>The Platform allows Users to browse, request, and confirm bookings for event services.</li>
          <li>We act as a facilitator of bookings, not as the employer or agent of Service Providers.</li>
        </ul>

        <h2>2. Using Booka</h2>
        <ul>
          <li>You must be at least 18 years old to use the Platform.</li>
          <li>You are responsible for all content you post and all interactions with other users.</li>
          <li>All bookings made through the Platform are subject to availability and confirmation.</li>
          <li>Prices and service details are provided by Service Providers.</li>
          <li>
            A booking is confirmed once a quote is accepted by the client and any required payment is
            completed.
          </li>
          <li>Clients must provide accurate event details.</li>
          <li>Misuse may result in account suspension.</li>
        </ul>

        <h2>3. Providers</h2>
        <ul>
          <li>Providers must be punctual, professional, and communicate clearly.</li>
          <li>You are an independent contractor, not an employee, agent, partner, or representative of Booka.</li>
          <li>You control your own services and activities; Booka does not manage or guarantee them.</li>
          <li>You may not give the impression that you are endorsed by or acting on behalf of Booka.</li>
          <li>You are responsible for following all laws applicable to your services.</li>
          <li>Each Service Provider is responsible for the quality and execution of the service they offer.</li>
        </ul>

        <h2>4. Clients</h2>
        <ul>
          <li>You agree to provide accurate information, ensure safety, allow setup access, and pay fees on time.</li>
          <li>You can search, book, and pay for services offered by Providers.</li>
          <li>Booka does not guarantee any Provider's availability, performance, or quality of services.</li>
          <li>
            All agreements and disputes between Clients and Providers are private matters; Booka is not a party to
            these agreements.
          </li>
        </ul>

        <h2>5. Travel, Setup and Logistics</h2>
        <ul>
          <li>Clients must ensure venue accessibility and safety.</li>
          <li>Additional fees may apply for travel, accommodation, or special requirements.</li>
          <li>Clients must ensure all necessary permits and power sources are available.</li>
        </ul>

        <h2>6. Payments &amp; Fees</h2>
        <ul>
          <li>Payments may be processed through Booka's payment system.</li>
          <li>Providers may set their own prices, but Booka may collect a service fee as described on the Site.</li>
          <li>
            Booka is not responsible for failed payments or disputes over fees; these must be resolved directly
            between Providers and Clients.
          </li>
        </ul>

        <h2>7. Intellectual Property</h2>
        <ul>
          <li>Booka owns all rights to the Site and its content (logos, text, graphics, code).</li>
          <li>You may not copy, distribute, or use Booka's intellectual property without permission.</li>
          <li>Providers may only use Booka's content in ways approved by Booka.</li>
        </ul>

        <h2>8. User Content</h2>
        <ul>
          <li>You are responsible for anything you post or upload to Booka.</li>
          <li>You may not post content that is illegal, harmful, or infringes others' rights.</li>
          <li>Booka can remove content at our discretion but is not obligated to monitor or review all content.</li>
        </ul>

        <h2>9. Disclaimers &amp; Limitations of Liability</h2>
        <ul>
          <li>We are not liable for performance issues, event disruptions, or negligence by the Client or venue.</li>
          <li>Booka provides the Site &ldquo;as is&rdquo; and does not guarantee that it will be error-free or uninterrupted.</li>
          <li>Booka is not responsible for any damages, losses, or disputes arising from the use of the Site or Services.</li>
          <li>
            To the maximum extent allowed by law, Booka disclaims all liability for actions of Providers, Clients, or
            other users, or for the quality, safety, or legality of any services offered.
          </li>
        </ul>

        <h2>10. Disputes</h2>
        <p>Disputes should be resolved between Client and Provider; we may assist but are not obligated to.</p>

        <h2>11. Termination</h2>
        <ul>
          <li>Booka may suspend or terminate your access if you violate these Terms.</li>
          <li>You may also stop using Booka at any time.</li>
          <li>Sections that should survive termination (like disclaimers and liability limits) will remain in effect.</li>
        </ul>

        <h2>12. Cancellation &amp; Refund Policy</h2>
        <ul>
          <li>Client cancellations must be made in writing.</li>
          <li>
            Standard cancellation terms (unless otherwise stated):
            <ul>
              <li>90+ days prior: refundable (minus deposit)</li>
              <li>31-90 days: 50% payable</li>
              <li>0-30 days: 100% payable</li>
            </ul>
          </li>
        </ul>

        <h2>13. Governing Law</h2>
        <ul>
          <li>These Terms are governed by the laws of South Africa.</li>
          <li>Any disputes will be resolved in the courts of South Africa.</li>
        </ul>

        <h2>14. POPIA Compliance</h2>
        <p>
          We comply with the Protection of Personal Information Act. Your information is used only for booking and
          communication purposes and will not be shared with third parties without your consent.
        </p>

        <h2>15. Changes to Terms</h2>
        <ul>
          <li>Booka may update these Terms from time to time.</li>
          <li>The latest version will always be posted on the Site.</li>
          <li>Continued use of Booka after changes means you accept the new Terms.</li>
        </ul>

        <h2>16. Contact</h2>
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
          See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
