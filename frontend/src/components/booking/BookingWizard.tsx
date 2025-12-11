'use client';

import React, { useEffect, useState, useRef, useCallback, startTransition, useMemo } from 'react';
import { Dialog } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';
import { bookingWizardSchema } from '@/lib/shared/validation/bookingSchema';

import { useBooking, initialDetails } from '@/contexts/BookingContext';
import type { EventDetails } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import useIsMobile from '@/hooks/useIsMobile';
import useBookingForm from '@/hooks/useBookingForm';
import useTransportState from '@/hooks/useTransportState';
import { useDebounce } from '@/hooks/useDebounce';
import { parseBookingText } from '@/lib/api';
} from '@/lib/api';
import { calculateTravelMode, getDrivingMetricsCached, geocodeCached, findNearestAirport, getMockCoordinates, type TravelResult } from '@/lib/travel';
import { trackEvent } from '@/lib/analytics';
import { format } from 'date-fns';
import { computeSoundServicePrice, type LineItem } from '@/lib/soundPricing';
import { bookingWizardStepFields, isUnavailableDate, normalizeEventType, normalizeGuestCount } from '@/lib/shared/validation/booking';
import { fromServiceToLiveBookingConfig, useLiveBookingEngineWeb } from "@/features/booking/livePerformance";

import './wizard/wizard.css';
import toast from '../ui/Toast';
import { apiUrl, setClientBillingByBookingRequest } from '@/lib/api';
// 404-aware service cache (tombstones)
const svcCache = new Map<number, any | null>();
type ServiceJson = any | null; // null = tombstone (missing)
async function fetchServiceCached(serviceId: number): Promise<ServiceJson> {
  const cached = svcCache.get(serviceId);
  if (cached !== undefined) return cached as ServiceJson;
  try {
    const resp = await fetch(apiUrl(`/api/v1/services/${serviceId}`), { cache: 'force-cache' });
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

const schema = bookingWizardSchema;

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
  const transport = useTransportState();
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
  const [artistLocation, setArtistLocation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reviewDataError, setReviewDataError] = useState<string | null>(null);
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [baseServicePrice, setBaseServicePrice] = useState<number>(liveDetails ? 0 : 0); // New state for base service price
  const [servicePriceItems, setServicePriceItems] = useState<LineItem[] | null>(null);
  const [serviceCategorySlug, setServiceCategorySlug] = useState<string | undefined>(undefined);
  const [soundCost, setSoundCost] = useState(0);
  const [soundMode, setSoundMode] = useState<string | null>(null);
  const [soundModeOverridden, setSoundModeOverridden] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | undefined>(undefined);
  const [artistVatRegistered, setArtistVatRegistered] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [artistVatRate, setArtistVatRate] = useState<number | null>(null);
  const [providerAvatarUrl, setProviderAvatarUrl] = useState<string | null>(null);

  // Business billing (client)
  const [needTaxInvoice, setNeedTaxInvoice] = useState(false);
  const [clientCompanyName, setClientCompanyName] = useState('');
  const [clientVatNumber, setClientVatNumber] = useState('');
  const [clientBillingAddress, setClientBillingAddress] = useState('');

  const [serviceData, setServiceData] = useState<any>(null);
  const liveConfig = useMemo(
    () =>
      serviceData
        ? fromServiceToLiveBookingConfig(serviceData as any)
        : {
            basePriceZar: 0,
            durationMinutes: 60,
            soundProvisioning: {},
            travelRate: undefined,
            travelMembers: undefined,
          },
    [serviceData],
  );
  const liveEngine = useLiveBookingEngineWeb({
    artistId,
    serviceId: serviceId || 0,
    config: liveConfig,
  });
  const liveDetails = liveEngine.state.details;
  const setDetailsSynced = useCallback(
    (d: EventDetails) => {
      setDetails(d);
      try {
        liveEngine.actions.updateMany(d);
      } catch {}
    },
    [setDetails, liveEngine.actions],
  );
  const setTravelResultSynced = useCallback(
    (tr: TravelResult | null) => {
      setTravelResult(tr);
      try {
        liveEngine.actions.setTravelResult(tr);
      } catch {}
    },
    [setTravelResult, liveEngine.actions],
  );
  const billingDebounce = useRef<any>(null);

  const persistBillingSnapshot = useCallback((brId: number) => {
    const payload: Record<string, any> = {
      legal_name: clientCompanyName.trim() || undefined,
      vat_number: clientVatNumber.trim() || undefined,
      billing_address_line1: clientBillingAddress.trim() || undefined,
    };
    setClientBillingByBookingRequest(brId, payload).catch(()=>{});
  }, [clientCompanyName, clientVatNumber, clientBillingAddress]);

  // Calculation orchestration to reduce flicker and duplicate runs
  const calcSeqRef = useRef(0);
  const activeCalcRef = useRef(0);
  const lastSigRef = useRef<string | null>(null);
  const lastTravelSigRef = useRef<string | null>(null);
  const travelResultCache = useRef<Map<string, TravelResult>>(new Map());
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

  const isMobile = useIsMobile();
  // Convert zero-based step index to progress percentage for the mobile progress bar.
  const progressValue = ((step + 1) / steps.length) * 100;
  const hasLoaded = useRef(false);
  const hasHydratedFromDraft = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isCurrentlyOnline = useCallback(
    () => (typeof transport.online === 'boolean' ? transport.online : (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
    [transport.online],
  );

  // --- Form Hook (React Hook Form + Yup) ---
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    watch,
    errors, // Directly destructure errors, assuming useBookingForm returns it at top level
    reset,
  } = useBookingForm(schema as any, liveDetails as any, setDetailsSynced as any);

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
      // Scroll slightly after keyboard open (guard for jsdom/tests where
      // scrollIntoView may be undefined).
      setTimeout(() => {
        if (typeof (target as any).scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    };
    formEl.addEventListener('focusin', focusHandler);
    return () => formEl.removeEventListener('focusin', focusHandler);
  }, [step]);

  // Effect to fetch artist availability and provider info (location, VAT) from API
  useEffect(() => {
    if (!artistId) return;
    const fetchArtistData = async () => {
      let svcRes: any = null;

      try {
        svcRes = serviceId
          ? await fetch(apiUrl(`/api/v1/services/${serviceId}`), { cache: 'no-store' }).then((r) =>
            r.ok ? r.json() : null,
          )
          : null;
        setServiceData(svcRes);
      } catch (err) {
        console.error('Failed to fetch service data for booking wizard:', err);
      }

      // Derive location, VAT, and provider name from the service's nested provider profile.
      // Prefer canonical service_provider fields but keep artist/legacy aliases for backward compatibility.
      try {
        if (!svcRes) return;
        const artistProf: any =
          (svcRes as any)?.artist ||
          (svcRes as any)?.service_provider ||
          (svcRes as any)?.artist_profile ||
          (svcRes as any)?.service_provider_profile ||
          null;
        const loc = (
          artistProf?.location ||
          (svcRes as any)?.details?.base_location ||
          ''
        )
          .toString()
          .trim();
        setArtistLocation(loc || null);

        const vatVal =
          typeof artistProf?.vat_registered === 'boolean'
            ? artistProf.vat_registered
            : null;
        setArtistVatRegistered(vatVal);

        try {
          const rawRate = artistProf?.vat_rate;
          let rateNum: number | null = null;
          if (typeof rawRate === 'number') rateNum = rawRate;
          else if (typeof rawRate === 'string' && rawRate.trim()) {
            const parsed = parseFloat(rawRate);
            rateNum = Number.isFinite(parsed) ? parsed : null;
          }
          setArtistVatRate(rateNum);
        } catch {
          setArtistVatRate(null);
        }

        try {
          const avatar = (
            artistProf?.profile_picture_url ||
            (svcRes as any)?.artist_profile?.profile_picture_url ||
            (svcRes as any)?.service_provider_profile?.profile_picture_url ||
            ''
          )
            .toString()
            .trim();
          setProviderAvatarUrl(avatar || null);
        } catch {
          setProviderAvatarUrl(null);
        }

        const name = (
          artistProf?.legal_name ||
          artistProf?.business_name ||
          (svcRes as any)?.title ||
          ''
        )
          .toString()
          .trim();
        setProviderName(name || null);
      } catch {
        // Leave prior values; do not force false on unknown
      }
    };
    void fetchArtistData();
  }, [artistId, serviceId]);

  // Effect to prompt to restore saved progress only when the wizard first opens.
  // For service-specific flows, only show the resume prompt when the saved
  // state is explicitly tied to the same serviceId to avoid confusing users
  // with drafts from other artists/services.
  useEffect(() => {
    if (!isOpen || hasLoaded.current) return;
    try {
      const peek = peekSavedProgress?.();
      if (peek) {
        const savedServiceId = typeof peek.serviceId === 'number' ? peek.serviceId : null;
        if (serviceId != null) {
          if (savedServiceId === serviceId) {
            savedRef.current = peek;
            setShowResumeModal(true);
          }
        } else {
          savedRef.current = peek;
          setShowResumeModal(true);
        }
      }
    } catch {
      loadSavedProgress();
    }
    hasLoaded.current = true;
  }, [isOpen, loadSavedProgress, peekSavedProgress, serviceId]);

  useEffect(() => {
    if (!hasHydratedFromDraft.current && liveEngine.state.booking.requestId && liveDetails) {
      setDetails(liveDetails as any);
      reset(liveDetails as any);
      hasHydratedFromDraft.current = true;
    }
  }, [liveDetails, liveEngine.state.booking.requestId, setDetails, reset]);

  useEffect(() => {
    if (liveEngine.state.booking.requestId) {
      setRequestId(liveEngine.state.booking.requestId as number | undefined);
    }
  }, [liveEngine.state.booking.requestId, setRequestId]);

  useEffect(() => {
    if (liveEngine.state.validation.globalError) {
      setValidationError(liveEngine.state.validation.globalError);
    }
  }, [liveEngine.state.validation.globalError]);

  // Effect to set serviceId in the booking context if provided as a prop
  useEffect(() => {
    if (serviceId) setServiceIdInContext(serviceId);
  }, [serviceId, setServiceIdInContext]);

  // Persist client business billing snapshot when toggled/edited
  useEffect(() => {
    if (!needTaxInvoice || !requestId) return;
    if (billingDebounce.current) clearTimeout(billingDebounce.current);
    billingDebounce.current = setTimeout(() => {
      try {
        persistBillingSnapshot(requestId as number);
      } catch {}
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTaxInvoice, clientCompanyName, clientVatNumber, clientBillingAddress, requestId]);

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

    // Require a service and event city; provider base location is optional
    // because the backend can still compute a quote without it.
    if (!serviceId || !details.location) {
      if (activeCalcRef.current === calcId) setIsLoadingReviewData(false);
      setReviewDataError('Missing booking details (Service ID or Event Location) to calculate estimates.');
      if (activeCalcRef.current === calcId) {
        setCalculatedPrice(null);
        setTravelResultSynced(null);
      }
      return;
    }

    if (!isLoadingRef.current) {
      setIsLoadingReviewData(true);
      isLoadingRef.current = true;
    }
    setReviewDataError(null);

    try {
      const svcRes = serviceId ? await fetchServiceCached(serviceId) : null;

      if (!svcRes) {
        // Tombstone: remember and bail quietly without spamming the console
        if (activeCalcRef.current === calcId) setIsLoadingReviewData(false);
        setReviewDataError('Selected service is unavailable.');
        setCalculatedPrice(null);
        setServicePriceItems(null);
        setTravelResultSynced(null);
        return;
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

      // Map live/performance services via the helper; preserve sound-service audience logic
      const liveConfig = fromServiceToLiveBookingConfig(svcRes as any);
      const soundProvisioning = liveConfig.soundProvisioning || {};

      let basePrice = liveConfig.basePriceZar;
      let priceItems: LineItem[] | null = null;
      const isSoundService = typeof svcCategorySlug === 'string' && svcCategorySlug.toLowerCase().includes('sound');
      const hasAudiencePkgs = Array.isArray(svcRes?.details?.audience_packages) && svcRes.details.audience_packages.length > 0;
      if (isSoundService && hasAudiencePkgs) {
        const guestCount = normalizeGuestCount((details as any).guests);
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

      const travelRate =
        liveConfig.travelRate ??
        (parseNumber((svcRes as any)?.travel_rate, 2.5) || 2.5);
      const numTravelMembers =
        liveConfig.travelMembers ??
        (parseNumber((svcRes as any)?.travel_members, 1) || 1);
      const carRentalPrice = parseOptionalNumber((svcRes as any)?.car_rental_price);
      const flightPrice = parseOptionalNumber((svcRes as any)?.flight_price);

      let quote: any = null;
      const isSoundServiceCategory = (svcCategorySlug || '').toLowerCase().includes('sound');
      // Travel: when sound is required for a non-sound service, trust the engine/back-end; fallback to client travel only for display/cache
      if (!isSoundServiceCategory && details.sound === 'yes') {
        try {
          const dt = (() => {
            const dd = (details as any)?.date;
            if (!dd) return new Date();
            try { return typeof dd === 'string' ? new Date(dd) : dd; } catch { return new Date(); }
          })();
          const artistLoc = String(artistLocation || '').trim();
          const eventLoc = String((details as any)?.location || '').trim();
          if (artistLoc && eventLoc) {
            const travelSig = JSON.stringify({
              artistLoc,
              eventLoc,
              numTravellers: Number(numTravelMembers || 1),
              travelRate,
              carRentalPrice: carRentalPrice ?? null,
              flightPrice: flightPrice ?? null,
            });
              const cachedTravel = travelResultCache.current.get(travelSig);
              if (cachedTravel) {
                lastTravelSigRef.current = travelSig;
                setTravelResultSynced(cachedTravel);
              } else {
              const airportFn = async (city: string) => {
                const mock = getMockCoordinates(city);
                if (mock) return findNearestAirport(city, async () => mock as any);
                return findNearestAirport(city, geocodeCached);
              };
              const tr = await calculateTravelMode(
                {
                  artistLocation: artistLoc,
                  eventLocation: eventLoc,
                  numTravellers: Number(numTravelMembers || 1),
                  // Let calculateTravelMode derive driving estimate from distance
                  drivingEstimate: 0,
                  travelRate,
                  travelDate: dt,
                  carRentalPrice: carRentalPrice,
                  flightPricePerPerson: flightPrice,
                },
                undefined as any,
                airportFn as any,
              );
              let finalTravel = tr as any;
              if (!(finalTravel && typeof finalTravel.totalCost === 'number' && Number.isFinite(finalTravel.totalCost) && finalTravel.totalCost > 0)) {
                // Frontend-only drive fallback when the rich calculator cannot
                // produce a usable total (e.g., missing airports). This uses
                // driving distance × travelRate × 2 (round-trip) and ignores
                // any backend quote travel_cost.
                try {
                  const metrics = await getDrivingMetricsCached(artistLoc, eventLoc);
                  const distKm = metrics?.distanceKm || 0;
                  if (Number.isFinite(distKm) && distKm > 0) {
                    const driveCost = distKm * travelRate * 2;
                    finalTravel = {
                      mode: 'drive',
                      totalCost: driveCost,
                      breakdown: {
                        drive: { estimate: driveCost },
                        fly: {
                          perPerson: 0,
                          travellers: numTravelMembers,
                          flightSubtotal: 0,
                          carRental: Number(carRentalPrice || 0),
                          localTransferKm: 0,
                          departureTransferKm: 0,
                          transferCost: 0,
                          total: 0,
                        },
                      },
                    } as any;
                  }
                } catch {
                  // If even metrics fail, leave finalTravel as-is (likely null)
                }
              }
              if (finalTravel && typeof finalTravel.totalCost === 'number' && Number.isFinite(finalTravel.totalCost) && finalTravel.totalCost > 0) {
                lastTravelSigRef.current = travelSig;
                travelResultCache.current.set(travelSig, finalTravel);
                setTravelResultSynced(finalTravel);
              }
            }
          }
        } catch {
          // On failure, leave travelResult as-is; do not fall back to backend quote travel.
        }
      } else {
        // Still compute totals (including travel) on the server even if no external sound.
        try {
          // Quote handled by engine; keep travel fallback only
          setCalculatedPrice(null);
          setSoundCost(0);
          setSoundMode(null);
          setSoundModeOverridden(false);

          try {
            const dt = (() => {
              const dd = (details as any)?.date;
              if (!dd) return new Date();
              try { return typeof dd === 'string' ? new Date(dd) : dd; } catch { return new Date(); }
            })();
            const artistLoc = String(artistLocation || '').trim();
            const eventLoc = String((details as any)?.location || '').trim();
            if (artistLoc && eventLoc) {
              const travelSig = JSON.stringify({
                artistLoc,
                eventLoc,
                numTravellers: Number(numTravelMembers || 1),
                travelRate,
                carRentalPrice: carRentalPrice ?? null,
                flightPrice: flightPrice ?? null,
              });
              const cachedTravel = travelResultCache.current.get(travelSig);
              if (cachedTravel) {
                lastTravelSigRef.current = travelSig;
                setTravelResultSynced(cachedTravel);
              } else {
                const airportFn = async (city: string) => {
                  const mock = getMockCoordinates(city);
                  if (mock) return findNearestAirport(city, async () => mock as any);
                  return findNearestAirport(city, geocodeCached);
                };
                const tr = await calculateTravelMode(
                  {
                    artistLocation: artistLoc,
                    eventLocation: eventLoc,
                    numTravellers: Number(numTravelMembers || 1),
                    drivingEstimate: 0,
                    travelRate,
                  travelDate: dt,
                  carRentalPrice: carRentalPrice,
                  flightPricePerPerson: flightPrice,
                },
                undefined as any,
                  airportFn as any,
                  );
                  let finalTravel = tr as any;
                  if (!(finalTravel && typeof finalTravel.totalCost === 'number' && Number.isFinite(finalTravel.totalCost) && finalTravel.totalCost > 0)) {
                    // Frontend-only drive fallback when the rich calculator cannot
                    // produce a usable total (e.g., missing airports). Use
                    // driving distance × travelRate × 2 (round-trip).
                    try {
                      const metrics = await getDrivingMetricsCached(artistLoc, eventLoc);
                      const distKm = metrics?.distanceKm || 0;
                      if (Number.isFinite(distKm) && distKm > 0) {
                        const driveCost = distKm * travelRate * 2;
                        finalTravel = {
                          mode: 'drive',
                          totalCost: driveCost,
                          breakdown: {
                            drive: { estimate: driveCost },
                            fly: {
                              perPerson: 0,
                              travellers: numTravelMembers,
                              flightSubtotal: 0,
                              carRental: Number(carRentalPrice || 0),
                              localTransferKm: 0,
                              departureTransferKm: 0,
                              transferCost: 0,
                              total: 0,
                            },
                          },
                        } as any;
                      }
                    } catch {
                      // If even metrics fail, leave finalTravel as-is
                    }
                  }
                  if (finalTravel && typeof finalTravel.totalCost === 'number' && Number.isFinite(finalTravel.totalCost) && finalTravel.totalCost > 0) {
                    lastTravelSigRef.current = travelSig;
                    travelResultCache.current.set(travelSig, finalTravel);
                setTravelResultSynced(finalTravel);
                  }
              }
            }
          } catch {
            // On failure, leave travelResult unchanged instead of falling back to backend travel.
          }
        } catch {
          setCalculatedPrice(basePrice);
          setSoundCost(0);
          setSoundMode(null);
          setSoundModeOverridden(false);
        }
      }

    } catch (err) {
      console.error('Failed to calculate booking estimates:', err);
      setReviewDataError('Failed to calculate booking estimates. Please ensure location details are accurate and try again.');
      setCalculatedPrice(null);
      setTravelResultSynced(null);
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
                setTravelResult: setTravelResultSynced,
                reviewDataError,
  ]);

  // Trigger the calculation when approaching the Review step to prefetch data
  const hasPrefetched = useRef(false);
  const soundPrefetchStarted = useRef(false);
  const earlyTravelPrefetched = useRef(false);

  // Kick off a one-time early travel calculation as soon as we have date + location
  useEffect(() => {
    if (earlyTravelPrefetched.current) return;
    if (!serviceId || !artistLocation || !(details as any)?.location || !(details as any)?.date) return;
    earlyTravelPrefetched.current = true;
    void calculateReviewData();
  }, [serviceId, artistLocation, details, calculateReviewData]);
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
    const hasDate = !!(details as any)?.date;
    const soundIdx = steps.indexOf('Sound');
    if (isOpen && step >= soundIdx && s && hasLoc && hasDate && !soundPrefetchStarted.current) {
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
  useEffect(() => {
    if (step === steps.length - 1 && liveEngine.state.quote.isDirty && details.location) {
      void liveEngine.actions.recalculateQuote();
    }
  }, [step, liveEngine.state.quote.isDirty, liveEngine.actions, details.location]);

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
      if (isUnavailableDate(details as any, liveEngine.state.availability.unavailableDates)) {
        setShowUnavailableModal(true);
        return;
      }
    }
    const fieldsToValidate = bookingWizardStepFields[step] as (keyof EventDetails)[];
    const valid = fieldsToValidate.length > 0 ? await trigger(fieldsToValidate as any) : true;

    if (valid) {
      // Auto-parse and apply event details on advancing from the first step
      if (step === 0) {
        const desc = (details as any).eventDescription as string | undefined;
        if (desc && desc.trim().length >= 5) {
          try {
            const res = await parseBookingText(desc);
            const { event_type, date, location, guests, venue_type } = res.data || {};
            if (date) setValue('date', new Date(date));
            if (location) setValue('location', location);
            if (guests !== undefined && guests !== null) setValue('guests', String(guests));
            if (event_type) setValue('eventType', event_type);
            if (venue_type) setValue('venueType', venue_type as any);
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
  const saveDraft = handleSubmit(async () => {
    try {
      await liveEngine.actions.saveDraft();
      if (liveEngine.state.validation.globalError) {
        setValidationError(liveEngine.state.validation.globalError);
        return;
      }
      if (liveEngine.state.booking.requestId) {
        setRequestId(liveEngine.state.booking.requestId);
      }
      setValidationError(null);
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
      router.push(wantsLogin ? '/auth?intent=login' : '/auth?intent=signup');
      return;
    }
    if (isLoadingReviewData || reviewDataError || reviewCalculatedPrice === null || reviewTravelResult === null) {
      setValidationError('Review data is not ready. Please wait or check for errors before submitting.');
      return;
    }
    // Gating: if client needs Tax Invoice but provider is not VAT-registered, block submit
    if (needTaxInvoice && artistVatRegistered === false) {
      setValidationError('This provider is not VAT-registered and cannot issue a Tax Invoice. Please choose a VAT-registered provider or untick the Tax Invoice option.');
      return;
    }

    const message = `Booking details:\nEvent Type: ${
      vals.eventType || 'N/A'
    }\nDescription: ${vals.eventDescription || 'N/A'}\nDate: ${
      vals.date?.toLocaleDateString() || 'N/A'
    }\nLocation: ${vals.location || 'N/A'}\nGuests: ${
      vals.guests || 'N/A'
    }\nVenue: ${vals.venueType || 'N/A'}\nSound: ${
      vals.sound || 'N/A'
    }\nNotes: ${vals.notes || 'N/A'}`;

    try {
      const wasOffline = !isCurrentlyOnline();
      await liveEngine.actions.submitBooking(message);
      if (liveEngine.state.validation.globalError) {
        setValidationError(liveEngine.state.validation.globalError);
        return;
      }
      setValidationError(null);
      if (liveEngine.state.booking.requestId) {
        setRequestId(liveEngine.state.booking.requestId);
      }
      if (wasOffline || liveEngine.state.flags.offline) {
        toast.success("Booking request queued. We'll submit it when you're back online.");
      } else {
        toast.success('Your booking request has been submitted successfully!');
      }
    } catch (e) {
      console.error('Submit Request Error:', e);
      setValidationError('Failed to submit booking request. Please try again.');
    }
  });

  const reviewQuote = liveEngine.state.quote;
  const reviewTravelResult = liveEngine.state.travelResult ?? travelResult;
  const reviewCalculatedPrice = reviewQuote.total ?? calculatedPrice;
  const reviewSoundCost = reviewQuote.soundCost ?? soundCost;
  const reviewServicePriceItems =
    (Array.isArray(reviewQuote.items) && reviewQuote.items.length > 0)
      ? reviewQuote.items
      : servicePriceItems;
  const reviewLoading = liveEngine.state.flags.quoteLoading || isLoadingReviewData;

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
            setValue={setValue}
          />
        );
      case 2:
        return (
          <DateTimeStep
            control={control}
            unavailable={liveEngine.state.availability.unavailableDates}
            loading={liveEngine.state.availability.status === 'checking'}
            status={liveEngine.state.availability.status}
          />
        );
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
            submitting={liveEngine.state.flags.submitting}
            isLoadingReviewData={reviewLoading}
            reviewDataError={reviewDataError}
            calculatedPrice={reviewCalculatedPrice}
            travelResult={reviewTravelResult}
            submitLabel="Submit Request"
            baseServicePrice={baseServicePrice}
            soundCost={reviewSoundCost}
            soundMode={soundMode}
            soundModeOverridden={soundModeOverridden}
            selectedSupplierName={selectedSupplierName}
            servicePriceItems={reviewServicePriceItems}
            serviceCategorySlug={serviceCategorySlug}
            providerVatRegistered={artistVatRegistered === true}
            providerVatRate={artistVatRate}
            needTaxInvoice={needTaxInvoice}
            onToggleTaxInvoice={(checked) => setNeedTaxInvoice(checked)}
            clientCompanyName={clientCompanyName}
            clientVatNumber={clientVatNumber}
            clientBillingAddress={clientBillingAddress}
            onChangeClientCompanyName={setClientCompanyName}
            onChangeClientVatNumber={setClientVatNumber}
            onChangeClientBillingAddress={setClientBillingAddress}
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
      {!showResumeModal && (
        <>
          <div className="fixed inset-0 bg-gray-500/75 z-40 wizard-overlay" aria-hidden="true" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Panel className="pointer-events-auto w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl bg-white flex flex-col overflow-hidden">
              <header className="px-6 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-neutral-500">Step {step + 1} of {steps.length}</p>
                    <h2 className="text-base font-semibold text-neutral-900">{steps[step]}</h2>
                    {providerName && (
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-600">
                        <span className="truncate max-w-[50vw]" title={providerName}>Provider: {providerName}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${artistVatRegistered ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}
                          title={artistVatRegistered ? 'This provider is VAT-registered' : 'This provider is not VAT-registered'}
                        >
                          {artistVatRegistered ? 'VAT registered' : 'Not VAT-registered'}
                        </span>
                      </div>
                    )}
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
                <div
                  className="mt-3 h-1.5 w-full rounded bg-black/10"
                  role="progressbar"
                  aria-valuenow={progressValue}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
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
                {/* Business billing details live inside ReviewStep; nothing extra here */}
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
        </>
      )}
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
                onClick={() => {
                  // Start a fresh request without invoking the AI assist overlay
                  // so the underlying form is immediately interactive.
                  setShowResumeModal(false);
                }}
              >
                Start new
              </button>
              <button
                type="button"
                className="rounded-lg bg-black text-white px-3 py-2 text-sm font-semibold hover:bg-gray-900"
                onClick={() => {
                  setShowResumeModal(false);
                  try {
                    const saved = savedRef.current;
                    if (saved && saved.details) {
                      applySavedProgress?.(saved);
                      const parsedDetails: EventDetails = {
                        ...initialDetails,
                        ...saved.details,
                        date: saved.details.date ? new Date(saved.details.date) : new Date(),
                      };
                      reset(parsedDetails);
                    } else {
                      // Fallback: legacy behavior if savedRef is missing
                      loadSavedProgress();
                    }
                  } catch {
                    loadSavedProgress();
                  }
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
                    if (data?.venue_type) setValue('venueType', data.venue_type as any);
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
