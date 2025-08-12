'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Control, Controller } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button, CollapsibleSection } from '../../ui';

import { EventDetails } from '@/contexts/BookingContext';
import { formatCurrency } from '@/lib/utils';
import { getDrivingMetrics } from '@/lib/travel';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
  serviceId?: number;
  artistLocation?: string | null;
  eventLocation?: string | undefined;
}

type SupplierCard = {
  serviceId: number;
  publicName: string;
  estimatedPrice?: number;
};

export default function SoundStep({
  control,
  open = true,
  onToggle = () => {},
  serviceId,
  artistLocation,
  eventLocation,
}: Props) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const [suppliers, setSuppliers] = useState<SupplierCard[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Load preferred suppliers for the city from the artist's service details
  useEffect(() => {
    const run = async () => {
      if (!serviceId || !eventLocation) return;
      setLoadingSuppliers(true);
      try {
        const svc = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/services/${serviceId}`,
          { cache: 'force-cache' },
        ).then((r) => r.json());
        const details = (svc && svc.details) || {};
        const prefs = (details.sound_provisioning?.city_preferences || []) as Array<{ city: string; provider_ids: number[] }>;
        const match = prefs.find((p) => (p.city || '').toLowerCase() === String(eventLocation).toLowerCase());
        const ids: number[] = (match?.provider_ids || (prefs[0]?.provider_ids || [])).slice(0, 3);
        const cards: SupplierCard[] = [];
        for (const pid of ids) {
          const s = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/services/${pid}`,
            { cache: 'force-cache' },
          ).then((r) => r.json());
          const publicName = s?.details?.publicName || s?.artist?.artist_profile?.business_name || s?.title || 'Sound Provider';
          // Pricing polish: base package + km_rate * driving distance from supplier base to event
          const basePackage = typeof s?.price === 'number' ? s.price : parseFloat(String(s?.price || 0));
          const kmRate = s?.details?.km_rate != null ? Number(s.details.km_rate) : undefined;
          const baseLocation = s?.details?.base_location as string | undefined;
          let estimatedPrice = basePackage || undefined;
          if (kmRate && baseLocation && eventLocation) {
            const metrics = await getDrivingMetrics(baseLocation, eventLocation);
            if (metrics.distanceKm > 0) {
              estimatedPrice = Math.max(0, (basePackage || 0) + kmRate * metrics.distanceKm);
            }
          }
          cards.push({ serviceId: pid, publicName, estimatedPrice });
        }
        setSuppliers(cards);
      } catch (e) {
        console.error('Failed to load preferred suppliers', e);
      } finally {
        setLoadingSuppliers(false);
      }
    };
    void run();
  }, [serviceId, eventLocation]);

  return (
    <CollapsibleSection
      title="Sound"
      description="Will sound equipment be needed?"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
      <p className="text-sm text-gray-600 mb-3">
        Secure the musician now. If you need sound, we’ll contact the artist’s preferred
        suppliers after booking to confirm a firm price. The sound amount shown here is an
        estimate and may change slightly once a supplier accepts.
      </p>
      <Controller<EventDetails, 'sound'>
        name="sound"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSheetOpen(true)}
                  className="w-full text-left min-h-[44px]"
                  ref={buttonRef}
                >
                  {field.value ? `Sound: ${field.value === 'yes' ? 'Yes' : 'No'}` : 'Select sound preference'}
                </Button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                  title="Select sound preference"
                >
                  <fieldset className="p-4 space-y-2">
                    {['yes', 'no'].map((opt, idx) => (
                      <div key={opt}>
                        <input
                          id={`sound-${opt}-mobile`}
                          ref={idx === 0 ? firstRadioRef : undefined}
                          type="radio"
                          className="selectable-card-input"
                          name={field.name}
                          value={opt}
                          checked={field.value === opt}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            setSheetOpen(false);
                          }}
                        />
                        <label htmlFor={`sound-${opt}-mobile`} className="selectable-card">
                          {opt === 'yes' ? 'Yes' : 'No'}
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="space-y-2 sm:flex sm:space-y-0 sm:gap-2">
                <div>
                  <input
                    id="sound-yes"
                    type="radio"
                    className="selectable-card-input"
                    name={field.name}
                    value="yes"
                    checked={field.value === 'yes'}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <label htmlFor="sound-yes" className="selectable-card">
                    Yes
                  </label>
                </div>
                <div>
                  <input
                    id="sound-no"
                    type="radio"
                    className="selectable-card-input"
                    name={field.name}
                    value="no"
                    checked={field.value === 'no'}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <label htmlFor="sound-no" className="selectable-card">
                    No
                  </label>
                </div>
              </fieldset>
            )}
          </>
        )}
      />
      {/* Supplier cards when sound is required */}
      <Controller<EventDetails, 'soundSupplierServiceId'>
        name="soundSupplierServiceId"
        control={control}
        render={({ field }) => (
          <>
            {loadingSuppliers && (
              <p className="text-sm text-gray-500 mt-2">Loading preferred suppliers…</p>
            )}
            {!loadingSuppliers && suppliers.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {suppliers.map((s, idx) => (
                  <div key={s.serviceId} className="relative">
                    <input
                      id={`supplier-${s.serviceId}`}
                      type="radio"
                      className="selectable-card-input"
                      name="selected-supplier"
                      value={s.serviceId}
                      checked={field.value === s.serviceId}
                      onChange={() => field.onChange(s.serviceId)}
                    />
                    <label htmlFor={`supplier-${s.serviceId}`} className="selectable-card flex-col items-start">
                      <span className="font-medium">{idx === 0 ? `Primary · ${s.publicName}` : s.publicName}</span>
                      <span className="text-sm text-gray-600">
                        {s.estimatedPrice ? `Est. ${formatCurrency(s.estimatedPrice)}` : 'Estimation pending'}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            {!loadingSuppliers && suppliers.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No preferred suppliers configured for this city. You can add sound later.</p>
            )}
            {suppliers.length > 0 && (
              <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                These suppliers are configured by the artist. We’ll reach out on your behalf
                after you secure the musician and confirm a firm price via the top match first.
              </div>
            )}
          </>
        )}
      />
    </CollapsibleSection>
  );
}
