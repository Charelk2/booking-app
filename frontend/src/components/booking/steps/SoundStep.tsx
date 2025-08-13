'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Control, Controller } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button, CollapsibleSection } from '../../ui';

import { EventDetails, useBooking } from '@/contexts/BookingContext';
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
  estimateMin?: number;
  estimateMax?: number;
  reliability?: number;
  distanceKm?: number;
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
  const { details, setDetails, serviceId: ctxServiceId } = useBooking();
  const [backlineRequired, setBacklineRequired] = useState<boolean>(false);
  const [lightingEvening, setLightingEvening] = useState<boolean>(false);
  const [stageNeeded, setStageNeeded] = useState<boolean>(false);
  const [stageSize, setStageSize] = useState<string>('S');

  // Load and rank preferred suppliers for the city; compute estimate ranges (drive-only)
  useEffect(() => {
    const run = async () => {
      const sid = serviceId ?? ctxServiceId;
      if (!sid || !eventLocation) return;
      setLoadingSuppliers(true);
      try {
        const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const svc = await fetch(
          `${api}/api/v1/services/${sid}`,
          { cache: 'force-cache' },
        ).then((r) => r.json());
        const svcDetails = (svc && svc.details) || {};
        // Default sound mode from service configuration if not set
        let modeDefault = svcDetails?.sound_provisioning?.mode_default as string | undefined;
        if (modeDefault === 'external' || modeDefault === 'preferred_suppliers') modeDefault = 'supplier';
        if (!details?.soundMode && modeDefault && details.sound === 'yes') {
          setDetails({ ...details, soundMode: modeDefault as any });
        }
        // If no mode provided but we have preferences, default to supplier
        if (!details?.soundMode && details.sound === 'yes') {
          const tmpPrefs = svcDetails.sound_provisioning?.city_preferences;
          if (Array.isArray(tmpPrefs) && tmpPrefs.length > 0) {
            setDetails({ ...details, soundMode: 'supplier' });
          }
        }
        let prefs = (svcDetails.sound_provisioning?.city_preferences || []) as Array<{ city: string; provider_ids?: number[]; providerIds?: number[] }>;
        // Fallback: fetch via API if details missing
        if (!Array.isArray(prefs) || prefs.length === 0) {
          try {
            const pr = await fetch(`${api}/api/v1/services/${serviceId}/sound-preferences`, { cache: 'no-store' }).then((r) => r.json());
            if (Array.isArray(pr?.city_preferences)) {
              prefs = pr.city_preferences as any;
            }
          } catch {}
        }
        const locLower = String(eventLocation || '').toLowerCase();
        const locCityLower = locLower.split(',')[0]?.trim() || locLower;
        const findIds = (p: any): number[] => {
          const ids = (p?.provider_ids || p?.providerIds || []) as number[];
          return Array.isArray(ids) ? ids.map((x) => Number(x)).filter((x) => !Number.isNaN(x)) : [];
        };
        let match = prefs.find((p) => (p.city || '').toLowerCase() === locLower)
                 || prefs.find((p) => (p.city || '').toLowerCase() === locCityLower)
                 || prefs.find((p) => locLower.includes((p.city || '').toLowerCase()))
                 || prefs.find((p) => locCityLower.includes((p.city || '').toLowerCase()));
        let preferredIds: number[] = [];
        if (match) preferredIds = findIds(match);
        if (preferredIds.length === 0 && prefs.length > 0) {
          const all = prefs.flatMap((p) => findIds(p));
          preferredIds = Array.from(new Set(all));
        }
        preferredIds = preferredIds.slice(0, 3);
        // Build candidates with distances
        const candidates: { service_id: number; distance_km: number; publicName: string }[] = [];
        for (const pid of preferredIds) {
          const s = await fetch(`${api}/api/v1/services/${pid}`, { cache: 'force-cache' }).then((r) => r.json());
          const publicName = s?.details?.publicName || s?.artist?.artist_profile?.business_name || s?.title || 'Sound Provider';
          const baseLocation = s?.details?.base_location as string | undefined;
          let distance_km = 0;
          if (baseLocation && eventLocation) {
            const metrics = await getDrivingMetrics(baseLocation, eventLocation);
            distance_km = metrics.distanceKm || 0;
          }
          candidates.push({ service_id: pid, distance_km, publicName });
        }
        // Call batch estimate + rank (only if we have candidates)
        const guestCount = parseInt(details?.guests || '0', 10) || undefined;
        let cards: SupplierCard[] = [];
        if (candidates.length > 0) {
          const ranked: any[] = await fetch(`${api}/api/v1/pricebook/batch-estimate-rank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rider_spec: {},
              guest_count: guestCount,
              candidates: candidates.map((c) => ({ service_id: c.service_id, distance_km: c.distance_km })),
              preferred_ids: preferredIds,
              managed_by_artist: details.soundMode === 'managed_by_artist',
              artist_managed_markup_percent: 0,
              backline_required: backlineRequired,
              lighting_evening: lightingEvening,
              outdoor: (details.venueType === 'outdoor'),
              stage_size: stageNeeded ? stageSize : null,
            }),
          }).then((r) => r.json());
          if (Array.isArray(ranked) && ranked.length > 0) {
            cards = ranked.map((r: any) => {
              const c = candidates.find((x) => x.service_id === r.service_id);
              return {
                serviceId: r.service_id,
                publicName: c?.publicName || 'Sound Provider',
                estimateMin: Number(r.estimate_min),
                estimateMax: Number(r.estimate_max),
                reliability: r.reliability,
                distanceKm: r.distance_km,
              } as SupplierCard;
            });
          } else {
            // Fallback: show candidates without estimates
            cards = candidates.map((c) => ({
              serviceId: c.service_id,
              publicName: c.publicName,
              distanceKm: c.distance_km,
            }));
          }
        }
        setSuppliers(cards);

        // Compute provided-by-artist estimate from service details tiers if configured
        try {
          const tiers = svcDetails?.sound_provisioning?.provided_price_tiers as Array<{min?: number; max?: number; price: number}> | undefined;
          if (tiers && details.soundMode === 'provided_by_artist' && guestCount) {
            const sel = tiers.find((t) => (t.min == null || guestCount >= Number(t.min)) && (t.max == null || guestCount <= Number(t.max))) || tiers[tiers.length - 1];
            if (sel?.price != null) setDetails({ ...details, providedSoundEstimate: Number(sel.price) });
          }
        } catch {}
      } catch (e) {
        console.error('Failed to load preferred suppliers', e);
      } finally {
        setLoadingSuppliers(false);
      }
    };
    void run();
  }, [serviceId, eventLocation, details.soundMode]);

  return (
    <CollapsibleSection
      title="Sound"
      description="Will sound equipment be needed?"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
      <p className="text-sm text-gray-600 mb-3">
        Book in one step. The artist must accept to confirm your date. If you choose sound,
        we’ll contact the artist’s preferred suppliers (top match first) to confirm a firm price.
        Estimates below use drive‑only logistics and your guest count; final pricing may vary.
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
      {/* Mode determined by the artist's AddService configuration; no client choice here */}

      {/* Static banner for non-external modes */}
      {details.sound === 'yes' && details.soundMode === 'provided_by_artist' && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          Sound provided by the artist. {details.providedSoundEstimate != null ? `Est. ${formatCurrency(details.providedSoundEstimate)}.` : 'Final price will be confirmed on acceptance.'}
        </div>
      )}
      {details.sound === 'yes' && details.soundMode === 'managed_by_artist' && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          Sound managed by the artist. We’ll confirm a firm price with the top supplier and apply the artist’s markup policy.
        </div>
      )}

      {/* Supplier cards when sound is required and supplier path */}
      <Controller<EventDetails, 'soundSupplierServiceId'>
        name="soundSupplierServiceId"
        control={control}
        render={({ field }) => (
          <>
            {details.sound === 'yes' && details.soundMode !== 'supplier' && (
              <p className="text-sm text-gray-500 mt-2">No supplier selection needed for this option.</p>
            )}
            {details.sound === 'yes' && details.soundMode === 'supplier' && loadingSuppliers && (
              <p className="text-sm text-gray-500 mt-2">Loading preferred suppliers…</p>
            )}
      {details.sound === 'yes' && details.soundMode === 'supplier' && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={backlineRequired} onChange={(e) => setBacklineRequired(e.target.checked)} />
              Backline required
            </label>
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={lightingEvening} onChange={(e) => setLightingEvening(e.target.checked)} />
              Lighting (evening show)
            </label>
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={stageNeeded} onChange={(e) => setStageNeeded(e.target.checked)} />
              Stage needed
            </label>
            {stageNeeded && (
              <select className="mt-2 w-full border rounded p-2 text-sm" value={stageSize} onChange={(e) => setStageSize(e.target.value)}>
                <option value="S">Stage size S</option>
                <option value="M">Stage size M</option>
                <option value="L">Stage size L</option>
              </select>
            )}
            <p className="text-xs text-gray-500 mt-2">Guest count and indoor/outdoor are taken from earlier steps.</p>
          </div>
        </div>
      )}

      {details.sound === 'yes' && details.soundMode === 'supplier' && !loadingSuppliers && suppliers.length > 0 && (
        <div className="mt-4">
          <div className="selectable-card flex-col items-start">
            <span className="font-medium">Recommended · {suppliers[0].publicName}</span>
            <span className="text-sm text-gray-600">
              {suppliers[0].estimateMin != null && suppliers[0].estimateMax != null
                ? `Est. ${formatCurrency(suppliers[0].estimateMin)} – ${formatCurrency(suppliers[0].estimateMax)}`
                : 'Estimation pending'}
            </span>
            {suppliers[0].distanceKm != null && (
              <span className="text-xs text-gray-500">{suppliers[0].distanceKm!.toFixed(0)} km • rel {suppliers[0].reliability?.toFixed?.(1) ?? '0'}</span>
            )}
          </div>
        </div>
      )}
            {details.sound === 'yes' && details.soundMode === 'supplier' && !loadingSuppliers && suppliers.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">We’ll match a suitable sound supplier after you book. You can also add sound later.</p>
            )}
            {details.sound === 'yes' && details.soundMode === 'supplier' && suppliers.length > 0 && (
              <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                These suppliers are configured by the artist. We’ll reach out on your behalf
                after you secure the musician and confirm a firm price via the top match first.
              </div>
            )}
          </>
        )}
      />
      <div className="mt-3 text-xs text-gray-600">
        Final price is confirmed after acceptance; if the top pick declines we’ll auto‑try backups.
        If all decline, you can choose another option and we’ll refund any sound portion immediately.
      </div>
    </CollapsibleSection>
  );
}
