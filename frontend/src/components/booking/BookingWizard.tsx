'use client';

import React, { useEffect, useState, useRef, useCallback, startTransition } from 'react';
import { Dialog } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';

import { useBooking } from '@/contexts/BookingContext';
import type { EventDetails } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import useIsMobile from '@/hooks/useIsMobile';
import useBookingForm from '@/hooks/useBookingForm';
import useOfflineQueue from '@/hooks/useOfflineQueue';
import { useDebounce } from '@/hooks/useDebounce';
import { parseBookingText } from '@/lib/api';
import {
  getServiceProviderAvailability,
  createBookingRequest,
  updateBookingRequest,
  postMessageToBookingRequest,
  calculateQuote,
  estimatePriceSafe,
} from '@/lib/api';
import { calculateTravelMode, getDrivingMetricsCached, geocodeCached } from '@/lib/travel';
  import { trackEvent } from '@/lib/analytics';
  import { format } from 'date-fns';
  import { computeSoundServicePrice, type LineItem } from '@/lib/soundPricing';

import { BookingRequestCreate } from '@/types';
import './wizard/wizard.css';
import toast from '../ui/Toast';
// 404-aware service cache (tombstones)
const svcCache = new Map<number, any | null>();
type ServiceJson = any | null; // null = tombstone (missing)
async function fetchServiceCached(serviceId: number): Promise<ServiceJson> {
  const cached = svcCache.get(serviceId);
  if (cached !== undefined) return cached as ServiceJson;
  try {
    const resp = await fetch(`/api/v1/services/${serviceId}`, { cache: 'force-cache' });
    if (resp.status === 404) {
      svcCache.set(serviceId, null);
      return null;
    }
    if (!resp.ok) throw new Error(`Service ${serviceId} ${resp.status}`);
    const json = await resp.json();
    svcCache.set(serviceId, json);
    return json;
  } catch {
    svcCache.set(serviceId, null);
    return null;
  }
}

// --- Step Components ---
import {
  EventDescriptionStep,
  LocationStep,
  DateTimeStep,
  EventTypeStep,
  GuestsStep,
  VenueStep,
  SoundStep,
  NotesStep,
  ReviewStep,
} from './wizard/Steps';

// --- EventDetails Schema (uses context type at runtime only) ---

const schema = yup.object({
  eventType: yup.string().required('Event type is required.'),
  eventDescription: yup.string().required('Event description is required.').min(5, 'Description must be at least 5 characters.'),
  date: yup.date().required('Date is required.').min(new Date(), 'Date cannot be in the past.'),
  time: yup.string().optional(),
  location: yup.string().required('Location is required.'),
  locationName: yup.string().optional(),
  guests: yup.string().required('Number of guests is required.').matches(/^\d+$/, 'Guests must be a number.'),
  venueType: yup
    .mixed<'indoor' | 'outdoor' | 'hybrid'>()
    .oneOf(['indoor', 'outdoor', 'hybrid'], 'Venue type is required.')
    .required(),
  sound: yup.string().oneOf(['yes', 'no'], 'Sound equipment preference is required.').required(),
  // Optional sound-context fields (not required for basic validation)
  soundMode: yup
    .mixed<'supplier' | 'provided_by_artist' | 'managed_by_artist' | 'client_provided' | 'none'>()
    .optional(),
  soundSupplierServiceId: yup.number().optional(),
  stageRequired: yup.boolean().optional(),
  stageSize: yup.mixed<'S' | 'M' | 'L'>().optional(),
  lightingEvening: yup.boolean().optional(),
  backlineRequired: yup.boolean().optional(),
  providedSoundEstimate: yup.number().optional(),
  notes: yup.string().optional(),
  attachment_url: yup.string().optional(),
}) as yup.ObjectSchema<any>;

// --- Wizard Steps & Instructions ---
const steps = [
  'Event Details',
  'Location',
  'Date & Time',
  'Event Type',
  'Guests',
  'Venue Type',
  'Sound',
  'Notes',
  'Review',
];



// --- BookingWizard Props ---
interface BookingWizardProps {
  artistId: number;
  serviceId?: number; // Optional serviceId passed as a prop
  isOpen: boolean;
  onClose: () => void;
}

// --- Main BookingWizard Component ---
export default function BookingWizard({ artistId, serviceId, isOpen, onClose }: BookingWizardProps) {
  const router = useRouter();
  const {
    step,
    setStep,
    details,
    setDetails,
    requestId,
    setRequestId,
    setServiceId: setServiceIdInContext,
    travelResult,
    setTravelResult,
    loadSavedProgress,
    peekSavedProgress,
    applySavedProgress,
  } = useBooking();
  const { user } = useAuth();
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiText, setAiText] = useState('');
  const savedRef = useRef<any | null>(null);

  // Normalize rider spec from server into counts for pricing
  function normalizeRiderForPricing(spec: any): { units: Record<string, number>, backline: Record<string, number> } {
    const units = {
      vocal_mics: 0,
      speech_mics: 0,
      monitor_mixes: 0,
      iem_packs: 0,
      di_boxes: 0,
    } as Record<string, number>;
    const backline: Record<string, number> = {};
    if (!spec || typeof spec !== 'object') return { units, backline };
    try {
      if (spec.monitors != null) units.monitor_mixes = Number(spec.monitors) || 0;
      if (spec.di != null) units.di_boxes = Number(spec.di) || 0;
      if (spec.wireless != null) units.speech_mics = Number(spec.wireless) || 0;
      if (spec.mics && typeof spec.mics === 'object') {
        const dyn = Number(spec.mics.dynamic || 0);
        const cond = Number(spec.mics.condenser || 0);
        units.vocal_mics = Math.max(units.vocal_mics, dyn + cond);
      }
      if (spec.iem_packs != null) units.iem_packs = Number(spec.iem_packs) || 0;
      if (spec.monitoring && typeof spec.monitoring === 'object' && spec.monitoring.iem_packs != null) {
        units.iem_packs = Math.max(units.iem_packs, Number(spec.monitoring.iem_packs) || 0);
      }
      const arr: any[] = Array.isArray(spec.backline) ? spec.backline : [];
      const mapKey = (name: string): string | null => {
        const n = String(name || '').toLowerCase();
        if (n.includes('drum') && n.includes('full')) return 'drums_full';
        if (n.includes('drum')) return 'drum_shells';
        if (n.includes('guitar') && n.includes('amp')) return 'guitar_amp';
        if (n.includes('bass') && n.includes('amp')) return 'bass_amp';
        if (n.includes('keyboard') && n.includes('amp')) return 'keyboard_amp';
        if (n.includes('keyboard') && n.includes('stand')) return 'keyboard_stand';
        if (n.includes('digital') && n.includes('piano')) return 'piano_digital_88';
        if (n.includes('upright') && n.includes('piano')) return 'piano_acoustic_upright';
        if (n.includes('grand') && n.includes('piano')) return 'piano_acoustic_grand';
        if (n.includes('dj') && (n.includes('booth') || n.includes('table'))) return 'dj_booth';
        return null;
      };
      for (const item of arr) {
        const src = typeof item === 'string' ? item : item?.name || '';
        const k = mapKey(src);
        if (!k) continue;
        backline[k] = (backline[k] || 0) + 1;
      }
    } catch {}
    return { units, backline };
  }

  // --- Component States ---
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reviewDataError, setReviewDataError] = useState<string | null>(null);
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [baseServicePrice, setBaseServicePrice] = useState<number>(0); // New state for base service price
  const [servicePriceItems, setServicePriceItems] = useState<LineItem[] | null>(null);
  const [serviceCategorySlug, setServiceCategorySlug] = useState<string | undefined>(undefined);
  const [soundCost, setSoundCost] = useState(0);
  const [soundMode, setSoundMode] = useState<string | null>(null);
  const [soundModeOverridden, setSoundModeOverridden] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | undefined>(undefined);

  // Calculation orchestration to reduce flicker and duplicate runs
  const calcSeqRef = useRef(0);
  const activeCalcRef = useRef(0);
  const lastSigRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const missingPricebookRef = useRef<Set<number>>(new Set());
  const missingServiceRef = useRef<Set<number>>(new Set());

  const buildCalcSig = () => {
    const d: any = details || {};
    return JSON.stringify({
      serviceId,
      artistLocation,
      location: d.location,
      date: d.date ? new Date(d.date).toISOString().slice(0, 10) : null,
      sound: d.sound,
      soundMode: d.soundMode,
      supplierId: d.soundSupplierServiceId,
      guests: d.guests,
      venueType: d.venueType,
      stageRequired: d.stageRequired,
      stageSize: d.stageRequired ? d.stageSize : undefined,
      lightingEvening: d.lightingEvening,
      lightingUpgradeAdvanced: d.lightingUpgradeAdvanced,
      backlineRequired: d.backlineRequired,
    });
  };

  const { enqueue: enqueueBooking } = useOfflineQueue<{
    action: 'draft' | 'submit';
    payload: BookingRequestCreate;
    requestId?: number;
    message?: string;
  }>('offlineBookingQueue', async ({ action, payload, requestId: rid, message }) => {
    let id = rid;
    try {
      if (id) {
        await updateBookingRequest(id, payload);
      } else {
        const res = await createBookingRequest(payload);
        id = res.data.id;
        setRequestId(id);
      }
      if (action === 'submit' && id && message) {
        await postMessageToBookingRequest(id, {
          content: message,
          message_type: 'SYSTEM',
        });
        toast.success('Queued booking request submitted.');
      } else if (action === 'draft') {
        toast.success('Queued draft saved.');
      }
    } catch (err) {
      console.error('Queued booking request failed:', err);
      throw err;
    }
  });

  const isMobile = useIsMobile();
  // Convert zero-based step index to progress percentage for the mobile progress bar.
  const progressValue = ((step + 1) / steps.length) * 100;
  const hasLoaded = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // --- Form Hook (React Hook Form + Yup) ---
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    watch,
    errors, // Directly destructure errors, assuming useBookingForm returns it at top level
  } = useBookingForm(schema as any, details as any, setDetails as any);

  const watchedValues = watch();
  const debouncedValues = useDebounce(watchedValues, 300);
  const minDesc = 5;
  const descLen = (watchedValues?.eventDescription?.trim?.().length ?? 0);
  const descMeetsMin = descLen >= minDesc;
  const [showMinDescModal, setShowMinDescModal] = useState(false);
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);

  useEffect(() => {
    void trigger();
  }, [debouncedValues, trigger]);

  // --- Effects ---

  // Effect to manage step completion and focus heading on step change
  useEffect(() => {
    setMaxStepCompleted((prev) => Math.max(prev, step));
    setValidationError(null);
  }, [step]);

  // Ensure inputs have appropriate attributes and stay visible when focused
  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return;

    const setAttrs = (
      selector: string,
      attrs: Record<string, string>,
    ) => {
      const el = formEl.querySelector<HTMLElement>(selector);
      if (el) {
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      }
    };

    setAttrs('input[name="guests"]', {
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    setAttrs('input[name="location"]', {
      autocomplete: 'street-address',
    });
    setAttrs('input[name="date"]', {
      inputmode: 'numeric',
      autocomplete: 'bday',
    });
    setAttrs('input[name="time"]', {
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    setAttrs('textarea[name="eventDescription"]', {
      autocomplete: 'on',
    });

    const focusHandler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Scroll slightly after keyboard open
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
    formEl.addEventListener('focusin', focusHandler);
    return () => formEl.removeEventListener('focusin', focusHandler);
  }, [step]);

  // Effect to fetch artist availability and base location from API
  useEffect(() => {
    if (!artistId) return;
    const fetchArtistData = async () => {
      try {
        const [availabilityRes, artistRes] = await Promise.all([
          getServiceProviderAvailability(artistId),
          fetch(`/api/v1/service-provider-profiles/${artistId}`, { cache: 'force-cache' }).then((res) => res.json()),
        ]);
        setUnavailable(availabilityRes.data.unavailable_dates);
        setArtistLocation(artistRes.location || null);
      } catch (err) {
        console.error('Failed to fetch artist data:', err);
      }
    };
    void fetchArtistData();
  }, [artistId]);

  // Effect to prompt to restore saved progress only when the wizard first opens
  useEffect(() => {
    if (!isOpen || hasLoaded.current) return;
    // Peek for saved progress; show modal if meaningful, else offer AI assist
    try {
      const peek = peekSavedProgress?.();
      if (peek) {
        savedRef.current = peek;
        setShowResumeModal(true);
      } else {
        // Do not auto-open AI overlay to avoid blocking typing on the first step.
        // Users can still open AI assist manually from UI affordances elsewhere.
      }
    } catch {
      // fallback: previous behavior
      loadSavedProgress();
    }
    hasLoaded.current = true;
  }, [isOpen, loadSavedProgress, peekSavedProgress]);

  // Effect to set serviceId in the booking context if provided as a prop
  useEffect(() => {
    if (serviceId) setServiceIdInContext(serviceId);
  }, [serviceId, setServiceIdInContext]);

  // Resolve selected supplier name for Review step
  useEffect(() => {
    const sid = (details as any).soundSupplierServiceId as number | undefined;
    if (!sid) {
      setSelectedSupplierName(undefined);
      return;
    }
    const run = async () => {
      try {
        const svc = await fetchServiceCached(sid);
        if (!svc) { setSelectedSupplierName(undefined); return; }
        const publicName = svc?.details?.publicName || svc?.artist?.artist_profile?.business_name || svc?.title || undefined;
        setSelectedSupplierName(publicName);
      } catch (e) {
        console.error('Failed to fetch selected supplier', e);
        setSelectedSupplierName(undefined);
      }
    };
    void run();
  }, [details]);

  // Effect to calculate review data (price and travel mode) dynamically
  const calculateReviewData = useCallback(async () => {
    const sig = buildCalcSig();
    if (sig === lastSigRef.current && !reviewDataError) {
      return;
    }
    const calcId = ++calcSeqRef.current;
    activeCalcRef.current = calcId;

    if (!serviceId || !artistLocation || !details.location) {
      if (activeCalcRef.current === calcId) setIsLoadingReviewData(false);
      setReviewDataError("Missing booking details (Service ID, Service Provider Location, or Event Location) to calculate estimates.");
      if (activeCalcRef.current === calcId) {
        setCalculatedPrice(null);
        setTravelResult(null);
      }
      return;
    }

    if (!isLoadingRef.current) {
      setIsLoadingReviewData(true);
      isLoadingRef.current = true;
    }
    setReviewDataError(null);

    try {
      const [svcRes, artistPos, eventPos] = await Promise.all([
        serviceId ? fetchServiceCached(serviceId) : Promise.resolve(null),
        geocodeCached(artistLocation),
        geocodeCached(details.location),
      ]);

      if (!svcRes) {
        // Tombstone: remember and bail quietly without spamming the console
        if (activeCalcRef.current === calcId) setIsLoadingReviewData(false);
        setReviewDataError('Selected service is unavailable.');
        setCalculatedPrice(null);
        setServicePriceItems(null);
        setTravelResult(null);
        return;
      }

      if (!artistPos) {
        throw new Error(`Could not find geographic coordinates for artist's base location: "${artistLocation}".`);
      }
      if (!eventPos) {
        throw new Error(`Could not find geographic coordinates for event location: "${details.location}".`);
      }

      // Helper to safely parse numeric fields that may arrive as formatted strings
      const parseNumber = (val: unknown, fallback = 0): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const cleaned = val.replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          return Number.isNaN(parsed) ? fallback : parsed;
        }
        return fallback;
      };

      const parseOptionalNumber = (val: unknown): number | undefined => {
        if (val === null || val === undefined || val === '') return undefined;
        if (typeof val === 'number') {
          return Number.isNaN(val) ? undefined : val;
        }
        if (typeof val === 'string') {
          const cleaned = val.replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          return Number.isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
      };

      // Determine service category (e.g., 'sound_service')
      const svcCategorySlug: string | undefined = (svcRes?.service_category_slug || svcRes?.service_category?.slug || svcRes?.service_category?.name || '') as string;
      setServiceCategorySlug(svcCategorySlug);

      // If this is a Sound Service with audience packages, compute audience base + add-ons
      let basePrice = parseNumber(svcRes.price);
      let priceItems: LineItem[] | null = null;
      const isSoundService = typeof svcCategorySlug === 'string' && svcCategorySlug.toLowerCase().includes('sound');
      const hasAudiencePkgs = Array.isArray(svcRes?.details?.audience_packages) && svcRes.details.audience_packages.length > 0;
      if (isSoundService && hasAudiencePkgs) {
        const guestCount = parseInt((details as any).guests || '0', 10) || undefined;
        const venueType = (details as any).venueType as any;
        const stageRequired = !!(details as any).stageRequired;
        const stageSize = stageRequired ? ((details as any).stageSize || 'S') : undefined;
        const lightingEvening = !!(details as any).lightingEvening;
        const res = computeSoundServicePrice({
          details: svcRes.details,
          guestCount,
          venueType,
          stageRequired,
          stageSize,
          lightingEvening,
          upgradeLightingAdvanced: !!(details as any).lightingUpgradeAdvanced,
        });
        if ((res.total || 0) > 0) {
          basePrice = res.total;
          priceItems = res.items;
        }
      }
      setBaseServicePrice(basePrice);
      setServicePriceItems(priceItems);

      const travelRate = parseNumber(svcRes.travel_rate, 2.5) || 2.5;
      const numTravelMembers = parseNumber(svcRes.travel_members, 1) || 1;
      const carRentalPrice = parseOptionalNumber(svcRes.car_rental_price);
      const flightPrice = parseOptionalNumber(svcRes.flight_price);

      // Distance will be computed server-side; keep a rough client drive cost for UX while waiting
      const drivingEstimateCost = 0;

      let quote: Awaited<ReturnType<typeof calculateQuote>> | null = null;
      const isSoundServiceCategory = (svcCategorySlug || '').toLowerCase().includes('sound');
      if (!isSoundServiceCategory && details.sound === 'yes') {
        // Base calculation (travel + etc.)
        // Resolve a supplier candidate if none selected (consider availability)
        let selectedIdForCalc: number | undefined = (details as any).soundSupplierServiceId as number | undefined;
        try {
          if (!selectedIdForCalc && details.location) {
            const sp = svcRes?.details?.sound_provisioning || {};
            let prefs: any[] = Array.isArray(sp.city_preferences) ? sp.city_preferences : [];
            if (!prefs.length) {
              try { const pr = await fetch(`/api/v1/services/${serviceId}/sound-preferences`, { cache: 'no-store' }).then((r) => r.json()); if (Array.isArray(pr?.city_preferences)) prefs = pr.city_preferences; } catch {}
            }
            const locLower = String(details.location || '').toLowerCase();
            const locCityLower = locLower.split(',')[0]?.trim() || locLower;
            const findIds = (p: any): number[] => (Array.isArray(p?.provider_ids) ? p.provider_ids : p?.providerIds || []).map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
            const match = prefs.find((p: any) => (p.city || '').toLowerCase() === locLower)
              || prefs.find((p: any) => (p.city || '').toLowerCase() === locCityLower)
              || prefs.find((p: any) => locLower.includes((p.city || '').toLowerCase()))
              || prefs.find((p: any) => locCityLower.includes((p.city || '').toLowerCase()));
            let preferredIds: number[] = match ? findIds(match) : [];
            if (!preferredIds.length && prefs.length) preferredIds = Array.from(new Set(prefs.flatMap(findIds)));
            preferredIds = preferredIds.slice(0, 3);
            const candidates: { service_id: number; provider_id?: number; distance_km: number; available: boolean }[] = [];
            const eventDateStr = (() => { const dd = (details as any)?.date; if (!dd) return null; try { const dt = typeof dd === 'string' ? new Date(dd) : dd; return dt.toISOString().slice(0,10); } catch { return null; } })();
            for (const pid of preferredIds) {
              try {
                const s = await fetchServiceCached(pid);
                if (!s) continue;
                if (s?.has_pricebook === false) continue;
                const baseLocation = s?.details?.base_location as string | undefined;
                let distance_km = 0;
                if (baseLocation && details.location) { try { const m = await getDrivingMetricsCached(baseLocation, details.location); distance_km = m.distanceKm || 0; } catch {} }
                let available = true;
                try { const providerId = Number(s?.artist?.id || s?.service_provider?.id || s?.service_provider_id); if (providerId && eventDateStr) { const av = await getServiceProviderAvailability(providerId); const unavailable = (av?.data?.unavailable_dates || []) as string[]; available = !unavailable.includes(eventDateStr); } } catch {}
                candidates.push({ service_id: pid, provider_id: Number(s?.artist?.id || s?.service_provider?.id || s?.service_provider_id) || undefined, distance_km, available });
              } catch {}
            }
            if (candidates.length) {
              const ranked: any[] = await fetch(`/api/v1/pricebook/batch-estimate-rank`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  rider_spec: {
                    guest_count: parseInt((details as any).guests || '0', 10) || undefined,
                    venue_type: (details as any).venueType,
                    stage_required: !!(details as any).stageRequired,
                    stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : null,
                    lighting_evening: !!(details as any).lightingEvening,
                    backline_required: !!(details as any).backlineRequired,
                  },
                  candidates: candidates.map(c => ({ service_id: c.service_id, distance_km: c.distance_km })),
                  preferred_ids: candidates.map(c => c.service_id),
                  managed_by_artist: false,
                  artist_managed_markup_percent: 0,
                  outdoor: (details as any).venueType === 'outdoor',
                }),
              }).then(r => r.ok ? r.json() : []);
              const orderedIds: number[] = Array.isArray(ranked) && ranked.length ? ranked.map((r:any)=>Number(r.service_id)).filter((x:number)=>Number.isFinite(x)) : candidates.map(c=>c.service_id);
              const firstAvailable = orderedIds.find(id => candidates.find(c => c.service_id===id && c.available !== false));
              selectedIdForCalc = firstAvailable ?? orderedIds[0];
            }
          }
        } catch {}

        // Pre-compute supplier distance if a supplier is selected (for backend pricebook travel)
        let supplierDistanceKm: number | undefined = undefined;
        // Normalize rider units/backline from the artist's rider to pass server-side
        let riderUnitsForServer: { vocal_mics?: number; speech_mics?: number; monitor_mixes?: number; iem_packs?: number; di_boxes?: number } | undefined;
        let backlineRequestedForServer: Record<string, number> | undefined;
        try {
          const selId = ((details as any).soundSupplierServiceId as number | undefined) || selectedIdForCalc;
          if (selId && details.location) {
            const svcSel = await fetchServiceCached(selId);
            const baseLoc = (svcSel?.details?.base_location) as string | undefined;
            if (baseLoc) {
              try {
                const m = await getDrivingMetricsCached(baseLoc, details.location);
                supplierDistanceKm = (m?.distanceKm || 0) * 2; // round-trip
              } catch {}
            }
          }
          // Fetch and normalize the musician's rider once to provide unit/backline context
          try {
            const rider = await fetch(`/api/v1/services/${serviceId}/rider`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
            const norm = normalizeRiderForPricing(rider?.spec);
            riderUnitsForServer = norm.units;
            backlineRequestedForServer = (details as any).backlineRequired ? norm.backline : {};
          } catch {}
        } catch {}

        quote = await calculateQuote({
          base_fee: basePrice,
          // distance_km omitted: backend computes it from artist base → event city
          service_id: serviceId,
          event_city: details.location,
          guest_count: parseInt((details as any).guests || '0', 10) || undefined,
          venue_type: (details as any).venueType,
          stage_required: !!(details as any).stageRequired,
          stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : undefined,
          lighting_evening: !!(details as any).lightingEvening,
          backline_required: !!(details as any).backlineRequired,
          upgrade_lighting_advanced: !!(details as any).lightingUpgradeAdvanced,
          selected_sound_service_id: (details as any).soundSupplierServiceId || selectedIdForCalc,
          supplier_distance_km: supplierDistanceKm,
          rider_units: riderUnitsForServer,
          backline_requested: backlineRequestedForServer,
        } as any);
        setCalculatedPrice(Number(quote.total));

        // Prefer server-computed sound_cost; fallback to local audience/pricebook estimate if missing
        const soundModePref = (details as any).soundMode;
        let sc = Number(quote.sound_cost);
        const guestCount = parseInt((details as any).guests || '0', 10) || undefined;
        const venueType = (details as any).venueType;

        // Local fallback: supplier audience-tier pricing if supplier mode is selected or musician config is external providers
        let scFromAudience = 0;
        try {
          const spConf = svcRes?.details?.sound_provisioning || {};
          const confExternal = (spConf.mode === 'external_providers' || spConf.mode === 'external' || spConf.mode_default === 'external_providers');
          if (soundModePref === 'supplier' || confExternal) {
            // Determine selected supplier or pick a preferred candidate
            const selectedId = (details as any).soundSupplierServiceId as number | undefined;
            let normalizedRider = { units: { vocal_mics: 0, speech_mics: 0, monitor_mixes: 0, iem_packs: 0, di_boxes: 0 }, backline: {} as Record<string, number> };
            try {
              const rider = await fetch(`/api/v1/services/${serviceId}/rider`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
              normalizedRider = normalizeRiderForPricing(rider?.spec);
            } catch {}
            if (selectedId) {
              // Preferred: pricebook estimate first (includes travel); then fallback to sound-estimate or local compute
              let estimatedViaPB = false;
              try {
                const svcSel = await fetchServiceCached(selectedId);
                const baseLoc = (svcSel?.details?.base_location) as string | undefined;
                let distanceKm = 0;
                if (baseLoc && details.location) {
                  try {
                    const m = await getDrivingMetricsCached(baseLoc, details.location);
                    distanceKm = (m?.distanceKm || 0) * 2; // round-trip
                  } catch {}
                }
                const rider_spec = {
                  monitors: Number(normalizedRider.units.monitor_mixes || 0),
                  wireless: Number(normalizedRider.units.speech_mics || 0),
                  di: Number(normalizedRider.units.di_boxes || 0),
                };
                if (svcSel?.has_pricebook) {
                const estPB = await estimatePriceSafe(selectedId, {
                  rider_spec,
                  distance_km: distanceKm,
                  managed_by_artist: false,
                  artist_managed_markup_percent: 0,
                  guest_count: guestCount,
                  backline_required: !!(details as any).backlineRequired,
                  lighting_evening: !!(details as any).lightingEvening,
                  outdoor: venueType === 'outdoor',
                  stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : null,
                });
                if (estPB && estPB.estimate_min != null && estPB.estimate_max != null) {
                  const min = Number(estPB.estimate_min);
                  const max = Number(estPB.estimate_max);
                  if (Number.isFinite(min) && Number.isFinite(max)) {
                    scFromAudience = (min + max) / 2;
                    estimatedViaPB = true;
                  }
                } else if ((estPB as any)?.pricebook_missing) {
                  missingPricebookRef.current.add(selectedId);
                }
                }
              } catch {}

              if (!Number.isFinite(scFromAudience) || scFromAudience <= 0) {
                try {
                  if (!missingServiceRef.current.has(selectedId)) {
                    const resp = await fetch(`/api/v1/services/${selectedId}/sound-estimate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        guest_count: guestCount,
                        venue_type: venueType,
                        stage_required: !!(details as any).stageRequired,
                        stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : null,
                        lighting_evening: !!(details as any).lightingEvening,
                        upgrade_lighting_advanced: !!(details as any).lightingUpgradeAdvanced,
                        rider_units: normalizedRider.units,
                        backline_requested: (details as any).backlineRequired ? normalizedRider.backline : {},
                      }),
                    });
                    if (resp.ok) {
                      const est = await resp.json();
                      const t = Number(est?.total);
                      if (Number.isFinite(t) && t > 0) scFromAudience = t;
                    } else if (resp.status === 404) {
                      missingServiceRef.current.add(selectedId);
                    }
                  }
                } catch {
                  // Final fallback: compute locally from supplier details
                  try {
                    const psvc = await fetchServiceCached(selectedId);
                    const comp = computeSoundServicePrice({
                      details: psvc?.details,
                      guestCount,
                      venueType,
                      stageRequired: !!(details as any).stageRequired,
                      stageSize: (details as any).stageRequired ? ((details as any).stageSize || 'S') : undefined,
                      lightingEvening: !!(details as any).lightingEvening,
                      upgradeLightingAdvanced: !!(details as any).lightingUpgradeAdvanced,
                      riderUnits: normalizedRider.units,
                      backlineRequested: (details as any).backlineRequired ? normalizedRider.backline : {},
                    });
                    scFromAudience = Number(comp.total) || 0;
                  } catch {}
                }
              }
            } else if (details.location) {
              const sp = svcRes?.details?.sound_provisioning || {};
              let prefs: any[] = Array.isArray(sp.city_preferences) ? sp.city_preferences : [];
              if (!prefs.length) {
                try {
                  const pr = await fetch(`/api/v1/services/${serviceId}/sound-preferences`, { cache: 'no-store' }).then((r) => r.json());
                  if (Array.isArray(pr?.city_preferences)) prefs = pr.city_preferences;
                } catch {}
              }
              const locLower = String(details.location || '').toLowerCase();
              const locCityLower = locLower.split(',')[0]?.trim() || locLower;
              const findIds = (p: any): number[] => (Array.isArray(p?.provider_ids) ? p.provider_ids : p?.providerIds || [])
                .map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
              const match = prefs.find((p: any) => (p.city || '').toLowerCase() === locLower)
                || prefs.find((p: any) => (p.city || '').toLowerCase() === locCityLower)
                || prefs.find((p: any) => locLower.includes((p.city || '').toLowerCase()))
                || prefs.find((p: any) => locCityLower.includes((p.city || '').toLowerCase()));
              let preferredIds: number[] = match ? findIds(match) : [];
              if (!preferredIds.length && prefs.length) preferredIds = Array.from(new Set(prefs.flatMap(findIds)));
              const tryIds = preferredIds.slice(0, 3);
              for (const pid of tryIds) {
                try {
                  if (missingServiceRef.current.has(pid)) continue;
                  const resp = await fetch(`/api/v1/services/${pid}/sound-estimate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      guest_count: guestCount,
                      venue_type: venueType,
                      stage_required: !!(details as any).stageRequired,
                      stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : null,
                      lighting_evening: !!(details as any).lightingEvening,
                      upgrade_lighting_advanced: !!(details as any).lightingUpgradeAdvanced,
                      rider_units: normalizedRider.units,
                      backline_requested: (details as any).backlineRequired ? normalizedRider.backline : {},
                    }),
                  });
                  if (resp.ok) {
                    const est = await resp.json();
                    const t = Number(est?.total);
                    if (Number.isFinite(t) && t > 0) { scFromAudience = t; break; }
                  } else if (resp.status === 404) {
                    missingServiceRef.current.add(pid);
                  }
                } catch {}
              }

              // Avoid catalog-wide scan to reduce network churn and 404 noise
            }
          }
        } catch {}

        if (Number.isFinite(scFromAudience) && scFromAudience > 0) {
          sc = scFromAudience;
        } else if (!Number.isFinite(sc) || sc <= 0) {
          // Last resort fallback: estimate via pricebook ranking midpoint if available
          try {
            if (soundModePref === 'supplier' && details.location) {
              const sp = svcRes?.details?.sound_provisioning || {};
              let prefs: any[] = Array.isArray(sp.city_preferences) ? sp.city_preferences : [];
              if (!prefs.length) {
                try {
                  const pr = await fetch(`/api/v1/services/${serviceId}/sound-preferences`, { cache: 'no-store' }).then((r) => r.json());
                  if (Array.isArray(pr?.city_preferences)) prefs = pr.city_preferences;
                } catch {}
              }
              const locLower = String(details.location || '').toLowerCase();
              const locCityLower = locLower.split(',')[0]?.trim() || locLower;
              const findIds = (p: any): number[] => (Array.isArray(p?.provider_ids) ? p.provider_ids : p?.providerIds || [])
                .map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
              const match = prefs.find((p: any) => (p.city || '').toLowerCase() === locLower)
                || prefs.find((p: any) => (p.city || '').toLowerCase() === locCityLower)
                || prefs.find((p: any) => locLower.includes((p.city || '').toLowerCase()))
                || prefs.find((p: any) => locCityLower.includes((p.city || '').toLowerCase()));
              let preferredIds: number[] = match ? findIds(match) : [];
              if (!preferredIds.length && prefs.length) preferredIds = Array.from(new Set(prefs.flatMap(findIds)));
              preferredIds = preferredIds.slice(0, 3);
              const candidates: { service_id: number; distance_km: number }[] = [];
              for (const pid of preferredIds) {
                let distance_km = 0;
                try {
                  const s = await fetchServiceCached(pid);
                  if (!s || s?.has_pricebook === false) { continue; }
                  const baseLoc = s?.details?.base_location as string | undefined;
                  if (baseLoc) {
                    const m = await getDrivingMetricsCached(baseLoc, details.location);
                    distance_km = m.distanceKm || 0;
                  }
                } catch {}
                candidates.push({ service_id: pid, distance_km });
              }
              if (candidates.length) {
                const ranked: any[] = await fetch(`/api/v1/pricebook/batch-estimate-rank`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    rider_spec: {
                      guest_count: guestCount,
                      venue_type: venueType,
                      stage_required: !!(details as any).stageRequired,
                      stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : null,
                      lighting_evening: !!(details as any).lightingEvening,
                      backline_required: !!(details as any).backlineRequired,
                    },
                    candidates,
                    preferred_ids: candidates.map((c) => c.service_id),
                    managed_by_artist: false,
                    artist_managed_markup_percent: 0,
                    outdoor: venueType === 'outdoor',
                  }),
                }).then((r) => r.json());
                if (Array.isArray(ranked) && ranked[0]) {
                  const min = Number(ranked[0].estimate_min);
                  const max = Number(ranked[0].estimate_max);
                  if (Number.isFinite(min) && Number.isFinite(max)) sc = (min + max) / 2;
                  else if (Number.isFinite(min)) sc = min;
                }
              }
            }
          } catch {}
        }
        // Fallback to audience/pricebook-derived estimate when server did not provide a value
        if ((!Number.isFinite(sc) || sc <= 0) && Number.isFinite(scFromAudience) && scFromAudience > 0) {
          sc = scFromAudience;
        }
        setSoundCost(Number(sc) || 0);
        setSoundMode(quote.sound_mode);
        setSoundModeOverridden(quote.sound_mode_overridden);
      } else {
        // Still compute travel (and totals) on the server even if no external sound
        try {
          const quote2 = await calculateQuote({
            base_fee: basePrice,
            // Omit distance_km; backend resolves from artist base → event city
            service_id: serviceId,
            event_city: details.location,
          } as any);
          setCalculatedPrice(Number(quote2.total));
          setSoundCost(0);
          setSoundMode(null);
          setSoundModeOverridden(false);
          // Map server travel to UI shape
          try {
            const tm2 = (quote2?.travel_mode || '').toLowerCase();
            const estimates2 = Array.isArray((quote2 as any)?.travel_estimates) ? (quote2 as any).travel_estimates : [];
            const driveRow2 = estimates2.find((e: any) => (e?.mode || '').toLowerCase().includes('driv'));
            const travelRes2 = {
              mode: tm2 === 'flight' ? 'fly' : 'drive',
              totalCost: Number(quote2?.travel_cost || 0),
              breakdown: {
                drive: { estimate: Number(driveRow2?.cost || (tm2 === 'flight' ? 0 : (quote2?.travel_cost || 0))) },
                fly: { perPerson: 0, travellers: numTravelMembers, flightSubtotal: 0, carRental: Number(carRentalPrice || 0), localTransferKm: 0, departureTransferKm: 0, transferCost: 0, total: tm2 === 'flight' ? Number(quote2?.travel_cost || 0) : 0 },
              },
            } as any;
            setTravelResult(travelRes2);
          } catch {
            setTravelResult({ mode: 'drive', totalCost: Number(quote2?.travel_cost || 0), breakdown: { drive: { estimate: Number(quote2?.travel_cost || 0) }, fly: { perPerson: 0, travellers: numTravelMembers, flightSubtotal: 0, carRental: 0, localTransferKm: 0, departureTransferKm: 0, transferCost: 0, total: 0 } } } as any);
          }
        } catch {
          setCalculatedPrice(basePrice);
          setSoundCost(0);
          setSoundMode(null);
          setSoundModeOverridden(false);
        }
      }

      // Map server travel data into the UI shape
      try {
        const tm = (quote?.travel_mode || '').toLowerCase();
        const estimates = Array.isArray((quote as any)?.travel_estimates) ? (quote as any).travel_estimates : [];
        const driveRow = estimates.find((e: any) => (e?.mode || '').toLowerCase().includes('driv'));
        const travelResult = {
          mode: tm === 'flight' ? 'fly' : 'drive',
          totalCost: Number(quote?.travel_cost || 0),
          breakdown: {
            drive: { estimate: Number(driveRow?.cost || (tm === 'flight' ? 0 : (quote?.travel_cost || 0))) },
            fly: {
              perPerson: 0,
              travellers: numTravelMembers,
              flightSubtotal: 0,
              carRental: Number(carRentalPrice || 0),
              localTransferKm: 0,
              departureTransferKm: 0,
              transferCost: 0,
              total: tm === 'flight' ? Number(quote?.travel_cost || 0) : 0,
            },
          },
        } as any;
        setTravelResult(travelResult);
      } catch {
        setTravelResult({ mode: 'drive', totalCost: Number(quote?.travel_cost || 0), breakdown: { drive: { estimate: Number(quote?.travel_cost || 0) }, fly: { perPerson: 0, travellers: numTravelMembers, flightSubtotal: 0, carRental: 0, localTransferKm: 0, departureTransferKm: 0, transferCost: 0, total: 0 } } } as any);
      }

    } catch (err) {
      console.error('Failed to calculate booking estimates:', err);
      setReviewDataError('Failed to calculate booking estimates. Please ensure location details are accurate and try again.');
      setCalculatedPrice(null);
      setTravelResult(null);
    } finally {
      if (activeCalcRef.current === calcId) {
        lastSigRef.current = sig;
        setIsLoadingReviewData(false);
        isLoadingRef.current = false;
      }
    }
  }, [
    // IDs and locations
    serviceId,
    artistLocation,
    details.location,
    details.date,
    // Sound flags and selections
    details.sound,
    (details as any).soundMode,
    (details as any).soundSupplierServiceId,
    // Context that changes sound sizing and pricing
    (details as any).guests,
    (details as any).venueType,
    (details as any).stageRequired,
    (details as any).stageSize,
    (details as any).lightingEvening,
    (details as any).lightingUpgradeAdvanced,
    (details as any).backlineRequired,
    // Setter from context (stable but included for correctness)
    setTravelResult,
    reviewDataError,
  ]);

  // Trigger the calculation when approaching the Review step to prefetch data
  const hasPrefetched = useRef(false);
  const soundPrefetchStarted = useRef(false);
  useEffect(() => {
    if (step >= steps.length - 2 && !hasPrefetched.current) {
      hasPrefetched.current = true;
      void calculateReviewData();
    }
  }, [step, calculateReviewData]);

  // Prefetch review bundle as soon as Sound step is reached with required inputs
  useEffect(() => {
    const s = (details as any)?.sound;
    const hasLoc = !!(details as any)?.location;
    const soundIdx = steps.indexOf('Sound');
    if (isOpen && step >= soundIdx && s && hasLoc && !soundPrefetchStarted.current) {
      soundPrefetchStarted.current = true;
      startTransition(() => { void calculateReviewData(); });
    }
  }, [isOpen, step, details, calculateReviewData]);

  // Keep pricing fresh as the user configures Sound and later steps, so the
  // Review totals are ready immediately on arrival. Debounce via watchedValues.
  useEffect(() => {
    // Only start eager calculation once the user reached the Sound step or later
    if (step < 6) return;
    // Require minimum inputs to avoid noisy errors
    if (!serviceId || !artistLocation || !(details as any)?.location) return;
    // Recalculate in the background with debounced values
    void calculateReviewData();
  }, [
    step,
    serviceId,
    artistLocation,
    // Debounced form values ensure we don't thrash calls while typing
    debouncedValues.location,
    debouncedValues.date,
    debouncedValues.sound,
    (debouncedValues as any).soundMode,
    (debouncedValues as any).soundSupplierServiceId,
    (debouncedValues as any).guests,
    (debouncedValues as any).venueType,
    (debouncedValues as any).stageRequired,
    (debouncedValues as any).stageSize,
    (debouncedValues as any).lightingEvening,
    (debouncedValues as any).lightingUpgradeAdvanced,
    (debouncedValues as any).backlineRequired,
    calculateReviewData,
  ]);

  // Recalculate when the user edits location, date, or sound preference on the Review step
  useEffect(() => {
    if (step === steps.length - 1) {
      void calculateReviewData();
    }
  }, [
    details.location,
    details.date,
    details.sound,
    (details as any).soundMode,
    (details as any).soundSupplierServiceId,
    (details as any).guests,
    (details as any).venueType,
    (details as any).stageRequired,
    (details as any).stageSize,
    (details as any).lightingEvening,
    (details as any).lightingUpgradeAdvanced,
    (details as any).backlineRequired,
    step,
    calculateReviewData,
  ]);

  // --- Navigation & Submission Handlers ---

  // Handles 'Enter' key press for navigation/submission
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || isMobile) return;
    e.preventDefault();
    if (step < steps.length - 1) {
      void next();
    } else {
      // For the review step, the submit is handled by the ReviewStep component's internal button
      // No action needed here for Enter key on the final step
    }
  };

  // Navigates to the next step after validation
  const next = async () => {
    // Guard for step 0: require minimum description length, show modal instead of inline error
    if (step === 0 && !descMeetsMin) {
      setShowMinDescModal(true);
      return;
    }
    // Guard for step 2 (Date): prevent selecting unavailable dates (especially on mobile native pickers)
    if (step === 2) {
      const d = (details as any)?.date as Date | string | undefined;
      if (d) {
        const dt = typeof d === 'string' ? new Date(d) : d;
        const day = format(dt, 'yyyy-MM-dd');
        if (unavailable.includes(day)) {
          setShowUnavailableModal(true);
          return;
        }
      }
    }
    const stepFields: (keyof EventDetails)[][] = [
      ['eventDescription'],
      ['location'],
      ['date'],
      ['eventType'],
      ['guests'],
      ['venueType'],
      ['sound'],
      [],
      [], // Review step has no fields to validate for "next"
    ];
    const fieldsToValidate = stepFields[step] as (keyof EventDetails)[];
    const valid = fieldsToValidate.length > 0 ? await trigger(fieldsToValidate as any) : true;

    if (valid) {
      // Auto-parse and apply event details on advancing from the first step
      if (step === 0) {
        const desc = (details as any).eventDescription as string | undefined;
        if (desc && desc.trim().length >= 5) {
          try {
            const res = await parseBookingText(desc);
            const { event_type, date, location, guests } = res.data || {};
            if (date) setValue('date', new Date(date));
            if (location) setValue('location', location);
            if (guests !== undefined && guests !== null) setValue('guests', String(guests));
            if (event_type) setValue('eventType', event_type);
          } catch (err) {
            // Non-blocking; proceed even if AI parse fails
            console.warn('AI parse failed; continuing without suggestions', err);
          }
        }
      }
      const newStep = step + 1;
      setStep(newStep);
      setMaxStepCompleted(Math.max(maxStepCompleted, newStep));
      setValidationError(null);
      trackEvent('booking_wizard_next', { step: newStep });
    } else {
      // Keep inline errors off for cleaner UX; specific modals/toasts should guide users per step
      setValidationError(null);
    }
  };

  // Navigates to the previous step
  const prev = () => {
    setStep(step - 1);
    setValidationError(null);
  };

  const handleBack = () => {
    trackEvent(step === 0 ? 'booking_wizard_cancel' : 'booking_wizard_back', {
      step,
    });
    if (step === 0) onClose();
    else prev();
  };

  // Handles saving the booking request as a draft
  const saveDraft = handleSubmit(async (vals: EventDetails) => {
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'draft',
      travel_mode: travelResult?.mode,
      travel_cost: travelResult?.totalCost,
      travel_breakdown: {
        ...(travelResult?.breakdown || {}),
        venue_name: vals.locationName,
        sound_required: vals.sound === 'yes',
        sound_mode: (details as any).soundMode,
        selected_sound_service_id: (details as any).soundSupplierServiceId,
        event_city: details.location,
        provided_sound_estimate: (details as any).providedSoundEstimate,
        managed_by_artist_markup_percent: undefined,
      },
      service_provider_id: 0
    } as BookingRequestCreate;
    // Attach normalized sound context (cast to avoid excess property checks during transition)
    (payload as any).sound_context = {
      sound_required: vals.sound === 'yes',
      mode: (details as any).soundMode || 'none',
      guest_count: parseInt((details as any).guests || '0', 10) || undefined,
      venue_type: (details as any).venueType,
      stage_required: !!(details as any).stageRequired,
      stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : undefined,
      lighting_evening: !!(details as any).lightingEvening,
      backline_required: !!(details as any).backlineRequired,
      selected_sound_service_id: (details as any).soundSupplierServiceId,
    };
    if (!navigator.onLine) {
      enqueueBooking({ action: 'draft', payload, requestId });
      toast.success('Draft queued. It will save when back online.');
      return;
    }
    try {
      if (requestId) {
        await updateBookingRequest(requestId, payload);
      } else {
        const res = await createBookingRequest(payload);
        setRequestId(res.data.id);
      }
      toast.success('Draft saved successfully!');
    } catch (e) {
      console.error('Save Draft Error:', e);
      setValidationError('Failed to save draft. Please try again.');
    }
  });

  // Handles final submission of the booking request
  const submitRequest = handleSubmit(async (vals: EventDetails) => {
    if (!user) {
      const wantsLogin = window.confirm(
        'You need an account to submit a booking request. Press OK to sign in or Cancel to sign up.'
      );
      router.push(wantsLogin ? '/login' : '/register');
      return;
    }
    if (isLoadingReviewData || reviewDataError || calculatedPrice === null || travelResult === null) {
      setValidationError('Review data is not ready. Please wait or check for errors before submitting.');
      return;
    }

    setSubmitting(true);
    const payload: BookingRequestCreate = {
      artist_id: artistId,
      service_id: serviceId,
      proposed_datetime_1: vals.date?.toISOString(),
      message: vals.notes,
      attachment_url: vals.attachment_url,
      status: 'pending_quote',
      travel_mode: travelResult.mode,
      travel_cost: travelResult.totalCost,
      travel_breakdown: {
        ...travelResult.breakdown,
        venue_name: vals.locationName,
        sound_required: vals.sound === 'yes',
        sound_mode: (details as any).soundMode,
        selected_sound_service_id: (details as any).soundSupplierServiceId,
        event_city: details.location,
        provided_sound_estimate: (details as any).providedSoundEstimate,
        stage_required: !!(details as any).stageRequired,
        stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : undefined,
        lighting_evening: !!(details as any).lightingEvening,
        upgrade_lighting_advanced: !!(details as any).lightingUpgradeAdvanced,
        backline_required: !!(details as any).backlineRequired,
      },
      service_provider_id: 0
    } as BookingRequestCreate;
    // Attach normalized sound context (cast to avoid excess property checks during transition)
    (payload as any).sound_context = {
      sound_required: vals.sound === 'yes',
      mode: (details as any).soundMode || 'none',
      guest_count: parseInt((details as any).guests || '0', 10) || undefined,
      venue_type: (details as any).venueType,
      stage_required: !!(details as any).stageRequired,
      stage_size: (details as any).stageRequired ? ((details as any).stageSize || 'S') : undefined,
      lighting_evening: !!(details as any).lightingEvening,
      backline_required: !!(details as any).backlineRequired,
      selected_sound_service_id: (details as any).soundSupplierServiceId,
    };
    const message = `Booking details:\nEvent Type: ${
      vals.eventType || 'N/A'
    }\nDescription: ${vals.eventDescription || 'N/A'}\nDate: ${
      vals.date?.toLocaleDateString() || 'N/A'
    }\nLocation: ${vals.location || 'N/A'}\nGuests: ${
      vals.guests || 'N/A'
    }\nVenue: ${vals.venueType || 'N/A'}\nSound: ${
      vals.sound || 'N/A'
    }\nNotes: ${vals.notes || 'N/A'}`;

    if (!navigator.onLine) {
      enqueueBooking({ action: 'submit', payload, requestId, message });
      toast.success('Booking request queued. It will submit when back online.');
      setSubmitting(false);
      return;
    }

    try {
      const res = requestId
        ? await updateBookingRequest(requestId, payload)
        : await createBookingRequest(payload);

      const id = requestId || res?.data?.id;
      if (!id) throw new Error('Missing booking request ID after creation/update.');

      // Redirect immediately to inbox for a snappy UX; post the details line in the background
      try { router.prefetch('/inbox'); } catch {}
      toast.success('Your booking request has been submitted successfully!');
      router.push(`/inbox?requestId=${id}`);

      // Fire-and-forget posting of the details system line; do not block navigation
      (async () => {
        try {
          await postMessageToBookingRequest(id, {
            content: message,
            // Backend expects uppercase message types.
            message_type: 'SYSTEM',
          });
        } catch (err) {
          console.warn('Failed to post details message for request', id, err);
        }
      })();

      // No resetBooking() or onClose() here; navigation handles teardown
    } catch (e) {
      console.error('Submit Request Error:', e);
      setValidationError('Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  // --- Render Step Logic ---
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <EventDescriptionStep
            control={control}
            setValue={setValue}
            watch={watch}
            onEnterNext={() => void next()}
            firstInputRef={firstInputRef}
          />
        );
      case 1:
        return (
          <LocationStep
            control={control}
            artistLocation={artistLocation}
            setWarning={setWarning}
          />
        );
      case 2:
        return <DateTimeStep control={control} unavailable={unavailable} />;
      case 3:
        return <EventTypeStep control={control} />;
      case 4:
        return <GuestsStep control={control} />;
      case 5:
        return <VenueStep control={control} />;
      case 6:
        return (
          <SoundStep
            control={control}
            setValue={setValue}
            serviceId={serviceId}
            artistLocation={artistLocation}
            eventLocation={details.location}
          />
        );
      case 7:
        return <NotesStep control={control} setValue={setValue} />;
      case 8:
        return (
          <ReviewStep
            step={step}
            steps={steps}
            onBack={prev}
            onSaveDraft={saveDraft}
          onNext={submitRequest}
          submitting={submitting}
          isLoadingReviewData={isLoadingReviewData}
          reviewDataError={reviewDataError}
          calculatedPrice={calculatedPrice}
          travelResult={travelResult}
          submitLabel="Submit Request"
          baseServicePrice={baseServicePrice}
          soundCost={soundCost}
          soundMode={soundMode}
          soundModeOverridden={soundModeOverridden}
          selectedSupplierName={selectedSupplierName}
          servicePriceItems={servicePriceItems}
          serviceCategorySlug={serviceCategorySlug}
        />
      );
      default: return null;
    }
  };

  if (!isOpen) return null;

  // Render a plain dialog without Headless UI's Transition wrapper so the
  // wizard does not animate in between steps.
  return (
    <Dialog
      as="div"
      className="fixed inset-0 z-50 booking-wizard"
      open={isOpen}
      onClose={onClose}
      initialFocus={firstInputRef as any}
    >
      <div className="fixed inset-0 bg-gray-500/75 z-40 wizard-overlay" />

      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <Dialog.Panel className="pointer-events-auto w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl bg-white flex flex-col overflow-hidden">
          <header className="px-6 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">Step {step + 1} of {steps.length}</p>
                <h2 className="text-base font-semibold text-neutral-900">{steps[step]}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="hidden md:inline-flex items-center justify-center h-9 w-9 rounded-full text-neutral-600 hover:bg-black/[0.06]"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-3 h-1.5 w-full rounded bg-black/10">
              <div
                className="h-full rounded bg-black transition-[width] duration-300"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </header>

          <form
            ref={formRef}
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              // Prevent default form submission on Enter key press if not mobile
              // The submit logic for the final step is now handled by ReviewStep's internal button
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-auto px-6 pt-2 pb-5"
          >
            {renderStep()}
            {validationError && <p className="text-red-600 text-sm mt-4">{validationError}</p>}
          </form>

          {/* Navigation controls - Adjusted for ReviewStep */}
          <div className="flex-shrink-0 p-4 sm:p-6 mb-4 flex flex-row flex-nowrap justify-between gap-2 sticky bottom-0 bg-white pb-safe">
            {/* Back/Cancel Button */}
            <button
              type="button" // Ensure it's a button, not a submit
              onClick={handleBack}
              className="bg-neutral-100 text-neutral-800 font-semibold py-2 px-4 rounded-xl hover:bg-neutral-200 transition-colors duration-200 focus:outline-none w-full sm:w-32 flex-1 sm:flex-none min-h-[44px] min-w-[44px]"
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {/* Conditional rendering for Next button (only if not on Review Step) */}
            {step < steps.length - 1 && (
              <button
                type="button" // Ensure it's a button, not a submit
                onClick={next}
                aria-disabled={step === 0 && !descMeetsMin}
                className={
                  (step === 0 && !descMeetsMin)
                    ? "bg-neutral-200 text-neutral-600 font-semibold py-2 px-4 rounded-xl transition-colors duration-200 focus:outline-none w-full sm:w-32 flex-1 sm:flex-none min-h-[44px] min-w-[44px]"
                    : "bg-black text-white font-semibold py-2 px-4 rounded-xl hover:bg-black/90 transition-colors duration-200 focus:outline-none w-full sm:w-32 flex-1 sm:flex-none min-h-[44px] min-w-[44px]"
                }
                title={step === 0 && !descMeetsMin ? "Add at least 5 characters to continue" : undefined}
              >
                Next
              </button>
            )}
            {/* Submit button is handled by ReviewStep on the final step */}
          </div>
        </Dialog.Panel>
      </div>
      {/* Resume Draft Modal */}
      <Dialog open={showResumeModal} onClose={() => setShowResumeModal(false)} className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/30 wizard-overlay" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Resume previous request?</Dialog.Title>
            <p className="mt-2 text-sm text-gray-700">We found a draft booking in progress. You can resume where you left off or start a new request.</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={() => { setShowResumeModal(false); setShowAiAssist(true); /* keep current clean state */ }}
              >
                Start new
              </button>
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900"
                onClick={() => {
                  setShowResumeModal(false);
                  try { applySavedProgress?.(savedRef.current); } catch { loadSavedProgress(); }
                }}
              >
                Resume
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* AI Assist Modal */}
      <Dialog open={showAiAssist} onClose={() => setShowAiAssist(false)} className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/30 wizard-overlay" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg w-full rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Fill with AI</Dialog.Title>
            <p className="mt-2 text-sm text-gray-700">Paste a short description (date, city/venue, guests, occasion) and we’ll pre‑fill the form.</p>
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-black/20 p-2 text-sm"
              placeholder="E.g. 50th birthday for ~80 guests on 12 Oct in Cape Town, outdoor garden party…"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={() => setShowAiAssist(false)}
              >
                Skip
              </button>
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900"
                onClick={async () => {
                  try {
                    if (!aiText.trim()) { setShowAiAssist(false); return; }
                    const res = await parseBookingText(aiText.trim());
                    const data = res.data as any;
                    if (data?.event_type) setValue('eventType', data.event_type);
                    if (data?.date) setValue('date', new Date(data.date));
                    if (data?.location) setValue('location', data.location);
                    if (data?.guests != null) setValue('guests', String(data.guests));
                    setShowAiAssist(false);
                  } catch (e) {
                    console.error(e);
                    setShowAiAssist(false);
                  }
                }}
              >
                Fill with AI
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Minimum description requirement modal */}
      <Dialog open={showMinDescModal} onClose={() => setShowMinDescModal(false)} className="fixed inset-0 z-[9999]">
        <div className="fixed inset-0 bg-black/30 wizard-overlay" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm w-full rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-gray-900">Almost there</Dialog.Title>
            <p className="mt-2 text-sm text-gray-700">Add at least 5 characters to continue.</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900"
                onClick={() => setShowMinDescModal(false)}
              >
                OK
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Unavailable date modal */}
      <Dialog open={showUnavailableModal} onClose={() => setShowUnavailableModal(false)} className="fixed inset-0 z-[9999]">
        <div className="fixed inset-0 bg-black/30 wizard-overlay" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm w-full rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-gray-900">Date Unavailable</Dialog.Title>
            <p className="mt-2 text-sm text-gray-700">This service provider is not available on the selected date. Please choose another day.</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900"
                onClick={() => setShowUnavailableModal(false)}
              >
                OK
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </Dialog>
  );
}
