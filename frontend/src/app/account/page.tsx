'use client';

import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';

export default function AccountPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10 space-y-4">
        <h1 className="text-2xl font-bold">Account</h1>
        <ul className="space-y-2 list-disc list-inside">
          <li>
            <Link href="/account/profile-picture" className="text-indigo-700 underline">
              Update Profile Picture
            </Link>
          </li>
          <li>
            <Link href="/account/export" className="text-indigo-700 underline">
              Export Account Data
            </Link>
          </li>
          <li>
            <Link href="/account/delete" className="text-indigo-700 underline">
              Delete Account
            </Link>
          </li>
        </ul>
      </div>
    </MainLayout>
  );
}
