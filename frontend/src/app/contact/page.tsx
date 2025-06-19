import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <MainLayout>
      <div className="prose max-w-2xl mx-auto">
        <h1>Contact Support</h1>
        <p>
          Email us&nbsp;
          <a href="mailto:support@example.com" className="text-brand-dark hover:underline">
            support@example.com
          </a>
          &nbsp;and we&apos;ll get back to you shortly.
        </p>
        <p>
          You can also check our&nbsp;
          <Link href="/faq" className="text-brand-dark hover:underline">
            FAQ
          </Link>
          &nbsp;for quick answers.
        </p>
      </div>
    </MainLayout>
  );
}
