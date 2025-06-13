"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
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
  updateService,
  deleteService,
} from "@/lib/api";
import { format } from "date-fns";
import { formatCurrency, normalizeService } from "@/lib/utils";
import AddServiceModal from "@/components/dashboard/AddServiceModal";
import EditServiceModal from "@/components/dashboard/EditServiceModal";
import OverviewAccordion from "@/components/dashboard/OverviewAccordion";
import SectionList from "@/components/dashboard/SectionList";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import Link from "next/link";
import { Reorder, useDragControls } from "framer-motion";
import {
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { Bars3Icon } from "@heroicons/react/24/outline";

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
      className={`relative flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400 transition-colors ${pressing ? "select-none ring-2 ring-indigo-400 bg-indigo-50" : ""}`}
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
          className="p-1 text-indigo-600 hover:text-indigo-800"
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
  const { user } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(
    null
  );
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings' | 'services'>('requests');

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

  const visibleRequests = bookingRequests.slice(0, 5);
  const visibleBookings = bookings.slice(0, 5);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    const fetchDashboardData = async () => {
      try {
        if (user.user_type === "artist") {
          const [
            bookingsData,
            servicesDataResponse,
            artistProfileData,
            requestsData,
          ] = await Promise.all([
            getMyArtistBookings(),
            getArtistServices(user.id),
            getArtistProfileMe(),
            getBookingRequestsForArtist(),
          ]);
          setBookings(bookingsData.data);
          setBookingRequests(requestsData.data);

          const processedServices = servicesDataResponse.data
            .map((service: Service) => normalizeService(service))
            .sort((a, b) => a.display_order - b.display_order);
          setServices(processedServices);
          setArtistProfile(artistProfileData.data);
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
  }, [user, router]);

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
          <p>Loading user data or redirecting...</p>
        </div>
      </MainLayout>
    );
  }

  const showLocationPrompt =
    user.user_type === "artist" && artistProfile && !artistProfile.location;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
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
          <div className="mt-8">
            <OverviewAccordion
              primaryStats={[
                { label: 'Total Bookings', value: bookings.length },
                { label: 'Total Earnings', value: formatCurrency(totalEarnings) },
              ]}
              secondaryStats={[
                { label: 'Total Services', value: servicesCount },
                { label: 'Earnings This Month', value: formatCurrency(earningsThisMonth) },
              ]}
            />
          </div>

          {user.user_type === "artist" && activeTab === 'services' && (
            <button
              type="button"
              onClick={() => setIsAddServiceModalOpen(true)}
              className="hidden sm:inline-flex bg-brand text-white text-base py-3 rounded-lg mt-4 shadow-md hover:bg-brand-dark"
            >
              Add Service
            </button>
          )}

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
            <SectionList
              title="Booking Requests"
              data={visibleRequests}
              defaultOpen={false}
              emptyState={<span>No bookings yet</span>}
              renderItem={(req) => (
                <div key={req.id} className="bg-white p-4 shadow rounded-lg">
                  <div className="font-medium text-gray-900">
                    {user.user_type === 'artist'
                      ? `${req.client?.first_name} ${req.client?.last_name}`
                      :
                          req.artist?.business_name ||
                          `${req.artist?.first_name} ${req.artist?.last_name}`}
                  </div>
                  <div className="text-sm text-gray-500">
                    {req.service?.title || '—'}
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-gray-500">
                    <span>{req.status}</span>
                    <span>{new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                  <Link
                    href={`/booking-requests/${req.id}`}
                    className="mt-2 inline-block text-indigo-600 hover:underline text-sm"
                  >
                    View Chat
                  </Link>
                  {req.accepted_quote_id && (
                    <Link
                      href={`/quotes/${req.accepted_quote_id}`}
                      className="ml-4 mt-2 inline-block text-green-600 hover:underline text-sm"
                    >
                      Quote accepted
                    </Link>
                  )}
                </div>
              )}
            />
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
                    {booking.client.first_name} {booking.client.last_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {booking.service.title}
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
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {booking.status}
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
                    className="text-indigo-600 hover:underline text-sm"
                  >
                    View All Bookings
                  </Link>
                </div>
              )}
            </>
          )}
          {user.user_type === "artist" && activeTab === 'services' && (
            <details
              className="mt-8 border border-gray-200 rounded-md bg-white shadow-sm"
            >
              <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
                Your Services
              </summary>
              <div className="px-3 pb-3">
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
                <button
                  type="button"
                  onClick={() => setIsAddServiceModalOpen(true)}
                  className="mt-4 w-full sm:hidden bg-brand text-white text-base py-3 rounded-lg shadow-md hover:bg-brand-dark"
                >
                  Add Service
                </button>
              </div>
            </details>
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
    </MainLayout>
  );
}
