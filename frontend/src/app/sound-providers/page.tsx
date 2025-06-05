'use client';
import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import {
  getSoundProviders,
  createSoundProvider,
  deleteSoundProvider,
} from '@/lib/api';
import { SoundProvider } from '@/types';

export default function SoundProvidersPage() {
  const [providers, setProviders] = useState<SoundProvider[]>([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    try {
      const res = await getSoundProviders();
      setProviders(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSoundProvider({
        name,
        contact_info: contact,
        price_per_event: price ? Number(price) : undefined,
      });
      setName('');
      setContact('');
      setPrice('');
      setError(null);
      fetchProviders();
    } catch (err: unknown) {
      setError('Failed to create provider');
      console.error(err);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteSoundProvider(id);
      fetchProviders();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Sound Providers</h1>
        <form onSubmit={onSubmit} className="space-y-2 border p-4 bg-white rounded">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              className="border p-2 rounded w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Contact Info</label>
            <input
              className="border p-2 rounded w-full"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Price Per Event</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">
            Add Provider
          </button>
        </form>

        <div className="space-y-2">
          {providers.map((prov) => (
            <div key={prov.id} className="border p-3 bg-white flex justify-between items-center rounded">
              <div>
                <p className="font-medium">{prov.name}</p>
                {prov.contact_info && <p className="text-sm">{prov.contact_info}</p>}
                {prov.price_per_event != null && (
                  <p className="text-sm">${Number(prov.price_per_event).toFixed(2)}</p>
                )}
              </div>
              <button
                onClick={() => onDelete(prov.id)}
                className="text-red-600 text-sm"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
