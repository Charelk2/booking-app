'use client';

import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  TrashIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

export default function AccountPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-xl my-10 p-4 sm:p-6 lg:p-8 bg-white shadow-lg rounded-lg space-y-6">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-800 border-b pb-4">
          Account Settings
        </h1>
        <div className="grid gap-4 sm:grid-cols-2" data-testid="account-actions">
          <Link
            href="/account/profile-picture"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
          >
            <PhotoIcon className="w-6 h-6 text-gray-600" />
            <span className="font-medium text-gray-700">Update Profile Picture</span>
          </Link>
          <Link
            href="/account/export"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
          >
            <ArrowDownTrayIcon className="w-6 h-6 text-gray-600" />
            <span className="font-medium text-gray-700">Export Account Data</span>
          </Link>
          <Link
            href="/account/delete"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition"
          >
            <TrashIcon className="w-6 h-6 text-gray-600" />
            <span className="font-medium text-gray-700">Delete Account</span>
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}
