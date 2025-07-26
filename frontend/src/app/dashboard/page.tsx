"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Booking, Service, ArtistProfile, BookingRequest } from "@/types";
import {
  getMyClientBookings,
  getMyArtistBookings,
  getArtistServices,
  getArtistProfileMe,
  getMyBookingRequests,
  getBookingRequestsForArtist,
  getDashboardStats,
  updateService,
  deleteService,
} from "@/lib/api";
import { format } from "date-fns";
import { formatCurrency, normalizeService, formatStatus } from "@/lib/utils";
import AddServiceModal from "@/components/dashboard/AddServiceModal";
import EditServiceModal from "@/components/dashboard/EditServiceModal";
import UpdateRequestModal from "@/components/dashboard/UpdateRequestModal";
import ProfileCompleteness from "@/components/dashboard/ProfileCompleteness";
import OverviewCard from "@/components/dashboard/OverviewCard";
import SectionList from "@/components/dashboard/SectionList";
import BookingRequestCard from "@/components/dashboard/BookingRequestCard";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { Spinner, Button } from '@/components/ui';
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import Link from "next/link";
import { Reorder, useDragControls } from "framer-motion";
import {
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import {
  Bars3Icon,
  CalendarDaysIcon,
  EyeIcon,
  MusicalNoteIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

interface ServiceCardProps {
  service: Service;
  dragConstraints: React.RefObject<HTMLDivElement>;
  onEdit: (service: Service) => void;
  onDelete: (id: number) => void;
  onDragEnd: () => void;
}

function ServiceCard({
  service,
  dragConstraints,
  onEdit,
  onDelete,
  onDragEnd,
}: ServiceCardProps) {
  const dragControls = useDragControls();
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [pressing, setPressing] = useState(false);

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.persist();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setPressing(true);
    pressTimer.current = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      dragControls.start(event);
    }, 300);
  };

  const cancelDrag = (event?: React.PointerEvent) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (event) {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(
        event.pointerId
      );
    }
    setPressing(false);
  };

  const handleDragEndItem = () => {
    cancelDrag();
    onDragEnd();
  };

  return (
    <Reorder.Item
      key={service.id}
      value={service}
      onDragEnd={handleDragEndItem}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={dragConstraints}
      data-testid="service-item"
      className={`relative flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 hover:border-gray-400 transition-colors ${pressing ? "select-none ring-2 ring-brand-light bg-brand-light" : ""}`}
    >
      <div
        className="absolute right-2 top-2 cursor-grab active:cursor-grabbing text-gray-400 touch-none"
        aria-hidden="true"
        onPointerDown={startDrag}
        onPointerUp={cancelDrag}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Bars3Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          <p className="text-sm font-medium text-gray-900">{service.title}</p>
          <p className="truncate text-sm text-gray-500">{service.description}</p>
          <p className="text-xs text-gray-500">{service.service_type}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">
              {formatCurrency(Number(service.price))}
            </span>
            <span className="text-sm text-gray-500">{service.duration_minutes} min</span>
          </div>
        </div>
      </div>
      <div className="sm:ml-4 flex items-center space-x-2">
        <button
          type="button"
          className="p-1 text-brand-dark hover:text-brand-dark"
          onClick={() => onEdit(service)}
          aria-label="Edit"
        >
          <PencilIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="p-1 text-red-600 hover:text-red-800"
          onClick={() => {
            if (
              window.confirm('Delete this service? This action cannot be undone.')
            ) {
              onDelete(service.id);
            }
          }}
          aria-label="Delete"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </Reorder.Item>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState<BookingRequest | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings' | 'services'>('requests');
  const [dashboardStats, setDashboardStats] = useState<{ monthly_new_inquiries: number; profile_views: number; response_rate: number } | null>(null);

  // Aggregated totals for dashboard statistics
  const servicesCount = services.length;
  const totalEarnings = bookings
    .filter((booking) => booking.status === "completed")
    .reduce((acc, booking) => acc + booking.total_price, 0);
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

  const overviewCards = useMemo(() => {
    const cards: { label: string; value: string | number; icon: React.ReactNode }[] = [
      { label: 'Total Bookings', value: bookings.length, icon: <CalendarDaysIcon className="w-5 h-5" /> },
    ];
    if (user?.user_type === 'artist') {
      cards.push(
        { label: 'Total Services', value: servicesCount, icon: <MusicalNoteIcon className="w-5 h-5" /> },
        { label: 'Earnings This Month', value: formatCurrency(earningsThisMonth), icon: <BanknotesIcon className="w-5 h-5" /> },
      );
      if (dashboardStats) {
        cards.push({ label: 'Profile Views', value: dashboardStats.profile_views, icon: <EyeIcon className="w-5 h-5" /> });
      }
    }
    return cards.slice(0, 4);
  }, [bookings.length, user, servicesCount, earningsThisMonth, dashboardStats]);

  const visibleRequests = useMemo(() => {
    const filtered = bookingRequests.filter(
      (r) => !requestStatusFilter || r.status === requestStatusFilter,
    );
    const sorted = filtered.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return requestSort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
    return sorted.slice(0, 5);
  }, [bookingRequests, requestStatusFilter, requestSort]);
  const visibleBookings = bookings.slice(0, 5);

  const profileFields: (keyof ArtistProfile)[] = [
    'business_name',
    'description',
    'location',
    'profile_picture_url',
    'cover_photo_url',
  ];
  const profileStepsCompleted = profileFields.reduce(
    (acc, key) => acc + (artistProfile && (artistProfile as any)[key] ? 1 : 0),
    0,
  );
  const totalProfileSteps = profileFields.length;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        if (user?.user_type === "artist") {
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
        } else {
          const [bookingsData, requestsData] = await Promise.all([
            getMyClientBookings(),
            getMyBookingRequests(),
          ]);
          setBookings(bookingsData.data);
          setBookingRequests(requestsData.data);
        }
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
    }
  };

  const [isReordering, setIsReordering] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const persistServiceOrder = async (ordered: Service[]) => {
    try {
      await Promise.all(
        ordered.map((s) =>
          updateService(s.id, { display_order: s.display_order })
        )
      );
    } catch (err) {
      console.error("Service reorder error:", err);
    }
  };

  const handleReorder = (newOrder: Service[]) => {
    const updated = newOrder.map((s, i) => ({ ...s, display_order: i + 1 }));
    setServices(updated);
    setIsReordering(true);
  };

  const handleDragEnd = () => {
    if (isReordering) {
      setIsReordering(false);
      persistServiceOrder(services);
    }
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
    user?.user_type === "artist" && artistProfile && !artistProfile.location;

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
      <div className="px-4 py-4 space-y-4 overflow-y-auto">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        </div>
        {user?.user_type === 'artist' && artistProfile && (
          <div className="mx-auto max-w-7xl mt-4">
            <ProfileCompleteness
              stepsCompleted={profileStepsCompleted}
              totalSteps={totalProfileSteps}
            />
          </div>
        )}
        <div className="mx-auto max-w-7xl space-y-4">
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
          <div className="mt-8 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {overviewCards.map((card) => (
                <OverviewCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
              ))}
            </div>
            {user?.user_type === 'artist' && (
              <div className="space-x-4">
                <Link href="/dashboard/quotes" className="text-brand-dark hover:underline text-sm">
                  View All Quotes
                </Link>
                <Link href="/sound-providers" className="text-brand-dark hover:underline text-sm">
                  Sound Providers
                </Link>
                <Link href="/quote-calculator" className="text-brand-dark hover:underline text-sm">
                  Quote Calculator
                </Link>
              </div>
            )}
          </div>


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
            <>
              <div className="flex space-x-2 mb-2">
                <select
                  data-testid="request-sort"
                  value={requestSort}
                  onChange={(e) =>
                    setRequestSort(e.target.value as 'newest' | 'oldest')
                  }
                  aria-label="Sort requests"
                  className="border rounded-md p-1 text-sm"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
                <select
                  data-testid="request-status"
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  aria-label="Filter requests"
                  className="border rounded-md p-1 text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="pending_quote">Pending Quote</option>
                  <option value="quote_provided">Quote Provided</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <SectionList
                title="Booking Requests"
                data={visibleRequests}
                defaultOpen={false}
                emptyState={<span>No bookings yet</span>}
                renderItem={(req) => (
                  <BookingRequestCard key={req.id} req={req} />
                )}
                footer={
                  bookingRequests.length > visibleRequests.length ? (
                    <Link href="/booking-requests" className="text-brand-dark hover:underline text-sm">
                      View All Requests
                    </Link>
                  ) : null
                }
              />
            </>
          )}

          {activeTab === 'bookings' && (
            <>
              <SectionList
                title="Recent Bookings"
                data={visibleBookings}
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
              {bookings.length > visibleBookings.length && (
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
          {user?.user_type === "artist" && activeTab === 'services' && (
            <CollapsibleSection
              title="Your Services"
              open={servicesOpen}
              onToggle={() => setServicesOpen(!servicesOpen)}
              className="mt-8 border border-gray-200 rounded-md shadow-sm"
            >
              <div>
                {services.length === 0 ? (
                  <div className="text-sm text-gray-500 py-2">No services yet</div>
                ) : (
                  <Reorder.Group
                    ref={listRef}
                    axis="y"
                    values={services}
                    onReorder={handleReorder}
                    layoutScroll
                    className="mt-2 space-y-2"
                  >
                    {services.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        dragConstraints={listRef}
                        onEdit={(s) => setEditingService(s)}
                        onDelete={handleDeleteService}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </Reorder.Group>
                )}
                <Button
                  type="button"
                  onClick={() => setIsAddServiceModalOpen(true)}
                  className="mt-4 sm:w-auto"
                  fullWidth
                >
                  Add Service
                </Button>
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>
      <AddServiceModal
        isOpen={isAddServiceModalOpen}
        onClose={() => setIsAddServiceModalOpen(false)}
        onServiceAdded={handleServiceAdded}
      />
      {editingService && (
        <EditServiceModal
          isOpen={!!editingService}
          service={editingService}
          onClose={() => setEditingService(null)}
          onServiceUpdated={handleServiceUpdated}
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
