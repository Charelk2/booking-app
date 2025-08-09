"use client";

import React, { useEffect, useState, useRef, useMemo, type ComponentType } from "react";
import clsx from 'clsx';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Booking, Service, ArtistProfile, BookingRequest } from "@/types";
import {
  getMyArtistBookings,
  getArtistServices,
  getArtistProfileMe,
  getBookingRequestsForArtist,
  getDashboardStats,
  updateService,
  deleteService,
} from "@/lib/api";
import { format } from "date-fns";
import {
  formatCurrency,
  normalizeService,
  formatStatus,
  applyDisplayOrder,
} from "@/lib/utils";
import AddServiceCategorySelector from "@/components/dashboard/AddServiceCategorySelector";
import UpdateRequestModal from "@/components/dashboard/UpdateRequestModal";
import ProfileProgress from "@/components/dashboard/ProfileProgress";
import SectionList from "@/components/dashboard/SectionList";
import BookingRequestCard from "@/components/dashboard/BookingRequestCard";
import { Spinner, Button } from '@/components/ui';
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import QuickActionButton from "@/components/dashboard/QuickActionButton";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bars3Icon } from "@heroicons/react/24/outline";

interface WizardProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
}

const wizardLoaders: Record<string, () => Promise<{ default: ComponentType<WizardProps> }>> = {
  musician: () => import("@/components/dashboard/add-service/AddServiceModalMusician"),
  photographer: () => import("@/components/dashboard/add-service/AddServiceModalPhotographer"),
  dj: () => import("@/components/dashboard/add-service/AddServiceModalDJ"),
  event_service: () => import("@/components/dashboard/add-service/AddServiceModalEventService"),
  videographer: () => import("@/components/dashboard/add-service/AddServiceModalVideographer"),
  speaker: () => import("@/components/dashboard/add-service/AddServiceModalSpeaker"),
  wedding_venue: () => import("@/components/dashboard/add-service/AddServiceModalWeddingVenue"),
  caterer: () => import("@/components/dashboard/add-service/AddServiceModalCaterer"),
  bartender: () => import("@/components/dashboard/add-service/AddServiceModalBartender"),
  mc_host: () => import("@/components/dashboard/add-service/AddServiceModalMcHost"),
};

interface ServiceCardProps {
  service: Service;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  style?: React.CSSProperties;
  isDragging?: boolean;
  onEdit: (service: Service) => void;
  onDelete: (id: number) => void;
}

function ServiceCard({
  service,
  dragHandleProps,
  style,
  isDragging,
  onEdit,
  onDelete,
}: ServiceCardProps) {
  return (
    <div
      style={style}
      className={clsx(
        'relative p-4 rounded-xl bg-gray-50 border border-gray-200 shadow-md transition-shadow hover:shadow-lg active:shadow-lg focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2',
        isDragging && 'ring-2 ring-brand-light bg-brand-light',
      )}
    >
      <div
        className="absolute right-2 top-2 cursor-grab active:cursor-grabbing text-gray-400 touch-none z-10"
        aria-hidden="true"
        {...dragHandleProps}
      >
        <Bars3Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <h4 className="text-xl font-semibold mb-1 text-brand-primary">{service.title}</h4>
          <p className="text-sm text-gray-600 line-clamp-2">{service.description}</p>
          <p className="text-lg font-bold text-gray-800 mt-2">{formatCurrency(Number(service.price))}</p>
        </div>
        <div className="flex flex-col items-end gap-2 mt-3 sm:mt-0">
          <button
            type="button"
            onClick={() => onEdit(service)}
            className="text-sm text-brand-primary hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this service? This action cannot be undone.')) {
                onDelete(service.id);
              }
            }}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableServiceCard({ service, onEdit, onDelete }: { service: Service; onEdit: (s: Service) => void; onDelete: (id: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  } as React.CSSProperties;

  return (
    <div ref={setNodeRef} data-testid="service-item">
      <ServiceCard
        service={service}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
        style={style}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(
    null
  );
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState('');
  const [requestSort, setRequestSort] = useState<'newest' | 'oldest'>('newest');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestVisibleCount, setRequestVisibleCount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState<string | null>(null);
  const [WizardComponent, setWizardComponent] = useState<ComponentType<WizardProps> | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [requestToUpdate, setRequestToUpdate] = useState<BookingRequest | null>(null);

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
  const [dashboardStats, setDashboardStats] = useState<{ monthly_new_inquiries: number; profile_views: number; response_rate: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, router, pathname]);

  // Aggregated totals for dashboard statistics
  const servicesCount = services.length;
  const earningsThisMonth = bookings
    .filter((booking) => {
      if (booking.status !== "completed") return false;
      const date = new Date(booking.start_time);
      const now = new Date();
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    })
    .reduce((acc, booking) => acc + booking.total_price, 0);

  const statCards = useMemo(() => {
    return [
      { label: 'Total Bookings', value: bookings.length, color: 'text-brand-primary' },
      { label: 'New Inquiries', value: dashboardStats?.monthly_new_inquiries ?? 0, color: 'text-brand-accent' },
      { label: 'Total Services', value: servicesCount, color: 'text-brand-primary' },
      { label: 'Earnings This Month', value: formatCurrency(earningsThisMonth), color: 'text-brand-secondary' },
    ];
  }, [bookings.length, servicesCount, earningsThisMonth, dashboardStats]);

  const filteredRequests = useMemo(() => {
    const lower = requestSearch.toLowerCase();
    return bookingRequests.filter((r) => {
      const name = r.client
        ? `${r.client.first_name} ${r.client.last_name}`.toLowerCase()
        : '';
      const matchesSearch = name.includes(lower);
      const matchesStatus = !requestStatusFilter || r.status === requestStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bookingRequests, requestStatusFilter, requestSearch]);

  const visibleRequests = useMemo(() => {
    const sorted = filteredRequests.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return requestSort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
    return sorted.slice(0, requestVisibleCount);
  }, [filteredRequests, requestSort, requestVisibleCount]);

  const hasMoreRequests = filteredRequests.length > requestVisibleCount;
  const upcomingBookings = useMemo(() => {
    const now = new Date().getTime();
    return bookings
      .filter((b) => new Date(b.start_time).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      )
      .slice(0, 5);
  }, [bookings]);


  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== 'service_provider') {
      router.push('/dashboard/client');
      return;
    }

    const fetchDashboardData = async () => {
      try {
        const [
          bookingsData,
          servicesDataResponse,
          artistProfileData,
          requestsData,
          statsData,
        ] = await Promise.all([
          getMyArtistBookings(),
          getArtistServices(user.id),
          getArtistProfileMe(),
          getBookingRequestsForArtist(),
          getDashboardStats(),
        ]);
        setBookings(bookingsData.data);
        setBookingRequests(requestsData.data);

        const processedServices = servicesDataResponse.data
          .map((service: Service) => normalizeService(service))
          .sort((a, b) => a.display_order - b.display_order);
        setServices(processedServices);
        setArtistProfile(artistProfileData.data);
        setDashboardStats(statsData.data);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, authLoading, router, pathname]);

  const handleServiceAdded = (newService: Service) => {
    const processedService = normalizeService(newService);
    setServices((prevServices) =>
      [...prevServices, processedService].sort(
        (a, b) => a.display_order - b.display_order
      )
    );
  };

  const handleServiceUpdated = (updated: Service) => {
    const normalized = normalizeService(updated);
    setServices((prev) =>
      prev
        .map((s) => (s.id === normalized.id ? normalized : s))
        .sort((a, b) => a.display_order - b.display_order)
    );
  };

  const handleDeleteService = async (id: number) => {
    try {
      await deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Service delete error:", err);
      setError("Failed to delete service. Please try again.");
    }
  };

  const [isReordering, setIsReordering] = useState(false);
  const [showReorderHint, setShowReorderHint] = useState(false);
  const hintTimer = useRef<NodeJS.Timeout | null>(null);
  // Store the most recent drag order so we persist the correct sequence
  const latestOrderRef = useRef<Service[]>([]);

  const persistServiceOrder = async (ordered: Service[]) => {
    try {
      await Promise.all(
        ordered.map((s) =>
          updateService(s.id, { display_order: s.display_order })
        )
      );
    } catch (err) {
      console.error("Service reorder error:", err);
      setError(
        "Failed to update service order. Your changes may not be saved."
      );
    }
  };
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const handleDragStart = () => {
    setIsReordering(true);
    setShowReorderHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowReorderHint(false), 1500);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsReordering(false);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setServices((items) => {
      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      const updated = applyDisplayOrder(reordered);
      latestOrderRef.current = updated;
      persistServiceOrder(updated);
      return updated;
    });
  };

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
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand-dark"></div>
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
        <section className="bg-white rounded-xl shadow-custom p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Welcome back, {user.first_name || 'User'}!
          </h1>
          {user?.user_type === 'service_provider' && artistProfile && (
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
              <div className="w-full md:w-1/2">
                <ProfileProgress profile={artistProfile} />
              </div>
              <Button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setSelectorOpen(true);
                }}
                className="bg-brand-accent text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition shadow-md w-full md:w-auto"
              >
                Add New Service
              </Button>
            </div>
          )}
        </section>
        <div className="space-y-8">
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

          {/* Stats */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl shadow-custom p-5 text-center"
              >
                <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                <h2 className={`text-3xl font-bold ${stat.color}`}>{stat.value}</h2>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-xl shadow-custom p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <QuickActionButton label="⭐ Request Review" />
                <QuickActionButton label="📈 Boost a Service" />
                <QuickActionButton href="/dashboard/quotes" label="📄 View All Quotes" />
                <QuickActionButton href="/sound-providers" label="🎚 Sound Providers" />
                <QuickActionButton href="/quote-calculator" label="🧮 Quote Calculator" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-custom p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Response & Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-brand-primary text-xl">📊</div>
                  <div>
                    <p className="text-sm text-gray-500">Profile Views</p>
                    <p className="text-lg font-medium text-gray-800">{dashboardStats?.profile_views ?? 0}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-brand-primary text-xl">⏳</div>
                  <div>
                    <p className="text-sm text-gray-500">Avg. Response Time</p>
                    <p className="text-lg font-medium text-gray-800">2 hours</p>
                  </div>
                </div>
              </div>
            </div>
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
            />
          </div>

          {activeTab === 'requests' && (
            <section className="bg-white rounded-xl shadow-custom p-6 mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                Recent Booking Requests
              </h2>
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <input
                  type="text"
                  aria-label="Search by client name"
                  placeholder="Search by client name"
                  className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 flex-1"
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                />
                <select
                  aria-label="Sort requests"
                  data-testid="request-sort"
                  className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 bg-white focus:ring-brand-primary focus:border-brand-primary flex-1"
                  value={requestSort}
                  onChange={(e) =>
                    setRequestSort(e.target.value as 'newest' | 'oldest')
                  }
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <select
                  aria-label="Filter requests"
                  data-testid="request-status"
                  className="border border-gray-300 rounded-md p-2 text-sm text-gray-700 bg-white focus:ring-brand-primary focus:border-brand-primary flex-1"
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="pending_quote">Pending Quote</option>
                  <option value="quote_provided">Quote Provided</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <ul className="space-y-4">
                {visibleRequests.map((req) => (
                  <li key={req.id}>
                    <BookingRequestCard req={req} />
                  </li>
                ))}
                {visibleRequests.length === 0 && (
                  <li className="text-sm text-gray-500">No bookings yet</li>
                )}
              </ul>
              {hasMoreRequests && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setRequestVisibleCount((c) => c + 5)}
                    className="text-brand-primary hover:underline text-sm font-medium"
                  >
                    Load More
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === 'bookings' && (
            <>
              <SectionList
                title="Upcoming Bookings"
                data={upcomingBookings}
                defaultOpen={false}
                emptyState={<span>No bookings yet</span>}
                renderItem={(booking) => (
                  <div key={booking.id} className="bg-white p-4 shadow rounded-lg">
                  <div className="font-medium text-gray-900">
                    {booking.client?.first_name || 'Unknown'}{' '}
                    {booking.client?.last_name || ''}
                  </div>
                  <div className="text-sm text-gray-500">
                    {booking.service?.title || '—'}
                  </div>
                  <div className="text-sm text-gray-500">
                    {format(new Date(booking.start_time), 'MMM d, yyyy h:mm a')}
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        booking.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : booking.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : booking.status === 'confirmed'
                          ? 'bg-brand-light text-brand-dark'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {formatStatus(booking.status)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatCurrency(Number(booking.total_price))}
                    </span>
                  </div>
                </div>
                )}
              />
              {bookings.length > upcomingBookings.length && (
                <div className="mt-2">
                  <Link
                    href="/dashboard/bookings"
                    className="text-brand-dark hover:underline text-sm"
                  >
                    View All Bookings
                  </Link>
                </div>
              )}
            </>
          )}
          {user?.user_type === "service_provider" && activeTab === 'services' && (
            <section className="bg-white rounded-xl shadow-custom p-6 mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Services</h2>
              {isReordering && showReorderHint && (
                <div className="text-sm text-gray-600 mb-2" role="status">
                  Drag to reorder
                </div>
              )}
              {services.length === 0 ? (
                <p className="text-sm text-gray-500">No services yet</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={services.map((s) => s.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {services.map((service) => (
                        <SortableServiceCard
                          key={service.id}
                          service={service}
                          onEdit={(s) => {
                            setEditingService(s);
                            setWizardCategory('musician');
                          }}
                          onDelete={handleDeleteService}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <Button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setSelectorOpen(true);
                }}
                className="mt-4 sm:w-auto"
                fullWidth
              >
                Add Service
              </Button>
            </section>
          )}
        </div>
      </div>
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
