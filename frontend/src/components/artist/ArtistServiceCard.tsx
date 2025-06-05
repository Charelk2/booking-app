import { useState } from 'react';
import type { Service } from '@/types';

interface ArtistServiceCardProps {
  service: Service;
  onBook: (service: Service) => void;
}

export default function ArtistServiceCard({ service, onBook }: ArtistServiceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded((e) => !e);

  return (
    <div
      className="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={toggle}
      role="listitem"
    >
      <div className="flex justify-between items-center" aria-expanded={expanded}>
        <h3 className="text-lg font-semibold text-gray-900 pr-2">{service.title}</h3>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBook(service);
          }}
          className="ml-auto bg-indigo-600 text-white px-3 py-1 rounded-md text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-transform transform active:scale-95"
        >
          Book Now
        </button>
      </div>
      {expanded && (
        <div className="mt-2 text-sm text-gray-600" role="region">
          {service.description && <p className="mb-2">{service.description}</p>}
          <p className="text-sm text-gray-500">Type: {service.service_type}</p>
          <div className="mt-2 flex flex-wrap justify-between">
            <span className="text-lg font-bold text-gray-800">
              {Number(service.price).toFixed(2)}
            </span>
            <span className="text-sm text-gray-500">
              {service.duration_minutes} minutes
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
