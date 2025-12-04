// frontend/src/app/dashboard/artist/page.tsx
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
  Settings, 
  Plus, 
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2
} from "lucide-react";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { Booking, Service } from "@/types";
import { deleteService, getGoogleCalendarStatus } from "@/lib/api";
import { formatCurrency, formatStatus } from "@/lib/utils";
import { categorySlug } from "@/lib/categoryMap";

// Components
import { AddServiceCategorySelector, UpdateRequestModal } from "@/components/dashboard";
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
    className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
      active
        ? "bg-black text-white shadow-sm"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={18} className={active ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
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

const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="mb-6 flex items-end justify-between border-b border-gray-100 pb-4">
    <div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
    {action}
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
  const [requestToUpdate, setRequestToUpdate] = useState<any | null>(null);
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean>(false);
  
  // Dynamic Imports for Wizards
  type WizardProps = { isOpen: boolean; onClose: () => void; onServiceSaved: (svc: Service) => void; service?: Service };
  const [WizardComponent, setWizardComponent] = useState<ComponentType<WizardProps> | null>(null);

  // Data Fetching
  const { 
    loading, 
    error, 
    fetchAll, 
    bookings, 
    services, 
    artistProfile, 
    bookingRequests, 
    dashboardStats, 
    setBookingRequests, 
    upsertService, 
    removeService, 
    reorderServices 
  } = useArtistDashboardData(user?.id);

  // --- Dynamic Wizard Loader ---
  const wizardLoaders: Record<string, () => Promise<{ default: ComponentType<WizardProps> }>> = {
    musician: () => import("@/components/dashboard/add-service/AddServiceModalMusician"),
    photographer: () => import("@/components/dashboard/add-service/AddServiceModalPhotographer"),
    dj: () => import("@/components/dashboard/add-service/AddServiceModalDJ"),
    sound_service: () => import("@/components/dashboard/add-service/AddServiceModalSoundService"),
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

  // --- Effect: Sync URL & Handle Add Param ---
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

  // --- Effect: Calendar Status ---
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

  // --- Derived State (Profile Completeness) ---
  const missingFields = useMemo(() => {
    const p = artistProfile;
    const list: string[] = [];
    if (!p) return list;
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

  // --- Derived State (Stats) ---
  const upcomingBookingsCount = useMemo(() => bookings.filter(b => new Date(b.start_time).getTime() >= Date.now() && b.status !== "cancelled").length, [bookings]);
  const pendingQuoteCount = useMemo(() => bookingRequests.filter(r => r.status === "pending_quote").length, [bookingRequests]);
  const unreadRequestsCount = useMemo(() => bookingRequests.filter(r => r.is_unread_by_current_user).length, [bookingRequests]);
  
  const earningsThisMonth = useMemo(() => {
    const now = new Date();
    return bookings
      .filter(b => b.status === "completed" && new Date(b.start_time).getMonth() === now.getMonth() && new Date(b.start_time).getFullYear() === now.getFullYear())
      .reduce((acc, b) => acc + b.total_price, 0);
  }, [bookings]);

  const primaryBooking = useMemo(() => {
    if (!bookings.length) return null;
    const now = Date.now();
    const sorted = [...bookings].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return sorted.find(b => new Date(b.start_time).getTime() >= now && b.status !== "cancelled") || sorted[sorted.length - 1] || null;
  }, [bookings]);

  // --- Auth Guard ---
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push(`/auth?intent=login&next=${encodeURIComponent(pathname)}`);
    else if (user.user_type !== "service_provider") router.push("/dashboard/client");
  }, [user, authLoading, router, pathname]);

  // --- Handlers ---
  const handleServiceAction = (action: 'add' | 'edit' | 'delete', service?: Service) => {
    if (action === 'delete' && service) {
      deleteService(service.id).then(() => removeService(service.id)).catch(console.error);
      return;
    }
    if (!isProfileComplete) {
      setShowCompleteProfileModal(true);
      return;
    }
    if (action === 'add') {
      setEditingService(null);
      setSelectorOpen(true);
    } else if (action === 'edit' && service) {
      setEditingService(service);
      const slug = service.service_category_slug || (service.service_category?.name ? categorySlug(service.service_category.name) : null);
      if (slug) setWizardCategory(slug);
      else setSelectorOpen(true);
    }
  };

  // --- Loading / Error ---
  if (!user || authLoading) return <MainLayout><div className="flex h-screen items-center justify-center"><Spinner /></div></MainLayout>;
  if (loading && activeView === 'overview') return <MainLayout><div className="flex h-screen items-center justify-center"><Spinner /></div></MainLayout>;

  // --- Render ---

  return (
    <MainLayout>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:flex-row md:px-8">
        
        {/* === LEFT SIDEBAR === */}
        <aside className="w-full shrink-0 md:w-64">
          <div className="sticky top-24 space-y-8">
            
            {/* User Snippet */}
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                {user.first_name?.[0]}{user.last_name?.[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{artistProfile?.business_name || user.first_name}</p>
                <p className="truncate text-xs text-gray-500">Artist Dashboard</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              <SidebarItem 
                active={activeView === 'overview'} 
                icon={LayoutDashboard} 
                label="Overview" 
                onClick={() => setActiveView('overview')} 
              />
              <SidebarItem 
                active={activeView === 'requests'} 
                icon={MessageSquare} 
                label="Requests" 
                count={pendingQuoteCount + unreadRequestsCount}
                onClick={() => setActiveView('requests')} 
              />
              <SidebarItem 
                active={activeView === 'bookings'} 
                icon={Calendar} 
                label="Bookings" 
                count={upcomingBookingsCount}
                onClick={() => setActiveView('bookings')} 
              />
              <SidebarItem 
                active={activeView === 'services'} 
                icon={Briefcase} 
                label="Services" 
                onClick={() => setActiveView('services')} 
              />
            </nav>

            {/* Profile Status Widget */}
            {!isProfileComplete && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-amber-800">
                  <AlertCircle size={16} />
                  <span className="text-xs font-bold uppercase tracking-wide">Setup Required</span>
                </div>
                <p className="mb-3 text-xs text-amber-700">
                  Complete your profile to start accepting bookings.
                </p>
                <Link 
                  href="/dashboard/profile/edit?incomplete=1"
                  className="block w-full rounded-lg bg-white py-2 text-center text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
                >
                  Finish Setup
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* === MAIN CONTENT AREA === */}
        <main className="min-w-0 flex-1">
          
          {/* VIEW: OVERVIEW */}
          {activeView === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <SectionHeader 
                title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.first_name}`} 
                subtitle="Here's what's happening with your business today."
              />

              {/* Top Cards: Tasks */}
              {(pendingQuoteCount > 0 || unreadRequestsCount > 0) && (
                <section className="grid gap-4 md:grid-cols-2">
                  {pendingQuoteCount > 0 && (
                    <button onClick={() => setActiveView('requests')} className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 p-4 text-left transition-colors hover:bg-blue-100">
                      <div>
                        <p className="font-bold text-blue-900">{pendingQuoteCount} pending quote{pendingQuoteCount !== 1 && 's'}</p>
                        <p className="text-xs text-blue-700">Clients are waiting for your price.</p>
                      </div>
                      <ChevronRight size={18} className="text-blue-400" />
                    </button>
                  )}
                  {unreadRequestsCount > 0 && (
                     <button onClick={() => setActiveView('requests')} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-black">
                      <div>
                        <p className="font-bold text-gray-900">{unreadRequestsCount} unread message{unreadRequestsCount !== 1 && 's'}</p>
                        <p className="text-xs text-gray-500">Fast replies improve booking rates.</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300" />
                    </button>
                  )}
                </section>
              )}

              {/* Next Event */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Up Next</h3>
                </div>
                {primaryBooking ? (
                   <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center justify-center rounded-xl bg-gray-100 px-4 py-3 min-w-[80px]">
                            <span className="text-xs font-bold uppercase text-gray-500">{format(new Date(primaryBooking.start_time), "MMM")}</span>
                            <span className="text-2xl font-bold text-gray-900">{format(new Date(primaryBooking.start_time), "d")}</span>
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">{primaryBooking.service?.title || "Booking"}</h4>
                            <p className="text-sm font-medium text-gray-600">
                              {primaryBooking.client ? `${primaryBooking.client.first_name} ${primaryBooking.client.last_name}` : "Client"}
                            </p>
                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                              <Clock size={14} />
                              {format(new Date(primaryBooking.start_time), "h:mm a")}
                              <span>•</span>
                              <span style={statusChipStyles(primaryBooking.status)} className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                                {formatStatus(primaryBooking.status)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end gap-3 md:flex-col">
                           <Link href={`/dashboard/events/${primaryBooking.id}`} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white transition-transform hover:scale-105">
                             View Details
                           </Link>
                        </div>
                      </div>
                   </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                    <p className="text-sm text-gray-500">No upcoming events scheduled.</p>
                  </div>
                )}
              </section>

              {/* Stats */}
              <section>
                 <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Performance (This Month)</h3>
                 <StatGrid 
                    columns={2}
                    items={[
                      { label: "Earnings", value: formatCurrency(earningsThisMonth), icon: <TrendingUp size={16} /> },
                      { label: "New Inquiries", value: dashboardStats?.monthly_new_inquiries ?? 0, hint: `${dashboardStats?.response_rate ?? 0}% response rate` },
                      { label: "Upcoming Gigs", value: upcomingBookingsCount },
                      { label: "Profile Views", value: dashboardStats?.profile_views ?? 0 }
                    ]} 
                 />
              </section>
            </div>
          )}

          {/* VIEW: REQUESTS */}
          {activeView === 'requests' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SectionHeader title="Booking Requests" subtitle="Manage inquiries and send quotes." />
              <ErrorBoundary onRetry={fetchAll}>
                <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                  <RequestsSection requests={bookingRequests} loading={loading} error={error || undefined} onRetry={fetchAll} />
                </React.Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* VIEW: BOOKINGS */}
          {activeView === 'bookings' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SectionHeader title="Schedule" subtitle="Your confirmed upcoming and past events." />
              <BookingsSection bookings={bookings} loading={loading} error={error || undefined} onRetry={fetchAll} />
            </div>
          )}

          {/* VIEW: SERVICES */}
          {activeView === 'services' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
               <SectionHeader 
                  title="My Services" 
                  subtitle="Manage what you offer to clients." 
                  action={
                    <button 
                      onClick={() => handleServiceAction('add')}
                      className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-gray-800"
                    >
                      <Plus size={16} /> Add Service
                    </button>
                  }
               />
               <ErrorBoundary onRetry={fetchAll}>
                  <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                    <ServicesSection
                      services={services}
                      loading={loading}
                      error={error || undefined}
                      onRetry={fetchAll}
                      onReorder={reorderServices}
                      onAdd={() => handleServiceAction('add')}
                      onEdit={(s) => handleServiceAction('edit', s)}
                      onDelete={(id) => deleteService(id).then(() => removeService(id))}
                    />
                  </React.Suspense>
               </ErrorBoundary>
            </div>
          )}

        </main>
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

      {requestToUpdate && (
        <UpdateRequestModal
          isOpen={!!requestToUpdate}
          request={requestToUpdate}
          onClose={() => setRequestToUpdate(null)}
          onUpdated={(updated) => setBookingRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
        />
      )}
    </MainLayout>
  );
}