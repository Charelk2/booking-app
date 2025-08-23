'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getService, getServiceReviews } from '@/lib/api';
import { Service, Review } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { StarIcon } from '@heroicons/react/24/outline';
import { Spinner } from '@/components/ui';

export default function ServiceDetailPage() {
  const params = useParams();
  const serviceId = Number(params.id);
  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!serviceId) return;
    const fetch = async () => {
      try {
        const [sRes, rRes] = await Promise.all([
          getService(serviceId),
          getServiceReviews(serviceId),
        ]);
        setService(sRes.data);
        setReviews(rRes.data);
      } catch (err) {
        console.error('Failed to load service', err);
        setError('Failed to load service');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [serviceId]);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8"><Spinner /></div>
      </MainLayout>
    );
  }

  if (error || !service) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error || 'Service not found'}</div>
      </MainLayout>
    );
  }

  const average =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : null;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="bg-white shadow rounded-md p-6">
          <h1 className="text-2xl font-bold mb-2">{service.title}</h1>
          {service.description && (
            <p className="text-gray-600 mb-2">{service.description}</p>
          )}
          <p className="text-gray-800 font-semibold">
            {formatCurrency(Number(service.price))} — {(service as any).duration || (service as any)?.details?.duration_label || `${service.duration_minutes} min`}
          </p>
          {average && (
            <p className="mt-2 flex items-center text-sm text-gray-700">
              <StarIcon className="h-4 w-4 mr-1 text-yellow-400" /> {average} / 5
            </p>
          )}
        </div>
        <section>
          <h2 className="text-xl font-semibold mb-4">Reviews ({reviews.length})</h2>
          {reviews.length === 0 ? (
            <p className="text-gray-600">No reviews yet.</p>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="bg-white p-4 rounded-md shadow">
                  <div className="flex items-center mb-1">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon
                        key={`s-${r.id}-${i}`}
                        className={`h-4 w-4 ${i < r.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                      />
                    ))}
                    {r.client?.first_name && (
                      <span className="ml-2 text-sm text-gray-700">{r.client.first_name}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{r.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
