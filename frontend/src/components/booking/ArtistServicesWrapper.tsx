// components/booking/ArtistServicesWrapper.tsx

'use client';

import React, { useState } from 'react';
import type { Service } from '@/types';
import ServiceProviderServiceCard from '../service-provider/ServiceProviderServiceCard';
import BookingWizard from './BookingWizard';

interface ArtistServicesWrapperProps {
  artistId: number;
  services: Service[];
}

export default function ArtistServicesWrapper({ artistId, services }: ArtistServicesWrapperProps) {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const handleBook = (service: Service) => {
    setSelectedService(service);
    setIsBookingOpen(true);
  };

  const handleClose = () => {
    setIsBookingOpen(false);
    setSelectedService(null);
  };

  return (
    <>
      <div className="space-y-4">
        {services.map((service) => (
          <ServiceProviderServiceCard key={service.id} service={service} onBook={handleBook} />
        ))}
      </div>

      {isBookingOpen && selectedService && (
  <BookingWizard
    isOpen={true}
    onClose={handleClose}
    artistId={artistId}
    serviceId={selectedService.id}
  />
)}
    </>
  );
}
