import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';

export default function FaqPage() {
  return (
    <MainLayout>
      <div className="prose max-w-2xl mx-auto">
        <h1>Frequently Asked Questions</h1>
        <p>Find answers to common questions about using our booking platform.</p>
        <p>
          Still need help?{' '}
          <Link href="/contact" className="text-indigo-600 hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    </MainLayout>
  );
}
