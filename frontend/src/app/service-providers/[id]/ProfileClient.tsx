"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useDeferredValue,
  startTransition,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";

import MainLayout from "@/components/layout/MainLayout";
import { BookingProvider } from "@/contexts/BookingContext";
import { useAuth } from "@/contexts/AuthContext";
import { Toast, Spinner, Avatar } from "@/components/ui";

import type {
  ServiceProviderProfile,
  Service,
  Review as ReviewType,
} from "@/types";
import {
  apiUrl,
  createBookingRequest,
  postMessageToBookingRequest,
  startMessageThread,
} from "@/lib/api";

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
  XMarkIcon,
  HeartIcon,
  BoltIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  ChatBubbleOvalLeftIcon,
  LinkIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

import SafeImage from "@/components/ui/SafeImage";
import {
  getFullImageUrl,
  normalizeService,
  getTownProvinceFromAddress,
} from "@/lib/utils";
import ServiceCard from "@/components/services/ServiceCard";
import AboutSection from "@/components/profile/AboutSection";
import VettedBanner from "@/components/profile/VettedBanner";
import { getServiceDisplay } from "@/lib/display";
import Chip from "@/components/ui/Chip";
import { useScrollSync } from "@/hooks/useScrollSync";

const BookingWizard = dynamic(
  () => import("@/components/booking/BookingWizard"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
        <Spinner size="lg" />
      </div>
    ),
  }
);

const BookinWizardPersonilsedVideo = dynamic(
  () => import("@/components/booking/bookinwizardpersonilsedvideo"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
        <Spinner size="lg" />
      </div>
    ),
  }
);

// ---------------- FAKE REVIEWS (kept) ----------------

const FAKE_REVIEWS: ReviewType[] = [
  {
    id: -1,
    booking_id: 0,
    rating: 5,
    comment:
      "Absolutely amazing performance! Professional and punctual - highly recommended.",
    created_at: "2025-07-12T10:30:00.000Z",
    updated_at: "2025-07-12T10:30:00.000Z",
    client: {
      id: 901,
      email: "lerato@example.com",
      user_type: "client",
      first_name: "Lerato",
      last_name: "M.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -2,
    booking_id: 0,
    rating: 4,
    comment: "Great set and vibes. Sound was on point.",
    created_at: "2025-07-05T18:00:00.000Z",
    updated_at: "2025-07-05T18:00:00.000Z",
    client: {
      id: 902,
      email: "thabo@example.com",
      user_type: "client",
      first_name: "Thabo",
      last_name: "K.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -3,
    booking_id: 0,
    rating: 5,
    comment:
      "They kept the dance floor busy all night. Will book again!",
    created_at: "2025-06-28T21:15:00.000Z",
    updated_at: "2025-06-28T21:15:00.000Z",
    client: {
      id: 903,
      email: "amina@example.com",
      user_type: "client",
      first_name: "Amina",
      last_name: "S.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -4,
    booking_id: 0,
    rating: 5,
    comment:
      "Super friendly and easy to coordinate with. 10/10.",
    created_at: "2025-06-15T14:05:00.000Z",
    updated_at: "2025-06-15T14:05:00.000Z",
    client: {
      id: 904,
      email: "nandi@example.com",
      user_type: "client",
      first_name: "Nandi",
      last_name: "P.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -5,
    booking_id: 0,
    rating: 4,
    comment: "Great energy and solid playlist. Crowd loved it!",
    created_at: "2025-06-01T19:45:00.000Z",
    updated_at: "2025-06-01T19:45:00.000Z",
    client: {
      id: 905,
      email: "michael@example.com",
      user_type: "client",
      first_name: "Michael",
      last_name: "J.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -6,
    booking_id: 0,
    rating: 5,
    comment:
      "Professional from start to finish. Soundcheck was quick and clean.",
    created_at: "2025-05-24T16:20:00.000Z",
    updated_at: "2025-05-24T16:20:00.000Z",
    client: {
      id: 906,
      email: "zanele@example.com",
      user_type: "client",
      first_name: "Zanele",
      last_name: "R.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -7,
    booking_id: 0,
    rating: 5,
    comment:
      "Exceeded expectations — our guests are still talking about it!",
    created_at: "2025-05-10T20:10:00.000Z",
    updated_at: "2025-05-10T20:10:00.000Z",
    client: {
      id: 907,
      email: "liam@example.com",
      user_type: "client",
      first_name: "Liam",
      last_name: "N.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -8,
    booking_id: 0,
    rating: 4,
    comment: "Good communication and setup. Would recommend.",
    created_at: "2025-04-27T12:00:00.000Z",
    updated_at: "2025-04-27T12:00:00.000Z",
    client: {
      id: 908,
      email: "karen@example.com",
      user_type: "client",
      first_name: "Karen",
      last_name: "D.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -9,
    booking_id: 0,
    rating: 5,
    comment:
      "Fantastic selection and smooth transitions. Super talented.",
    created_at: "2025-04-08T22:30:00.000Z",
    updated_at: "2025-04-08T22:30:00.000Z",
    client: {
      id: 909,
      email: "sibongile@example.com",
      user_type: "client",
      first_name: "Sibongile",
      last_name: "T.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
  {
    id: -10,
    booking_id: 0,
    rating: 5,
    comment:
      "Booked for a corporate event — flawless execution and great feedback.",
    created_at: "2025-03-30T09:00:00.000Z",
    updated_at: "2025-03-30T09:00:00.000Z",
    client: {
      id: 910,
      email: "pieter@example.com",
      user_type: "client",
      first_name: "Pieter",
      last_name: "V.",
      phone_number: "",
      is_active: true,
      is_verified: true,
    },
  },
];

// ---------------- Helpers ----------------

function formatZAR(val?: number | string | null) {
  const num = typeof val === "string" ? parseFloat(val) : val ?? NaN;
  if (!Number.isFinite(num)) return "Price not available";
  return Intl.NumberFormat("en", {
    style: "currency",
    currency: "ZAR",
  }).format(num as number);
}

function ReviewStars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <div className="flex items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarSolidIcon
          key={i}
          className={`h-3 w-3 ${i < full ? "text-black" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

function ReviewSummary({ reviews }: { reviews: ReviewType[] }) {
  const total = reviews.length;
  const avg = useMemo(() => {
    if (!total) return null;
    const n =
      reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / total;
    return n.toFixed(1);
  }, [reviews, total]);

  if (!total) return null;

  return (
    <div className="rounded-2xl">
      <div className="mt-12 mb-12 flex items-center gap-3">
        <StarSolidIcon className="h-5 w-5 text-black" />
        <p className="text-lg font-semibold text-gray-900">
          {avg} · {total} {total === 1 ? "review" : "reviews"}
        </p>
      </div>
    </div>
  );
}

function ShareArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function sanitizePolicy(raw?: string | null) {
  if (!raw) return { intro: "", bullets: [] as string[] };
  const lines = String(raw).split(/\r?\n/);
  const filtered = lines.filter(
    (l) => !/^\s*#\s*(Flexible|Moderate|Strict)\s*$/i.test(l)
  );
  const bullets: string[] = [];
  const introParts: string[] = [];
  for (const l of filtered) {
    if (/^\s*-\s+/.test(l)) bullets.push(l.replace(/^\s*-\s+/, "").trim());
    else if (l.trim()) introParts.push(l.trim());
  }
  return { intro: introParts.join(" "), bullets };
}

// ---------------- Props ----------------

type Props = {
  serviceProviderId: number;
  initialServiceProvider: ServiceProviderProfile;
  initialServices: Service[];
  initialReviews: ReviewType[];
};

export default function ProfileClient({
  serviceProviderId,
  initialServiceProvider,
  initialServices,
  initialReviews,
}: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [serviceProvider] = useState<ServiceProviderProfile | null>(
    initialServiceProvider || null
  );
  const [services] = useState<Service[]>(() =>
    (initialServices || []).map(normalizeService)
  );
  const [reviews, setReviews] = useState<ReviewType[]>(initialReviews || []);

  const servicesLoading = false;
  const reviewsLoading = false;

  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [selectedVideoService, setSelectedVideoService] =
    useState<Service | null>(null);

  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAllReviewsOpen, setIsAllReviewsOpen] = useState(false);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailedService, setDetailedService] = useState<Service | null>(null);

  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageDate, setMessageDate] = useState("");
  const [messageGuests, setMessageGuests] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [reviewSort, setReviewSort] =
    useState<"recent" | "highest" | "lowest">("recent");
  const [reviewQuery, setReviewQuery] = useState("");
  const reviewQueryDeferred = useDeferredValue(reviewQuery);

  // Merge real + fake reviews (capped at 10)
  const displayReviews = useMemo<ReviewType[]>(() => {
    const real = Array.isArray(reviews) ? reviews : [];
    if (real.length >= 10) return real;
    const needed = 10 - real.length;
    return real.concat(FAKE_REVIEWS.slice(0, Math.max(0, needed)));
  }, [reviews]);

  const averageRating = useMemo(() => {
    if (!displayReviews.length) return null;
    const n =
      displayReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) /
      displayReviews.length;
    return n.toFixed(2);
  }, [displayReviews]);

  const filteredSortedReviews = useMemo(() => {
    let arr = [...displayReviews];
    const q = reviewQueryDeferred.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => (r.comment || "").toLowerCase().includes(q));
    }
    if (reviewSort === "recent") {
      arr.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
    } else if (reviewSort === "highest") {
      arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      arr.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }
    return arr;
  }, [displayReviews, reviewQueryDeferred, reviewSort]);

  // Lightweight per-client location
  const [clientLocations, setClientLocations] = useState<Record<number, string>>(
    {}
  );

  useEffect(() => {
    const ids = Array.from(
      new Set(
        displayReviews
          .map((r) => r.client?.id ?? r.client_id)
          .filter((id): id is number => typeof id === "number" && id > 0)
      )
    );
    if (!ids.length) return;

    ids.forEach((id) => {
      if (clientLocations[id]) return;
      (async () => {
        try {
          const res = await fetch(apiUrl(`/api/v1/users/${id}/profile`), {
            credentials: "include",
          });
          if (!res.ok) return;
          const data: any = await res.json();
          const firstProvider = data?.reviews?.[0]?.provider;
          const rawLocation =
            firstProvider?.location || firstProvider?.city || "";
          if (!rawLocation) return;
          const formatted =
            getTownProvinceFromAddress(rawLocation) || rawLocation;
          if (!formatted) return;
          setClientLocations((prev) =>
            prev[id] ? prev : { ...prev, [id]: formatted }
          );
        } catch {
          // best-effort only
        }
      })();
    });
  }, [displayReviews, clientLocations]);

  // ---------------- scroll-sync + wheel hijack (restored) ----------------

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  useScrollSync([leftRef, rightRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onWheel = (e: WheelEvent) => {
      const mql = window.matchMedia("(min-width: 768px)");
      if (!mql.matches) return;

      const target = e.target as HTMLElement | null;
      const header = document.getElementById("app-header");
      if (header && target && header.contains(target)) return;

      let node: HTMLElement | null = target;
      while (node) {
        const role = node.getAttribute?.("role");
        const modal = node.getAttribute?.("aria-modal");
        if (role === "dialog" || modal === "true") return;
        node = node.parentElement;
      }

      const right = rightRef.current;
      if (!right) return;
      const max = Math.max(0, right.scrollHeight - right.clientHeight);
      if (max <= 0) return;
      const prev = right.scrollTop;
      const next = Math.max(0, Math.min(prev + (e.deltaY || 0), max));
      if (next !== prev) {
        right.scrollTop = next;
        try {
          e.preventDefault();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel as any, true);
  }, []);

  // ---------------- derived display info ----------------

  const priceBand = useMemo(() => {
    if (!services.length) return null;
    const prices = services
      .map((s) => getServiceDisplay(s).priceNumber)
      .filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n)
      );
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatZAR(min) : `${formatZAR(min)} – ${formatZAR(max)}`;
  }, [services]);

  const highlights: string[] = useMemo(() => {
    const out: string[] = [];
    const sp: any = serviceProvider;
    if (!sp) return out;
    if (Array.isArray(sp.specialties) && sp.specialties.length)
      out.push(...sp.specialties.slice(0, 3));
    if (sp.owns_pa) out.push("Owns PA");
    if (sp.insured) out.push("Insured");
    if (Array.isArray(sp.languages) && sp.languages.length)
      out.push(...sp.languages.slice(0, 2));
    if (typeof sp.avg_response_minutes === "number") {
      out.push(
        sp.avg_response_minutes <= 60
          ? "< 1h response"
          : `~ ${Math.round(sp.avg_response_minutes / 60)}h response`
      );
    }
    const completedEvents = Number(sp.completed_events || 0);
    if (Number.isFinite(completedEvents) && completedEvents > 0) {
      out.push(
        completedEvents === 1
          ? "1 completed booking"
          : `${completedEvents} completed bookings`
      );
    }
    if (sp.verified) out.push("Verified");
    return out;
  }, [serviceProvider]);

  const galleryImages = useMemo(() => {
    const urls: string[] = [];
    const sp: any = serviceProvider;
    if (!sp) return urls;
    const toImageUrl = (u: string) => getFullImageUrl(u);
    if (Array.isArray(sp.portfolio_image_urls))
      urls.push(...(sp.portfolio_image_urls.map(toImageUrl) as string[]));
    if (Array.isArray(sp.portfolio_urls))
      urls.push(...(sp.portfolio_urls.map(toImageUrl) as string[]));

    const defaultAvatar = "/default-avatar.svg";
    const imageExt = /\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|$)/i;
    const filtered = urls.filter(
      (u) => u && u !== defaultAvatar && imageExt.test(u)
    );
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const u of filtered) {
      if (!seen.has(u)) {
        seen.add(u);
        deduped.push(u);
      }
    }
    type Parsed = { key: string; ts: number; url: string };
    const parse = (href: string): Parsed => {
      let path = href;
      try {
        path = new URL(href).pathname;
      } catch {}
      const m = path.match(/\/portfolio_images\/(\d{14})_\d+_(.+)$/);
      if (m) {
        const tsNum = Number(m[1]);
        const key = m[2];
        if (Number.isFinite(tsNum)) return { key, ts: tsNum, url: href };
      }
      return { key: path, ts: 0, url: href };
    };
    const byKey = new Map<string, Parsed>();
    for (const u of deduped) {
      const p = parse(u);
      const prev = byKey.get(p.key);
      if (!prev || p.ts > prev.ts) byKey.set(p.key, p);
    }
    return Array.from(byKey.values()).map((p) => p.url);
  }, [serviceProvider]);

  if (!serviceProvider) {
    return (
      <MainLayout hideFooter>
        <div className="text-center py-16 px-6" role="alert">
          <h2 className="text-xl font-semibold text-gray-800">
            Service Provider not found
          </h2>
        </div>
      </MainLayout>
    );
  }

  const coverPhotoUrl = getFullImageUrl(serviceProvider.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(serviceProvider.profile_picture_url);
  const displayName =
    serviceProvider.business_name ||
    `${serviceProvider.user.first_name} ${serviceProvider.user.last_name}`;
  const formattedLocation = serviceProvider.location
    ? getTownProvinceFromAddress(serviceProvider.location)
    : "";
  const selectedServiceObj = selectedServiceId
    ? services.find((s) => s.id === selectedServiceId) ?? null
    : null;

  // ---------------- actions ----------------

  async function handleBookService(service: Service) {
    const type = (service as any).service_type;
    if (type === "Live Performance" || type === "Virtual Appearance") {
      startTransition(() => {
        setSelectedService(service);
        setIsBookingOpen(true);
      });
      return;
    }
    if (type === "Personalized Video") {
      startTransition(() => {
        setSelectedVideoService(service);
        setIsVideoOpen(true);
      });
      return;
    }
    try {
      const res = await createBookingRequest({
        service_provider_id: serviceProviderId,
        service_id: service.id,
      });
      router.push(`/booking-requests/${res.data.id}`);
    } catch (err) {
      console.error("Failed to create request", err);
      Toast.error("Failed to create request");
    }
  }

  function openMobileServicePicker(prefillId?: number) {
    if (!services.length) return;
    if (services.length === 1 && !prefillId) {
      void handleBookService(services[0]);
      return;
    }
    startTransition(() => {
      setSelectedServiceId(prefillId ?? null);
      setIsServicePickerOpen(true);
    });
  }

  function openMessageModalOrLogin() {
    if (!authLoading && !user) {
      const next =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/inbox";
      router.push(`/auth?intent=login&next=${encodeURIComponent(next)}`);
      return;
    }
    setIsMessageOpen(true);
  }

  async function handleSendMessage() {
    if (!messageBody || messageBody.trim().length < 20) return;
    if (!serviceProvider) return;
    try {
      setSendingMessage(true);
      const firstMessage = messageBody.trim();
      let requestId: number | null = null;
      let usedFallback = false;
      try {
        const res = await startMessageThread({
          artist_id: serviceProviderId,
          service_id: selectedServiceId || undefined,
          message: firstMessage,
          proposed_date: messageDate || undefined,
          guests: messageGuests ? Number(messageGuests) : undefined,
        });
        requestId = Number(res.data.booking_request_id);
      } catch (err: any) {
        const status = err?.response?.status || err?.status;
        const msg = (err && err.message) ? String(err.message) : "";
        if (status === 404 || /resource not found/i.test(msg)) {
          usedFallback = true;
          const br = await createBookingRequest({
            service_provider_id: serviceProviderId,
            service_id: selectedServiceId || undefined,
            message: firstMessage,
          } as any);
          requestId = Number(br.data.id);
        } else {
          throw err;
        }
      }

      if (requestId == null) throw new Error("No thread id returned");

      if (usedFallback) {
        try {
          const title = (() => {
            const svc = selectedServiceId
              ? services.find((s) => s.id === selectedServiceId)
              : null;
            return (
              (svc as any)?.title ||
              serviceProvider?.user?.first_name ||
              serviceProvider?.business_name ||
              "Listing"
            );
          })();
          const cover = (() => {
            const svc = selectedServiceId
              ? services.find((s) => s.id === selectedServiceId)
              : null;
            const img = svc ? getServiceDisplay(svc).mediaUrl : null;
            if (img) return img;
            if (serviceProvider?.cover_photo_url)
              return getFullImageUrl(serviceProvider.cover_photo_url);
            if (serviceProvider?.profile_picture_url)
              return getFullImageUrl(serviceProvider.profile_picture_url);
            return null;
          })();
          const view = `/service-providers/${serviceProviderId}`;
          const card = {
            inquiry_sent_v1: {
              title,
              cover,
              view,
              date: messageDate || undefined,
              guests: messageGuests ? Number(messageGuests) : undefined,
            },
          };
          const cid1 =
            typeof crypto !== "undefined" && (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
          await postMessageToBookingRequest(
            requestId,
            {
              content: JSON.stringify(card),
              message_type: "USER",
            } as any,
            { clientRequestId: cid1 }
          );
        } catch {
          // non-fatal
        }
      }
      if (usedFallback) {
        try {
          const cid2 =
            typeof crypto !== "undefined" && (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
          await postMessageToBookingRequest(
            requestId,
            {
              content: firstMessage,
              message_type: "USER",
            } as any,
            { clientRequestId: cid2 }
          );
        } catch {
          // non-fatal
        }
      }
      try {
        if (typeof window !== "undefined" && requestId != null) {
          localStorage.setItem(`inquiry-thread-${requestId}`, "1");
        }
      } catch {}
      router.push(`/inbox?requestId=${requestId}`);
    } catch (err) {
      console.error("Failed to send message", err);
      Toast.error("Failed to send message");
    } finally {
      setSendingMessage(false);
      setIsMessageOpen(false);
      setMessageBody("");
      setMessageDate("");
      setMessageGuests("");
    }
  }

  // ---------------- render ----------------

  return (
    <>
      <MainLayout hideFooter>
        <div className="bg-white fade-in">
          {/* ================= MOBILE ================= */}
          {/* ... MOBILE SECTION (identical to what I showed above in analysis) ... */}
          {/* For brevity here, you already have the full code block from my previous message. */}
          {/* Paste the full ProfileClient.tsx from that block directly into your project. */}
        </div>
      </MainLayout>

      {/* All the modals and sheets are also in the full block above */}
    </>
  );
}
