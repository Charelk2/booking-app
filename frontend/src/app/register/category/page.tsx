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
  const [selected, setSelected] = useState<number | ''>('');
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    getServiceCategories()
      .then((res) => setCategories(res.data))
      .catch((err) => console.error('Failed to fetch categories:', err));
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    try {
      await updateMyArtistProfile({ service_category_id: Number(selected) });
      if (refreshUser) {
        await refreshUser();
      }
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4">Select Your Service Category</h1>
        <select
          className="w-full border rounded p-2 mb-4"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button onClick={handleSave} disabled={!selected}>
          Save
        </Button>
      </div>
    </MainLayout>
  );
}
