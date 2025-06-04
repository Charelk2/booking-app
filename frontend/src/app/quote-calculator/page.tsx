'use client';
import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { calculateQuote, getSoundProviders } from '@/lib/api';
import { QuoteCalculationResponse, SoundProvider } from '@/types';

export default function QuoteCalculatorPage() {
  const [baseFee, setBaseFee] = useState('');
  const [distance, setDistance] = useState('');
  const [providerId, setProviderId] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [result, setResult] = useState<QuoteCalculationResponse | null>(null);
  const [providers, setProviders] = useState<SoundProvider[]>([]);

  useEffect(() => {
    getSoundProviders()
      .then((res) => setProviders(res.data))
      .catch(() => setProviders([]));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      const res = await calculateQuote({
        base_fee: Number(baseFee),
        distance_km: Number(distance),
        provider_id: providerId ? Number(providerId) : undefined,
        accommodation_cost: accommodation ? Number(accommodation) : undefined,
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Quote Calculator</h1>
        <form onSubmit={onSubmit} className="space-y-2 bg-white p-4 rounded border">
          <div>
            <label className="block text-sm font-medium">Base Fee</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Distance (km)</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Sound Provider</label>
            <select
              className="border p-2 rounded w-full"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              <option value="">None</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Accommodation Cost</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">
            Calculate
          </button>
        </form>
        {result && (
          <div className="bg-white p-4 rounded border">
            <p>Base Fee: ${Number(result.base_fee).toFixed(2)}</p>
            <p>Travel Cost: ${Number(result.travel_cost).toFixed(2)}</p>
            <p>Provider Cost: ${Number(result.provider_cost).toFixed(2)}</p>
            <p>Accommodation: ${Number(result.accommodation_cost).toFixed(2)}</p>
            <p className="font-semibold">Total: ${Number(result.total).toFixed(2)}</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
