'use client';
import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { calculateQuote } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { QuoteCalculationResponse } from '@/types';

export default function QuoteCalculatorPage() {
  const [baseFee, setBaseFee] = useState('');
  const [distance, setDistance] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [result, setResult] = useState<QuoteCalculationResponse | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      const res = await calculateQuote({
        base_fee: Number(baseFee),
        distance_km: Number(distance),
        accommodation_cost: accommodation ? Number(accommodation) : undefined,
      });
      setResult(res);
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
            <label className="block text-sm font-medium">Accommodation Cost</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-brand-dark text-white rounded">
            Calculate
          </button>
        </form>
        {result && (
          <div className="bg-white p-4 rounded border space-y-1">
            <p>Base Fee: {formatCurrency(Number(result.base_fee))}</p>
            <p>
              Travel Cost ({result.travel_mode}):{' '}
              {formatCurrency(Number(result.travel_cost))}
            </p>
            {result.travel_estimates.length > 0 && (
              <ul className="list-disc list-inside">
                {result.travel_estimates.map((t) => (
                  <li key={t.mode}>
                    {t.mode}: {formatCurrency(Number(t.cost))}
                  </li>
                ))}
              </ul>
            )}
            <p>Accommodation: {formatCurrency(Number(result.accommodation_cost))}</p>
            <p className="font-semibold">Total: {formatCurrency(Number(result.total))}</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
