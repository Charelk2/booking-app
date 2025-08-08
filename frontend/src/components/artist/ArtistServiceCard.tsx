import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { Service } from '@/types';
import { Button, Card } from '@/components/ui';
import { getService } from '@/lib/api';
import { formatCurrency, getFullImageUrl } from '@/lib/utils';

// Fetch the latest service data on mount so pricing and descriptions stay
// current without requiring a full page refresh.

interface ArtistServiceCardProps {
  service: Service;
  onBook: (service: Service) => void;
}

export default function ArtistServiceCard({ service, onBook }: ArtistServiceCardProps) {
  const [currentService, setCurrentService] = useState<Service>(service);

  // keep local copy in sync with parent prop
  useEffect(() => {
    setCurrentService(service);
  }, [service]);

  // fetch latest details on mount
  useEffect(() => {
    getService(service.id)
      .then((res) => setCurrentService(res.data))
      .catch((err) => {
        console.error('Failed to refresh service:', err);
      });
  }, [service.id]);

  const formatDuration = (minutes: number) => {
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return `${minutes} min`;
  };

  return (
    <Card role="listitem" className="p-4 border-none shadow-sm hover:shadow-sm">
      <div className="flex gap-4">
        {currentService.media_url && (
          <div className="relative w-35 h-35 flex-shrink-0 pr-4">
            <Image
              src={
                getFullImageUrl(currentService.media_url) || currentService.media_url
              }
              alt={currentService.title}
              fill
              unoptimized
              className="object-cover rounded-3xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFullImageUrl(
                  '/static/default-avatar.svg',
                ) as string;
              }}
            />
          </div>
        )}
        <div className="flex flex-col flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentService.title}
          </h3>
          <div className="mt-1 text-sm text-gray-600 flex flex-wrap items-center gap-x-2">
            <span className="text-base font-semibold text-gray-900">
              {formatCurrency(Number(currentService.price))}
            </span>
            <span>per guest</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(currentService.duration_minutes)}</span>
          </div>
          {currentService.description && (
            <p className="mt-1 text-sm text-gray-600">
              {currentService.description}
            </p>
          )}
          <div className="mt-2">
            <Button
              type="button"
              onClick={() => onBook(currentService)}
              fullWidth={false}
              title="The artist will respond with a quote"
            >
              Request Booking
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
