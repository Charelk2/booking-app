'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import { getServiceCategories, updateMyArtistProfile } from '@/lib/api';
import { ServiceCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function SelectCategoryPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const res = await getServiceCategories();
        setCategories(res.data);
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        setError(err instanceof Error ? err.message : 'Failed to load categories');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = async (id: number) => {
    try {
      await updateMyArtistProfile({ service_category_id: id });
      await refreshUser?.();
      router.replace('/dashboard/artist');
    } catch (err) {
      console.error('Failed to update category:', err);
      setError(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8">Loading categories...</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-bold">Select Your Service Category</h1>
        {error && <p className="text-red-600">{error}</p>}
        <ul className="space-y-2">
          {categories.map((cat) => (
            <li key={cat.id}>
              <Button className="w-full" onClick={() => handleSelect(cat.id)}>
                {cat.name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </MainLayout>
  );
}
