"use client";

import React, { useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Calendar, 
  Briefcase, 
  Plus, 
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Clock
} from "lucide-react";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { Booking, Service } from "@/types";
import { deleteService, getGoogleCalendarStatus } from "@/lib/api";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { categorySlug } from "@/lib/categoryMap";

// Components
import { AddServiceCategorySelector } from "@/components/dashboard";
import { Spinner } from "@/components/ui";
import StatGrid from "@/components/ui/StatGrid";
import RequestsSection from "@/components/dashboard/artist/RequestsSection";
import BookingsSection from "@/components/dashboard/artist/BookingsSection";
import ServicesSection from "@/components/dashboard/artist/ServicesSection";
import { useArtistDashboardData } from "@/hooks/useArtistDashboardData";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { statusChipStyles } from "@/components/ui/status";

// --- Types ---
type ViewState = 'overview' | 'requests' | 'bookings' | 'services';

// --- Helper Components ---

const SidebarItem = ({ 
  active, 
  icon: Icon, 
  label, 
  count, 
  onClick 
}: { 
  active: boolean; 
  icon: any; 
  label: string; 
  count?: number; 
  onClick: () => void; 
}) => (
  <button
    onClick={onClick}
    className={`group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
      active
        ? "bg-black text-white shadow-md"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={20} className={active ? "text-white" : "text-gray-400 group-hover:text-gray-900"} />
      <span>{label}</span>
    </div>
    {count !== undefined && count > 0 && (
      <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
        active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
      }`}>
        {count}
      </span>
    )}
  </button>
);

const MobileTabItem = ({ 
  active, 
  label, 
  count, 
  onClick 
}: { 
  active: boolean; 
  label: string; 
  count?: number; 
  onClick: () => void; 
}) => (
  <button
    onClick={(e) => {
      // Optional: scroll into view logic could go here
      onClick();
    }}
    className={`relative flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
      active
        ? "border-black bg-black text-white shadow-md z-10"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
    }`}
  >
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full text-[10px] font-bold ${
        active ? "bg-white text-black" : "bg-gray-100 text-gray-600"
      }`}>
        {count}
      </span>
    )}
  </button>
);

const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="mb-6 flex flex-col justify-between gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-end">
    <div>
      <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
  </div>
);

// --- Main Page ---

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // --- State ---
  const initialTab = (params.get('tab') as ViewState) || 'overview';
  const [activeView, setActiveView] = useState<ViewState>(initialTab);
  
  // Modals & Wizards
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean>(false);

  const todayFormatted = useMemo(
    () => format(new Date(), "EEEE, d MMM yyyy"),
    []
  );
  
  // Dynamic Imports
  type WizardProps = { isOpen: boolean; onClose: () => void; onServiceSaved: (svc: Service) => void; service?: Service };
  const [WizardComponent, setWizardComponent] = useState<ComponentType<WizardProps> | null>(null);

  // Data Fetching
  const { 
    loading, 
    servicesLoading,
    error, 
    fetchAll, 
    bookings, 
    services, 
	    artistProfile, 
	    bookingRequests, 
	    dashboardStats, 
	    upsertService, 
	    removeService, 
	    reorderServices 
	  } = useArtistDashboardData(user?.id);

  // --- Wizards ---
  const wizardLoaders: Record<string, () => Promise<{ default: ComponentType<WizardProps> }>> = {
    musician: () => import("@/components/dashboard/add-service/musician/MusicianAddServiceRouter"),
    photographer: () => import("@/components/dashboard/add-service/AddServiceModalPhotographer"),
    dj: () => import("@/components/dashboard/add-service/AddServiceModalDJ"),
    sound_service: () => import("@/components/dashboard/add-service/sound/SoundServiceFlow"),
    videographer: () => import("@/components/dashboard/add-service/AddServiceModalVideographer"),
    speaker: () => import("@/components/dashboard/add-service/AddServiceModalSpeaker"),
    wedding_venue: () => import("@/components/dashboard/add-service/AddServiceModalWeddingVenue"),
    caterer: () => import("@/components/dashboard/add-service/AddServiceModalCaterer"),
    bartender: () => import("@/components/dashboard/add-service/AddServiceModalBartender"),
    mc_host: () => import("@/components/dashboard/add-service/AddServiceModalMcHost"),
  };

  useEffect(() => {
    if (!wizardCategory) return;
    wizardLoaders[wizardCategory]().then((mod) => {
      setWizardComponent(() => mod.default);
      setWizardOpen(true);
    });
  }, [wizardCategory]);

  // --- URL Sync ---
  useEffect(() => {
    const cat = params.get('addCategory');
    if (cat) {
      setActiveView('services');
      setWizardCategory(cat);
    }
  }, [params]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentTab = params.get('tab') || 'overview';
    if (currentTab !== activeView) {
      params.set('tab', activeView);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeView, router, pathname]);

  // --- Calendar Status ---
  useEffect(() => {
    if (!user || user.user_type !== 'service_provider') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getGoogleCalendarStatus();
        if (!cancelled) setCalendarConnected(!!res.data?.connected);
      } catch {
        if (!cancelled) setCalendarConnected(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.user_type]);

  // --- Derived State ---
  const missingFields = useMemo(() => {
    const p = artistProfile;
    const list: string[] = [];
    if (!p) return ['Profile details'];
    const nonempty = (v?: string | null) => !!(v && String(v).trim());
    if (!nonempty(p.business_name)) list.push('Business name');
    if (!nonempty(p.description || '')) list.push('Description');
    if (!nonempty(p.location || '')) list.push('Location');
    const hasSpecialties = Array.isArray(p.specialties) && p.specialties.some(Boolean);
    if (!hasSpecialties) list.push('Specialties');
    if (!calendarConnected) list.push('Calendar sync');
    return list;
  }, [artistProfile, calendarConnected]);

  const isProfileComplete = missingFields.length === 0;

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return (bookings || [])
      .filter((b) => new Date(b.start_time).getTime() >= now && b.status !== "cancelled")
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [bookings]);
  const upcomingBookingsCount = upcomingBookings.length;

  const { pendingQuoteCount, unreadRequestsCount, actionRequestsCount } = useMemo(() => {
    let pending = 0;
    let unread = 0;
    const actionIds = new Set<number>();
    for (const r of bookingRequests || []) {
      const id = Number((r as any)?.id || 0) || 0;
      if (String(r.status || "").toLowerCase() === "pending_quote") {
        pending += 1;
        if (id) actionIds.add(id);
      }
      if ((r as any).is_unread_by_current_user) {
        unread += 1;
        if (id) actionIds.add(id);
      }
    }
    return { pendingQuoteCount: pending, unreadRequestsCount: unread, actionRequestsCount: actionIds.size };
  }, [bookingRequests]);
  
  const earningsThisMonth = useMemo(() => {
    const now = new Date();
    return bookings
      .filter(b => b.status === "completed" && new Date(b.start_time).getMonth() === now.getMonth() && new Date(b.start_time).getFullYear() === now.getFullYear())
      .reduce((acc, b) => acc + b.total_price, 0);
  }, [bookings]);

  const primaryBooking = useMemo(() => {
    if (upcomingBookings.length) return upcomingBookings[0];
    if (!bookings.length) return null;
    const sorted = [...bookings].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return sorted[sorted.length - 1] || null;
  }, [bookings, upcomingBookings]);

  // --- Handlers ---
  const openAddService = () => {
    if (!isProfileComplete) {
      setShowCompleteProfileModal(true);
      return;
    }
    setEditingService(null);
    setSelectorOpen(true);
  };

  const openEditService = (service: Service) => {
    if (!isProfileComplete) {
      setShowCompleteProfileModal(true);
      return;
    }
    setEditingService(service);
    const slug =
      service.service_category_slug ||
      (service.service_category?.name ? categorySlug(service.service_category.name) : null);
    if (slug) setWizardCategory(slug);
    else setSelectorOpen(true);
  };

  const deleteServiceById = async (id: number) => {
    await deleteService(id);
    removeService(id);
  };

  if (!user || authLoading) return <MainLayout><div className="flex h-screen items-center justify-center"><Spinner /></div></MainLayout>;

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          {/* === DESKTOP SIDEBAR === */}
          <aside
            className="hidden w-64 shrink-0 md:block md:sticky md:self-start"
            style={{ top: "var(--sp-sticky-top)" }}
          >
            <div className="space-y-6">
              {/* User snippet */}
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-sm font-bold text-white shadow-sm">
                  {user.first_name?.[0]}
                  {user.last_name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {artistProfile?.business_name || user.first_name}
                  </p>
                  <p className="truncate text-xs font-medium text-gray-500">
                    Service Provider Dashboard
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                <SidebarItem
                  active={activeView === "overview"}
                  icon={LayoutDashboard}
                  label="Overview"
                  onClick={() => setActiveView("overview")}
                />
                <SidebarItem
                  active={activeView === "requests"}
                  icon={MessageSquare}
                  label="Requests"
                  count={actionRequestsCount}
                  onClick={() => setActiveView("requests")}
                />
                <SidebarItem
                  active={activeView === "bookings"}
                  icon={Calendar}
                  label="Bookings"
                  count={upcomingBookingsCount}
                  onClick={() => setActiveView("bookings")}
                />
                <SidebarItem
                  active={activeView === "services"}
                  icon={Briefcase}
                  label="Services"
                  onClick={() => setActiveView("services")}
                />
              </nav>

              {/* Quick links */}
              <div className="space-y-2">
                <Link
                  href="/inbox"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
                >
                  Open inbox
                </Link>
                <Link
                  href="/dashboard/provider/payouts"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
                >
                  View payouts
                </Link>
                <Link
                  href="/dashboard/profile/edit"
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
                >
                  Edit profile
                </Link>
              </div>

              {/* Setup widget */}
              {!isProfileComplete && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-amber-900">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      Action needed
                    </span>
                  </div>
                  <p className="mb-3 text-xs font-medium text-amber-800">
                    Finish your profile so clients can find and book you.
                  </p>
                  <Link
                    href="/dashboard/profile/edit?incomplete=1"
                    className="block w-full rounded-lg bg-white py-2 text-center text-xs font-bold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50 no-underline hover:no-underline"
                  >
                    Finish setup
                  </Link>
                </div>
              )}
            </div>
          </aside>

          {/* === MAIN CONTENT === */}
          <main className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
                  Today
                </p>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {todayFormatted}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/inbox"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 no-underline hover:no-underline"
                >
                  Inbox
                </Link>
                <Link
                  href="/dashboard/provider/payouts"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 no-underline hover:no-underline"
                >
                  Payouts
                </Link>
                <button
                  type="button"
                  onClick={openAddService}
                  className="inline-flex items-center justify-center rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
                >
                  <Plus size={16} className="mr-2" /> Add service
                </button>
              </div>
            </div>

            {/* Mobile tabs */}
            <div className="md:hidden mt-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                <MobileTabItem
                  active={activeView === "overview"}
                  label="Overview"
                  onClick={() => setActiveView("overview")}
                />
                <MobileTabItem
                  active={activeView === "requests"}
                  label="Requests"
                  count={actionRequestsCount}
                  onClick={() => setActiveView("requests")}
                />
                <MobileTabItem
                  active={activeView === "bookings"}
                  label="Bookings"
                  count={upcomingBookingsCount}
                  onClick={() => setActiveView("bookings")}
                />
                <MobileTabItem
                  active={activeView === "services"}
                  label="Services"
                  onClick={() => setActiveView("services")}
                />
                <div className="w-2 shrink-0" />
              </div>
            </div>

            <div className="mt-6">
              {/* VIEW: OVERVIEW */}
              {activeView === "overview" && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {!isProfileComplete && (
                    <div className="md:hidden rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-amber-900">
                        <AlertCircle size={16} />
                        <span className="text-xs font-bold uppercase tracking-wide">
                          Action needed
                        </span>
                      </div>
                      <p className="text-sm text-amber-800">
                        Finish your profile so clients can find and book you.
                      </p>
                      <div className="mt-3">
                        <Link
                          href="/dashboard/profile/edit?incomplete=1"
                          className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50 no-underline hover:no-underline"
                        >
                          Finish setup
                        </Link>
                      </div>
                    </div>
                  )}

                  {loading && !bookings.length && !bookingRequests.length && !services.length && !dashboardStats ? (
                    <LoadingSkeleton lines={12} />
                  ) : (
                    <>
                      {/* Action cards */}
                      {(pendingQuoteCount > 0 || unreadRequestsCount > 0) && (
                        <section className="grid gap-4 sm:grid-cols-2">
                          {pendingQuoteCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setActiveView("requests")}
                              className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50/50 p-5 text-left transition-transform active:scale-[0.98] hover:bg-blue-50"
                            >
                              <div>
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                                    Action required
                                  </p>
                                </div>
                                <p className="text-lg font-bold text-gray-900">
                                  {pendingQuoteCount} Quote request{pendingQuoteCount !== 1 && "s"}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Clients are waiting for your price.
                                </p>
                              </div>
                              <ChevronRight size={20} className="text-blue-400" />
                            </button>
                          )}
                          {unreadRequestsCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setActiveView("requests")}
                              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-transform active:scale-[0.98] hover:border-black"
                            >
                              <div>
                                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                                  Inbox
                                </p>
                                <p className="text-lg font-bold text-gray-900">
                                  {unreadRequestsCount} Unread message{unreadRequestsCount !== 1 && "s"}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Reply fast to secure bookings.
                                </p>
                              </div>
                              <ChevronRight size={20} className="text-gray-300" />
                            </button>
                          )}
                        </section>
                      )}

                      {/* Next event */}
                      <section>
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                            Up next
                          </h3>
                        </div>
                        {primaryBooking ? (
                          <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_2px_10px_rgb(0,0,0,0.03)]">
                            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                              <div className="flex flex-col items-start gap-5 sm:flex-row">
                                <div className="min-w-[90px] rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4">
                                  <div className="text-center">
                                    <div className="text-xs font-bold uppercase text-gray-400">
                                      {format(new Date(primaryBooking.start_time), "MMM")}
                                    </div>
                                    <div className="text-3xl font-bold text-gray-900">
                                      {format(new Date(primaryBooking.start_time), "d")}
                                    </div>
                                  </div>
                                </div>
                                <div className="pt-1">
                                  <h4 className="line-clamp-2 text-xl font-bold text-gray-900">
                                    {primaryBooking.service?.title || "Booking"}
                                  </h4>
                                  <p className="mt-1 line-clamp-1 text-sm font-medium text-gray-600">
                                    {primaryBooking.client
                                      ? `${primaryBooking.client.first_name} ${primaryBooking.client.last_name}`
                                      : "Client"}
                                  </p>
                                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
                                    <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1">
                                      <Clock size={12} />
                                      {format(new Date(primaryBooking.start_time), "h:mm a")}
                                    </span>
                                    <span
                                      style={statusChipStyles(primaryBooking.status)}
                                      className="rounded-full px-2 py-1 text-[10px] font-bold uppercase"
                                    >
                                      {formatStatus(primaryBooking.status)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex w-full items-end gap-3 md:w-auto md:flex-col">
                                <Link
                                  href={`/dashboard/events/${primaryBooking.id}`}
                                  className="w-full rounded-xl bg-black px-6 py-3 text-center text-sm font-bold text-white transition-transform active:scale-95 md:w-auto no-underline hover:no-underline"
                                >
                                  View details
                                </Link>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                            <p className="text-sm font-medium text-gray-500">
                              No upcoming events scheduled.
                            </p>
                          </div>
                        )}
                      </section>

                      {/* Stats */}
                      <section>
                        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">
                          This month
                        </h3>
                        <StatGrid
                          columns={2}
                          items={[
                            {
                              label: "Earnings",
                              value: formatCurrency(earningsThisMonth),
                              icon: <TrendingUp size={16} />,
                            },
                            {
                              label: "New inquiries",
                              value: dashboardStats?.monthly_new_inquiries ?? 0,
                              hint: `${dashboardStats?.response_rate ?? 0}% response rate`,
                            },
                            { label: "Upcoming gigs", value: upcomingBookingsCount },
                            { label: "Profile views", value: dashboardStats?.profile_views ?? 0 },
                          ]}
                        />
                      </section>
                    </>
                  )}
                </div>
              )}

              {/* VIEW: REQUESTS */}
              {activeView === "requests" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SectionHeader
                    title="Requests"
                    subtitle="Reply quickly and send quotes."
                    action={
                      <Link
                        href="/inbox"
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 no-underline hover:no-underline"
                      >
                        Open inbox
                      </Link>
                    }
                  />
                  <ErrorBoundary onRetry={fetchAll}>
                    <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                      <RequestsSection
                        hideHeader
                        requests={bookingRequests}
                        loading={loading}
                        error={error || undefined}
                        onRetry={fetchAll}
                      />
                    </React.Suspense>
                  </ErrorBoundary>
                </div>
              )}

              {/* VIEW: BOOKINGS */}
              {activeView === "bookings" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SectionHeader
                    title="Bookings"
                    subtitle="Confirmed upcoming events."
                    action={
                      <Link
                        href="/dashboard/bookings"
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 no-underline hover:no-underline"
                      >
                        View all
                      </Link>
                    }
                  />
                  <BookingsSection
                    hideHeader
                    bookings={bookings}
                    loading={loading}
                    error={error || undefined}
                    onRetry={fetchAll}
                  />
                </div>
              )}

              {/* VIEW: SERVICES */}
              {activeView === "services" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <SectionHeader
                    title="Services"
                    subtitle="Manage what you offer."
                    action={
                      <button
                        type="button"
                        onClick={openAddService}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 sm:w-auto"
                      >
                        <Plus size={18} /> Add service
                      </button>
                    }
                  />
                  <ErrorBoundary onRetry={fetchAll}>
                    <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                      <ServicesSection
                        hideHeader
                        services={services}
                        loading={servicesLoading}
                        error={error || undefined}
                        onRetry={fetchAll}
                        onReorder={reorderServices}
                        onAdd={openAddService}
                        onEdit={openEditService}
                        onDelete={deleteServiceById}
                      />
                    </React.Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* --- Modals --- */}
      
      {showCompleteProfileModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Complete Profile Required</h3>
            <p className="mt-2 text-sm text-gray-600">You need to fill in these details before adding services:</p>
            <ul className="mt-4 space-y-2">
              {missingFields.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle size={14} /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowCompleteProfileModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => router.push('/dashboard/profile/edit?incomplete=1')} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-gray-800">Go to Profile</button>
            </div>
          </div>
        </div>
      )}

      {selectorOpen && (
        <AddServiceCategorySelector
          isOpen={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          onSelect={(cat) => setWizardCategory(cat)}
        />
      )}

      {WizardComponent && (
        <WizardComponent
          isOpen={wizardOpen}
          service={editingService ?? undefined}
          onClose={() => {
            setWizardOpen(false);
            setWizardComponent(null);
            setEditingService(null);
            setWizardCategory(null);
          }}
          onServiceSaved={(svc) => {
            editingService ? upsertService(svc) : upsertService(svc);
            setWizardOpen(false);
            setWizardComponent(null);
            setEditingService(null);
            setWizardCategory(null);
          }}
        />
      )}
    </MainLayout>
  );
}
