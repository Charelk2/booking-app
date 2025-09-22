'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import { deleteMyAccount } from '@/lib/api';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await deleteMyAccount(password);
      router.push('/auth?intent=login');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10">
        <h1 className="mb-4 text-2xl font-bold">Delete Account</h1>
        <form onSubmit={handleDelete} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Confirm password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand focus:ring-brand"
            />
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
            {loading ? 'Deleting...' : 'Delete my account'}
          </Button>
        </form>
      </div>
    </MainLayout>
  );
}
