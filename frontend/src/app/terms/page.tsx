'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate">
      <h1>Terms of Service</h1>
      <p>
        By using Booka you agree to these terms. Booka provides a booking platform
        connecting clients and service providers. You are responsible for the
        accuracy of information you provide and for complying with applicable laws.
      </p>
      <p>
        Payments, cancellations, and refunds are governed by the policies presented
        during booking and on your quotes.
      </p>
      <p>
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
