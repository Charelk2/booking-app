import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { Service } from '@/types';
import { Button, Card } from '@/components/ui';
import { getService } from '@/lib/api';
import { formatCurrency, getFullImageUrl } from '@/lib/utils';

// This component was updated to fetch the latest service data whenever the card
// is expanded. It ensures pricing or descriptions changed on the server are
// reflected immediately without a full page refresh.

// Service details may change often. Fetch the latest data when expanded so
// displayed information always reflects server values.

interface ArtistServiceCardProps {
  service: Service;
  onBook: (service: Service) => void;
}

export default function ArtistServiceCard({ service, onBook }: ArtistServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentService, setCurrentService] = useState<Service>(service);

  // keep local copy in sync with parent prop
  useEffect(() => {
    setCurrentService(service);
  }, [service]);

  // fetch latest details when card is expanded
  useEffect(() => {
    if (!expanded) return;
    getService(service.id)
      .then((res) => setCurrentService(res.data))
      .catch((err) => {
        console.error('Failed to refresh service:', err);
      });
  }, [expanded, service.id]);

  const toggle = () => setExpanded((e) => !e);

  return (
    <Card
      onClick={toggle}
      role="listitem"
      className="p-4 cursor-pointer"
    >
      {service.media_url && (
        <div className="relative w-full h-48 mb-3">
          <Image
            src={getFullImageUrl(service.media_url) || service.media_url}
            alt={service.title}
            fill
            className="object-cover rounded-md"
          />
        </div>
      )}
      <div className="flex justify-between items-center" aria-expanded={expanded}>
        <h3 className="text-lg font-semibold text-gray-900 pr-2">{service.title}</h3>
        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBook(service);
          }}
          className="ml-auto"
          fullWidth={false}
          title="The artist will respond with a quote"
        >
          Request Booking
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 text-sm text-gray-600" role="region">
          {currentService.description && <p className="mb-2">{currentService.description}</p>}
          <p className="text-sm text-gray-500">Type: {currentService.service_type}</p>
          <div className="mt-2 flex items-center space-x-2">
            <span className="text-lg font-bold text-gray-800">
              {formatCurrency(Number(currentService.price))}
            </span>
            <span className="text-sm text-gray-500">
              {currentService.duration_minutes} minutes
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
