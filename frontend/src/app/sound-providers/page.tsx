'use client';
import { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { formatCurrency } from '@/lib/utils';
import {
  getSoundProviders,
  createSoundProvider,
  deleteSoundProvider,
  updateSoundProvider,
  getSoundProvidersForArtist,
  addArtistSoundPreference,
} from '@/lib/api';
import { SoundProvider, ArtistSoundPreference } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function SoundProvidersPage() {
  const [providers, setProviders] = useState<SoundProvider[]>([]);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const { user } = useAuth();
  const [preferences, setPreferences] = useState<ArtistSoundPreference[]>([]);
  const [prefProviderId, setPrefProviderId] = useState('');
  const [prefPriority, setPrefPriority] = useState('');

  const fetchPreferences = useCallback(async () => {
    if (user?.user_type !== 'artist') return;
    try {
      const prefRes = await getSoundProvidersForArtist(user.id);
      setPreferences(prefRes.data);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await getSoundProviders();
      setProviders(res.data);
      await fetchPreferences();
    } catch (e) {
      console.error(e);
    }
  }, [fetchPreferences]);

  useEffect(() => {
    fetchProviders();
  }, [user, fetchProviders]);

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

  const onEditClick = (prov: SoundProvider) => {
    setEditingId(prov.id);
    setEditName(prov.name);
    setEditContact(prov.contact_info || '');
    setEditPrice(prov.price_per_event != null ? String(prov.price_per_event) : '');
  };

  const onSaveEdit = async () => {
    if (editingId == null) return;
    try {
      await updateSoundProvider(editingId, {
        name: editName,
        contact_info: editContact || undefined,
        price_per_event: editPrice ? Number(editPrice) : undefined,
      });
      setEditingId(null);
      await fetchProviders();
    } catch (err) {
      console.error(err);
    }
  };

  const onAddPreference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.user_type !== 'artist') return;
    try {
      await addArtistSoundPreference(user.id, {
        provider_id: Number(prefProviderId),
        priority: prefPriority ? Number(prefPriority) : undefined,
      });
      setPrefProviderId('');
      setPrefPriority('');
      fetchPreferences();
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
          <button type="submit" className="px-4 py-2 bg-brand-dark text-white rounded">
            Add Provider
          </button>
        </form>

        <div className="space-y-2">
          {providers.map((prov) => (
            <div key={prov.id} className="border p-3 bg-white flex justify-between items-center rounded">
              {editingId === prov.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    data-edit-name
                    className="border p-1 rounded w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <input
                    className="border p-1 rounded w-full"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                  />
                  <input
                    type="number"
                    className="border p-1 rounded w-full"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <p className="font-medium">{prov.name}</p>
                  {prov.contact_info && <p className="text-sm">{prov.contact_info}</p>}
                  {prov.price_per_event != null && (
                    <p className="text-sm">{formatCurrency(Number(prov.price_per_event))}</p>
                  )}
                </div>
              )}
              {editingId === prov.id ? (
                <div className="flex flex-col space-y-1 ml-2">
                  <button data-save type="button" onClick={onSaveEdit} className="text-green-600 text-sm">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-sm">Cancel</button>
                </div>
              ) : (
                <div className="flex flex-col space-y-1 ml-2">
                  <button data-edit type="button" onClick={() => onEditClick(prov)} className="text-blue-600 text-sm">Edit</button>
                  <button type="button" onClick={() => onDelete(prov.id)} className="text-red-600 text-sm">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {user?.user_type === 'artist' && (
          <form onSubmit={onAddPreference} className="space-y-2 border p-4 bg-white rounded">
            <h2 className="font-medium">Preferred Providers</h2>
            <div>
              <label className="block text-sm font-medium">Provider</label>
              <select
                data-pref-provider
                className="border p-2 rounded w-full"
                value={prefProviderId}
                onChange={(e) => setPrefProviderId(e.target.value)}
              >
                <option value="" disabled>Select provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Priority</label>
              <input
                data-pref-priority
                type="number"
                className="border p-2 rounded w-full"
                value={prefPriority}
                onChange={(e) => setPrefPriority(e.target.value)}
              />
            </div>
            <button data-add-pref type="submit" className="px-4 py-2 bg-brand-dark text-white rounded">Add Preference</button>
            <div className="space-y-1">
              {preferences.map((pref) => (
                <div key={pref.id} className="flex justify-between border p-2 rounded bg-gray-50">
                  <span>{providers.find((p) => p.id === pref.provider_id)?.name || pref.provider?.name}</span>
                  <span className="text-sm">{pref.priority ?? ''}</span>
                </div>
              ))}
            </div>
          </form>
        )}
      </div>
    </MainLayout>
  );
}
