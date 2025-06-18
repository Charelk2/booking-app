import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <MainLayout>
      <div className="prose max-w-2xl mx-auto">
        <h1>Contact Support</h1>
        <p>
          Email us at{' '}
          <a href="mailto:support@example.com" className="text-indigo-600 hover:underline">
            support@example.com
          </a>
           and we'll get back to you shortly.
        </p>
        <p>
          You can also check our{' '}
          <Link href="/faq" className="text-indigo-600 hover:underline">
            FAQ
          </Link>
           for quick answers.
        </p>
      </div>
    </MainLayout>
  );
}
