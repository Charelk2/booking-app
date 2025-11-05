'use client';

import Link from 'next/link';

export default function ProviderPayoutsPage() {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-2">Payouts</h1>
      <p className="text-sm text-gray-600">This page will list your payouts (first 50% and final 50%) once available.</p>
      <p className="text-sm text-gray-600">For now, payouts are processed manually by our team.</p>
      <div className="mt-4">
        <Link href="/dashboard/artist" className="underline text-blue-700">Back to dashboard</Link>
      </div>
    </div>
  );
}

