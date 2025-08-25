'use client';

import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';

export default function ModerationHelpPage() {
  return (
    <MainLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">How listing moderation works</h1>
        <p className="mt-3 text-gray-700 leading-7">
          We review new and updated listings to keep quality high and ensure buyers have a great experience. Most
          reviews are completed within 24–48 hours.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900">Statuses</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>Pending review:</strong> We received your listing and it’s in the queue.</li>
            <li><strong>Approved:</strong> Your listing is live and visible to buyers.</li>
            <li><strong>Rejected:</strong> We couldn’t approve it this time. Check the message for reasons and next steps.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900">Tips to get approved</h2>
          <ul className="mt-3 space-y-2 text-gray-700 list-disc list-inside">
            <li>Use a clear service title and an eye‑catching cover image.</li>
            <li>Describe your offering, requirements, and travel range in detail.</li>
            <li>Set a realistic base price and include estimated travel costs.</li>
            <li>Add a short promo video or portfolio media if you have it.</li>
            <li>Keep your profile up to date and connect your Google Calendar.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900">If your listing was rejected</h2>
          <p className="mt-2 text-gray-700">
            Don’t worry — rejections are usually quick to fix. Open the message in your Inbox for details, edit the
            listing, and resubmit.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/artist?tab=services" className="inline-flex items-center rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900 no-underline hover:no-underline">
              Manage services
            </Link>
            <Link href="/support" className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline">
              Contact support
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900">Appeals</h2>
          <p className="mt-2 text-gray-700">
            If you believe a rejection was made in error, reply to the Booka update in your Inbox or contact support.
            Our team will take another look.
          </p>
        </section>
      </div>
    </MainLayout>
  );
}

