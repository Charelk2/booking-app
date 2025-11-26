'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { Service } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { getAllServices, getServiceProviderServices } from '@/lib/api';
import { Spinner } from '@/components/ui';

export default function ServicesPage() {
  const params = useSearchParams();
  const artistIdParam = params.get('artist');
  const artistId = artistIdParam ? Number(artistIdParam) : null;
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = artistId
          ? await getServiceProviderServices(artistId)
          : await getAllServices();
        setServices(res.data);
      } catch (err) {
        console.error('Failed to load services', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [artistId]);

  const filtered = services.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.artist?.location || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {artistId ? 'My Services' : 'Explore Services'}
        </h1>
        <input
          type="text"
          placeholder="Search by title or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded-md p-2 mb-6"
        />
        {loading ? (
          <div className="text-center"><Spinner /></div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.length > 0 ? (
              filtered.map((service) => (
                <div
                  key={service.id}
                  className="bg-white rounded-lg shadow-md p-6 flex flex-col"
                >
                  <h3 className="text-lg font-semibold">{service.title}</h3>
                  {service.artist && (
                    <p className="text-sm text-gray-500">
                      {service.artist.business_name ||
                        `${service.artist.user.first_name} ${service.artist.user.last_name}`}
                    </p>
                  )}
                  {service.description && (
                    <p className="mt-2 text-gray-600 flex-grow">
                      {service.description}
                    </p>
                  )}
                  <div className="mt-4 flex justify-between items-center">
                    <span className="font-bold">
                      {formatCurrency(Number(service.price))}
                    </span>
                    <span className="text-sm text-gray-500">
                      {(service as any).duration || (service as any)?.details?.duration_label || `${service.duration_minutes} min`}
                    </span>
                  </div>
                  <Link
                    href={`/service-providers/${service.service_provider?.slug || service.artist_id}`}
                    legacyBehavior
                    passHref
                  >
                    <a className="mt-4 inline-block bg-brand-dark text-white px-4 py-2 rounded-md text-center hover:bg-brand-dark">
                      View Service Provider
                    </a>
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-gray-600">No services match your search.</p>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
