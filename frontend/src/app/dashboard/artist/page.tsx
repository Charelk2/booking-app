"use client";

import React, { useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { Service } from "@/types";
import { deleteService } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { categorySlug } from "@/lib/categoryMap";
import { AddServiceCategorySelector, UpdateRequestModal, DashboardTabs, QuickActionButton } from "@/components/dashboard";
import { Spinner } from "@/components/ui";
import StatGrid from "@/components/ui/StatGrid";
import Section from "@/components/ui/Section";
import Link from "next/link";
import OverviewHeader from "@/components/dashboard/artist/OverviewHeader";
import RequestsSection from "@/components/dashboard/artist/RequestsSection";
import BookingsSection from "@/components/dashboard/artist/BookingsSection";
import ServicesSection from "@/components/dashboard/artist/ServicesSection";
import { useArtistDashboardData } from "@/hooks/useArtistDashboardData";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { getGoogleCalendarStatus } from "@/lib/api";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState<string | null>(null);
  type WizardProps = { isOpen: boolean; onClose: () => void; onServiceSaved: (svc: Service) => void; service?: Service };
  const [WizardComponent, setWizardComponent] = useState<ComponentType<WizardProps> | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [requestToUpdate, setRequestToUpdate] = useState<any | null>(null);
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean>(false);

  const { loading, error, fetchAll, bookings, services, artistProfile, bookingRequests, dashboardStats, setBookingRequests, upsertService, removeService, reorderServices } = useArtistDashboardData(user?.id);

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
  const params = useSearchParams();
  const initialTab =
    params.get('tab') === 'bookings'
      ? 'bookings'
      : params.get('tab') === 'services'
        ? 'services'
        : 'requests';
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings' | 'services'>(initialTab);

  // Open a specific add-service wizard when arriving with ?addCategory=...
  useEffect(() => {
    const cat = params.get('addCategory');
    if (cat) {
      setActiveTab('services');
      setWizardCategory(cat);
    }
  }, [params]);

  useEffect(() => {
    // Keep URL in sync with tab without scrolling to top
    const params = new URLSearchParams(window.location.search);
    const currentTab = params.get('tab') || 'requests';
    if (currentTab !== activeTab) {
      params.set('tab', activeTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, router, pathname]);

  // Load calendar connection status to include in completion rule
  useEffect(() => {
    (async () => {
      try {
        const res = await getGoogleCalendarStatus();
        setCalendarConnected(!!res.data?.connected);
      } catch {
        setCalendarConnected(false);
      }
    })();
  }, []);

  // Profile completion guard (exclude bank details)
  const isProfileComplete = useMemo(() => {
    const p = artistProfile;
    if (!p) return false;
    if (typeof p.profile_complete === 'boolean') return p.profile_complete;
    const nonempty = (v?: string | null) => !!(v && String(v).trim());
    const validEmail = (v?: string | null) => !!(v && /.+@.+\..+/.test(v));
    const validPhoneZA = (v?: string | null) => !!(v && /^\+27\d{9}$/.test(v));
    const likelyUrl = (v?: string | null) => !!(v && /^(https?:\/\/)?[\w.-]+\.[A-Za-z]{2,}/.test(v));
    const hasSpecialties = Array.isArray(p.specialties) && p.specialties.some(Boolean);
    const hasPolicy = p.cancellation_policy === undefined || p.cancellation_policy === null ? true : nonempty(p.cancellation_policy as any);
    return (
      nonempty(p.business_name) &&
      nonempty(p.description || '') &&
      nonempty(p.location || '') &&
      validEmail((p as any).contact_email) &&
      validPhoneZA((p as any).contact_phone) &&
      likelyUrl((p as any).contact_website) &&
      hasSpecialties &&
      hasPolicy &&
      calendarConnected
    );
  }, [artistProfile, calendarConnected]);

  const missingFields = useMemo(() => {
    const p = artistProfile;
    const list: string[] = [];
    if (!p) return list;
    const nonempty = (v?: string | null) => !!(v && String(v).trim());
    const validEmail = (v?: string | null) => !!(v && /.+@.+\..+/.test(v));
    const validPhoneZA = (v?: string | null) => !!(v && /^\+27\d{9}$/.test(v));
    const likelyUrl = (v?: string | null) => !!(v && /^(https?:\/\/)?[\w.-]+\.[A-Za-z]{2,}/.test(v));
    if (!nonempty(p.business_name)) list.push('Business name');
    if (!nonempty(p.description || '')) list.push('Description');
    if (!nonempty(p.location || '')) list.push('Location');
    if (!validEmail((p as any).contact_email)) list.push('Email');
    if (!validPhoneZA((p as any).contact_phone)) list.push('Cell number');
    if (!likelyUrl((p as any).contact_website)) list.push('Website');
    const hasSpecialties = Array.isArray(p.specialties) && p.specialties.some(Boolean);
    if (!hasSpecialties) list.push('Specialties');
    // Policy optional in completion; remove if previously added.
    if (!calendarConnected) list.push('Calendar sync');
    return list;
  }, [artistProfile, calendarConnected]);

  // Aggregated totals for dashboard statistics
  const servicesCount = services.length;
  const earningsThisMonth = useMemo(() => {
    return bookings
      .filter((booking) => {
        if (booking.status !== "completed") return false;
        const date = new Date(booking.start_time);
        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((acc, booking) => acc + booking.total_price, 0);
  }, [bookings]);
  const statCards = useMemo(() => {
    return [
      { label: 'Total Bookings', value: bookings.length, color: 'text-brand-primary' },
      { label: 'New Inquiries', value: dashboardStats?.monthly_new_inquiries ?? 0, color: 'text-brand-accent' },
      { label: 'Total Services', value: servicesCount, color: 'text-brand-primary' },
      { label: 'Earnings This Month', value: formatCurrency(earningsThisMonth), color: 'text-brand-secondary' },
    ];
  }, [bookings.length, servicesCount, earningsThisMonth, dashboardStats]);
  // Section data derived in child components


  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== "service_provider") {
      router.push("/dashboard/client");
    }
  }, [user, authLoading, router, pathname]);

  const handleServiceAdded = (svc: Service) => upsertService(svc);
  const handleServiceUpdated = (svc: Service) => upsertService(svc);

  const handleDeleteService = async (id: number) => {
    try {
      await deleteService(id);
      removeService(id);
    } catch (err) {
      console.error("Service delete error:", err);
    }
  };
  // Reordering handled in ServicesSection via onReorder

  if (!user) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  const showLocationPrompt =
    user?.user_type === "service_provider" && artistProfile && !artistProfile.location;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-dark border-t-transparent"></div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-red-600">{error}</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-10 overflow-y-auto">
        <OverviewHeader
          user={user}
          profile={artistProfile}
          onAddService={() => {
            if (!isProfileComplete) { setShowCompleteProfileModal(true); return; }
            setEditingService(null);
            setSelectorOpen(true);
          }}
        />
        <div className="space-y-8">
          <StatGrid items={statCards.map((s) => ({ label: s.label, value: s.value }))} />
          {/* Location Prompt for Artists */}
          {showLocationPrompt && (
            <div className="mt-4 rounded-md bg-yellow-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Complete Your Profile
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      Please add your location to help clients discover your
                      services.
                      <Link
                        href="/dashboard/profile/edit"
                        className="font-medium underline text-yellow-800 hover:text-yellow-900 ml-1"
                      >
                        Update your profile now.
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Removed duplicate stats grid; StatGrid above is the single source */}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <Section title="Quick Actions">
              <div className="grid grid-cols-2 gap-3">
                <QuickActionButton label="Request Review" />
                <QuickActionButton label="Boost a Service" />
                <QuickActionButton href="/dashboard/quotes" label="View All Quotes" />
              </div>
            </Section>

            <Section title="Response & Activity">
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-600">Profile Views</p>
                  <p className="text-sm font-semibold text-gray-900">{dashboardStats?.profile_views ?? 0}</p>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-600">Avg. Response Time</p>
                  <p className="text-sm font-semibold text-gray-900">2 hours</p>
                </div>
              </div>
            </Section>
          </section>


          <div className="mt-4">
            <DashboardTabs
              tabs={[
                { id: 'requests', label: 'Requests' },
                { id: 'bookings', label: 'Bookings' },
                { id: 'services', label: 'Services' },
              ]}
              active={activeTab}
              onChange={setActiveTab}
              variant="segmented"
            />
          </div>

          {activeTab === 'requests' && (
            <ErrorBoundary onRetry={fetchAll}>
              <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                <RequestsSection requests={bookingRequests} loading={loading} error={error || undefined} onRetry={fetchAll} />
              </React.Suspense>
            </ErrorBoundary>
          )}

          {activeTab === 'bookings' && (
            <ErrorBoundary onRetry={fetchAll}>
              <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                <BookingsSection bookings={bookings} loading={loading} error={error || undefined} onRetry={fetchAll} />
              </React.Suspense>
            </ErrorBoundary>
          )}
          {user?.user_type === 'service_provider' && activeTab === 'services' && (
            <ErrorBoundary onRetry={fetchAll}>
              <React.Suspense fallback={<LoadingSkeleton lines={6} />}>
                {!isProfileComplete && (
                  <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                    <p className="text-sm text-yellow-800">Please complete your profile before adding a service. We need this info to display your service to clients.</p>
                    {missingFields.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-700">Missing: {missingFields.join(', ')}</p>
                    )}
                    <div className="mt-2">
                      <a href="/dashboard/profile/edit" className="text-xs text-yellow-900 underline hover:text-yellow-950">Go to profile</a>
                    </div>
                  </div>
                )}
                <ServicesSection
                  services={services}
                  loading={loading}
                  error={error || undefined}
                  onRetry={fetchAll}
                  onReorder={(ordered) => reorderServices(ordered)}
                  onAdd={() => {
                    if (!isProfileComplete) { setShowCompleteProfileModal(true); return; }
                    setEditingService(null);
                    setSelectorOpen(true);
                  }}
                  onEdit={(s) => {
                    setEditingService(s);
                    const slug =
                      s.service_category_slug ||
                      (s.service_category?.name
                        ? categorySlug(s.service_category.name)
                        : null) ||
                      ((s as any)?.details?.travel_fee_policy ? 'sound_service' : null);
                    if (slug) {
                      setWizardCategory(slug);
                    } else {
                      setSelectorOpen(true);
                    }
                  }}
                  onDelete={handleDeleteService}
                />
              </React.Suspense>
            </ErrorBoundary>
          )}
        </div>
      </div>
      {showCompleteProfileModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCompleteProfileModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900">Please complete your profile</h3>
            <p className="mt-2 text-sm text-gray-700">We need a few details to display your service to clients.</p>
            {missingFields.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">Missing: {missingFields.join(', ')}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50" onClick={() => setShowCompleteProfileModal(false)}>Not now</button>
              <button type="button" className="px-3 py-2 text-sm rounded-md bg-brand-primary text-white hover:opacity-90" onClick={() => { setShowCompleteProfileModal(false); router.push('/dashboard/profile/edit?incomplete=1'); }}>Go to Profile</button>
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
            if (editingService) {
              handleServiceUpdated(svc);
            } else {
              handleServiceAdded(svc);
            }
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
          onUpdated={(updated) =>
            setBookingRequests((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r)),
            )
          }
        />
      )}
    </MainLayout>
  );
}
