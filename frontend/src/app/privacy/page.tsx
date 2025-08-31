'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p>
        Your privacy matters. This page describes what we collect when you use Booka,
        how we use it, and your choices. We collect the minimum necessary to provide
        the service, including account info, booking details, and communications.
      </p>
      <p>
        For sign-in with Google, we receive an ID token from Google Identity Services
        to authenticate you. We do not receive your password from Google.
      </p>
      <h2>Contact</h2>
      <p>
        Questions? Email support at <a href="mailto:support@booka.co.za">support@booka.co.za</a>.
      </p>
      <p>
        See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </main>
  );
}
