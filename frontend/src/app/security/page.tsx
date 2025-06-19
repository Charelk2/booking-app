'use client';

import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';

export default function SecurityPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10">
        <h1 className="mb-4 text-2xl font-bold">Account Security</h1>
        <ul className="space-y-2">
          <li>
            <Link href="/security/enable" className="text-brand-dark underline">
              Enable two-factor authentication
            </Link>
          </li>
          <li>
            <Link href="/security/disable" className="text-brand-dark underline">
              Disable two-factor authentication
            </Link>
          </li>
        </ul>
      </div>
    </MainLayout>
  );
}
