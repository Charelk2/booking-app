'use client';

import { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { QuoteTemplate, ServiceItem } from '@/types';
import {
  getQuoteTemplates,
  createQuoteTemplate,
  updateQuoteTemplate,
  deleteQuoteTemplate,
} from '@/lib/api';

export default function QuoteTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [services, setServices] = useState<ServiceItem[]>([{ description: '', price: 0 }]);
  const [soundFee, setSoundFee] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [accommodation, setAccommodation] = useState('');
  const [discount, setDiscount] = useState(0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editServices, setEditServices] = useState<ServiceItem[]>([]);
  const [editSoundFee, setEditSoundFee] = useState(0);
  const [editTravelFee, setEditTravelFee] = useState(0);
  const [editAccommodation, setEditAccommodation] = useState('');
  const [editDiscount, setEditDiscount] = useState(0);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getQuoteTemplates(user.id);
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && user.user_type === 'artist') {
      fetchTemplates();
    }
  }, [user, fetchTemplates]);

  const addService = () =>
    setServices([...services, { description: '', price: 0 }]);
  const updateService = (
    idx: number,
    field: keyof ServiceItem,
    value: string,
  ) => {
    setServices((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, [field]: field === 'price' ? Number(value) : value } : s,
      ),
    );
  };
  const removeService = (idx: number) =>
    setServices((prev) => prev.filter((_, i) => i !== idx));

  const addEditService = () =>
    setEditServices([...editServices, { description: '', price: 0 }]);
  const updateEditService = (
    idx: number,
    field: keyof ServiceItem,
    value: string,
  ) => {
    setEditServices((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, [field]: field === 'price' ? Number(value) : value } : s,
      ),
    );
  };
  const removeEditService = (idx: number) =>
    setEditServices((prev) => prev.filter((_, i) => i !== idx));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const res = await createQuoteTemplate({
        artist_id: user.id,
        name,
        services,
        sound_fee: soundFee,
        travel_fee: travelFee,
        accommodation: accommodation || null,
        discount: discount || null,
      });
      setTemplates([...templates, res.data]);
      setName('');
      setServices([{ description: '', price: 0 }]);
      setSoundFee(0);
      setTravelFee(0);
      setAccommodation('');
      setDiscount(0);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to create template');
    }
  };

  const startEdit = (tmpl: QuoteTemplate) => {
    setEditingId(tmpl.id);
    setEditName(tmpl.name);
    setEditServices(tmpl.services);
    setEditSoundFee(tmpl.sound_fee);
    setEditTravelFee(tmpl.travel_fee);
    setEditAccommodation(tmpl.accommodation || '');
    setEditDiscount(tmpl.discount || 0);
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    try {
      const res = await updateQuoteTemplate(editingId, {
        name: editName,
        services: editServices,
        sound_fee: editSoundFee,
        travel_fee: editTravelFee,
        accommodation: editAccommodation || null,
        discount: editDiscount || null,
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === editingId ? res.data : t)),
      );
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError('Failed to update template');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteQuoteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to manage templates.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">Loading...</div>
      </MainLayout>
    );
  }

  if (user.user_type !== 'artist') {
    return (
      <MainLayout>
        <div className="p-8">Access denied</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Quote Templates</h1>
        <form onSubmit={handleCreate} className="space-y-2 border p-4 bg-white rounded">
          <label className="block text-sm font-medium">
            Name
            <input
              className="border p-1 rounded w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {services.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                placeholder="Description"
                className="flex-1 border p-1 rounded"
                value={s.description}
                onChange={(e) => updateService(i, 'description', e.target.value)}
              />
              <input
                type="number"
                placeholder="Price"
                className="w-24 border p-1 rounded"
                value={s.price}
                onChange={(e) => updateService(i, 'price', e.target.value)}
              />
              {services.length > 0 && (
                <button type="button" onClick={() => removeService(i)} className="text-red-600" aria-label="Remove">
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addService} className="text-sm text-brand-dark">
            Add Item
          </button>
          <label className="block text-sm">
            Sound Fee
            <input
              type="number"
              className="border p-1 rounded w-full"
              value={soundFee}
              onChange={(e) => setSoundFee(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Travel Fee
            <input
              type="number"
              className="border p-1 rounded w-full"
              value={travelFee}
              onChange={(e) => setTravelFee(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Accommodation
            <textarea
              className="border p-1 rounded w-full"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Discount
            <input
              type="number"
              className="border p-1 rounded w-full"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="px-4 py-2 bg-brand-dark text-white rounded">
            Add Template
          </button>
        </form>

        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="border p-3 bg-white flex justify-between rounded">
              {editingId === t.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    data-edit-name
                    className="border p-1 rounded w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  {editServices.map((s, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        data-edit-desc
                        className="flex-1 border p-1 rounded"
                        value={s.description}
                        onChange={(e) => updateEditService(i, 'description', e.target.value)}
                      />
                      <input
                        data-edit-price
                        type="number"
                        className="w-24 border p-1 rounded"
                        value={s.price}
                        onChange={(e) => updateEditService(i, 'price', e.target.value)}
                      />
                      {editServices.length > 0 && (
                        <button type="button" onClick={() => removeEditService(i)} className="text-red-600" aria-label="Remove">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addEditService} className="text-sm text-brand-dark">
                    Add Item
                  </button>
                  <input
                    data-edit-sound
                    type="number"
                    className="border p-1 rounded w-full"
                    value={editSoundFee}
                    onChange={(e) => setEditSoundFee(Number(e.target.value))}
                  />
                  <input
                    data-edit-travel
                    type="number"
                    className="border p-1 rounded w-full"
                    value={editTravelFee}
                    onChange={(e) => setEditTravelFee(Number(e.target.value))}
                  />
                  <textarea
                    data-edit-accom
                    className="border p-1 rounded w-full"
                    value={editAccommodation}
                    onChange={(e) => setEditAccommodation(e.target.value)}
                  />
                  <input
                    data-edit-discount
                    type="number"
                    className="border p-1 rounded w-full"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div>
                  <p className="font-medium">{t.name}</p>
                </div>
              )}
              {editingId === t.id ? (
                <div className="flex flex-col space-y-1 ml-2">
                  <button data-save-edit type="button" onClick={handleSaveEdit} className="text-green-600 text-sm">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-sm">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-col space-y-1 ml-2">
                  <button data-edit type="button" onClick={() => startEdit(t)} className="text-blue-600 text-sm">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(t.id)} className="text-red-600 text-sm">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

