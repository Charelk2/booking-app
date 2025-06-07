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
import { normalizeService } from "@/lib/utils";
import AddServiceModal from "@/components/dashboard/AddServiceModal";
import EditServiceModal from "@/components/dashboard/EditServiceModal";
import RecentActivity from "@/components/dashboard/RecentActivity";
import Link from "next/link";
import { motion, Reorder, useDragControls } from "framer-motion";
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
              ${service.price.toFixed(2)}
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
  // Future activity feed will populate this array with events
  const [events] = useState<unknown[]>([]);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [showAllBookings, setShowAllBookings] = useState(false);

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

  const visibleRequests = showAllRequests
    ? bookingRequests
    : bookingRequests.slice(0, 5);
  const visibleBookings = showAllBookings
    ? bookings
    : bookings.slice(0, 5);

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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(() => {
                const cards = [
                  <Link
                    key="bookings"
                    href="/bookings"
                    className="flex items-center justify-between gap-4 p-4 rounded-lg bg-white shadow-sm min-h-[64px] overflow-hidden cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
                  >
                    <div className="flex items-center space-x-2">
                      <span role="img" aria-label="calendar">
                        
                      </span>
                      <span className="text-sm font-medium text-gray-500">Total Bookings</span>
                    </div>
                    <span className="text-2xl font-semibold text-gray-900">{bookings.length}</span>
                  </Link>,
                ];
                if (user.user_type === "artist") {
                  cards.push(
                    <Link
                      key="services"
                      href={user ? `/services?artist=${user.id}` : '/services'}
                      className="flex items-center justify-between gap-4 p-4 rounded-lg bg-white shadow-sm min-h-[64px] overflow-hidden cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
                    >
                      <div className="flex items-center space-x-2">
                        <span role="img" aria-label="microphone"></span>
                        <span className="text-sm font-medium text-gray-500">Total Services</span>
                      </div>
                      <span className="text-2xl font-semibold text-gray-900">{servicesCount}</span>
                    </Link>,
                    servicesCount === 0 && (
                      <p className="text-xs text-gray-400 mt-2">No services added yet</p>
                    ),
                    <Link
                      key="earnings"
                      href="/earnings"
                      className="flex items-center justify-between gap-4 p-4 rounded-lg bg-white shadow-sm min-h-[64px] overflow-hidden cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
                    >
                      <div className="flex items-center space-x-2">
                        <span role="img" aria-label="money"></span>
                        <span className="text-sm font-medium text-gray-500">Total Earnings</span>
                      </div>
                      <span className="text-2xl font-semibold text-gray-900">
                        {'$' + totalEarnings.toFixed(2)}
                      </span>
                    </Link>,
                    totalEarnings === 0 && (
                      <p className="text-xs text-gray-400 mt-2">No earnings this month</p>
                    ),
                    <Link
                      key="earnings-month"
                      href="/earnings"
                      className="flex items-center justify-between gap-4 p-4 rounded-lg bg-white shadow-sm min-h-[64px] overflow-hidden cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
                    >
                      <div className="flex items-center space-x-2">
                        <span role="img" aria-label="calendar-money"></span>
                        <span className="text-sm font-medium text-gray-500">Earnings This Month</span>
                      </div>
                      <span className="text-2xl font-semibold text-gray-900">
                        {'$' + earningsThisMonth.toFixed(2)}
                      </span>
                    </Link>,
                    earningsThisMonth === 0 && (
                      <p className="text-xs text-gray-400 mt-2">No earnings yet</p>
                    )
                  );
                }
                return cards.map((card, i) => (
                  <motion.div
                    /* eslint react/no-array-index-key: 0 */
                    key={card.key || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.1 }}
                  >
                    {card}
                  </motion.div>
                ));
              })()}
            </div>
          </div>

          {user.user_type === "artist" && (
            <button
              type="button"
              onClick={() => setIsAddServiceModalOpen(true)}
              className="hidden sm:inline-flex bg-brand text-white text-base py-3 rounded-lg mt-4 shadow-md hover:bg-brand-dark"
            >
              Add Service
            </button>
          )}

          {/* Recent Activity */}
          <RecentActivity events={events} />

          {/* Booking Requests */}
          <details className="mt-8" open>
            <summary className="text-lg font-medium text-gray-900 cursor-pointer">
              Booking Requests
            </summary>
            {bookingRequests.length === 0 ? (
              <div className="mt-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <div className="text-sm text-gray-500 px-4 py-6 text-center">
                  No bookings yet
                </div>
              </div>
            ) : (
              <>
                <div className="sm:hidden mt-4 space-y-4">
                  {visibleRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white p-4 shadow rounded-lg"
                    >
                      <div className="font-medium text-gray-900">
                        {user.user_type === "artist"
                          ? `${req.client?.first_name} ${req.client?.last_name}`
                          : `${req.artist?.first_name} ${req.artist?.last_name}`}
                      </div>
                      <div className="text-sm text-gray-500">
                        {req.service?.title || "—"}
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
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block mt-4 overflow-x-auto">
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                      >
                        {user.user_type === "artist" ? "Client" : "Artist"}
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                      >
                        Service
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                      >
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {visibleRequests.map((req) => (
                      <tr key={req.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <div className="font-medium text-gray-900">
                            {user.user_type === "artist"
                              ? `${req.client?.first_name} ${req.client?.last_name}`
                              : `${req.artist?.first_name} ${req.artist?.last_name}`}
                          </div>
                          <Link
                            href={`/booking-requests/${req.id}`}
                            className="text-indigo-600 hover:underline text-sm"
                          >
                            View Chat
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {req.service?.title || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {req.status}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {new Date(req.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {bookingRequests.length > 5 && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllRequests((s) => !s)}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  {showAllRequests ? "Collapse" : "Show All"}
                </button>
              </div>
            )}
            </>
            )}
          </details>

          {/* Recent Bookings */}
          <details className="mt-8" open>
            <summary className="text-lg font-medium text-gray-900 cursor-pointer">
              Recent Bookings
            </summary>
            <div className="sm:hidden mt-4 space-y-4">
              {visibleBookings.map((booking) => (
                <div key={booking.id} className="bg-white p-4 shadow rounded-lg">
                  <div className="font-medium text-gray-900">
                    {booking.client.first_name} {booking.client.last_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {booking.service.title}
                  </div>
                  <div className="text-sm text-gray-500">
                    {format(new Date(booking.start_time), "MMM d, yyyy h:mm a")}
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        booking.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : booking.status === "cancelled"
                          ? "bg-red-100 text-red-800"
                          : booking.status === "confirmed"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {booking.status}
                    </span>
                    <span className="text-sm text-gray-500">
                      ${booking.total_price.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block mt-4 overflow-x-auto">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                    >
                      Client
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Service
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {visibleBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                              <span className="text-indigo-600 font-medium">
                                {booking.client.first_name[0]}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="font-medium text-gray-900">
                              {booking.client.first_name}{" "}
                              {booking.client.last_name}
                            </div>
                            <div className="text-gray-500">
                              {booking.client.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {booking.service.title}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {format(
                          new Date(booking.start_time),
                          "MMM d, yyyy h:mm a"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            booking.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : booking.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : booking.status === "confirmed"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {booking.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        ${booking.total_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {bookings.length > 5 && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAllBookings((s) => !s)}
                className="text-sm text-indigo-600 hover:underline"
              >
                {showAllBookings ? "Collapse" : "Show All"}
              </button>
            </div>
          )}
          </details>

          {/* Services (Artist Only) */}
          {user.user_type === "artist" && (
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">
                  Your Services
                </h2>
              </div>
              <Reorder.Group
                ref={listRef}
                axis="y"
                values={services}
                onReorder={handleReorder}
                layoutScroll
                className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
              <button
                type="button"
                onClick={() => setIsAddServiceModalOpen(true)}
                className="mt-4 w-full sm:hidden bg-brand text-white text-base py-3 rounded-lg shadow-md hover:bg-brand-dark"
              >
                Add Service
              </button>
            </div>
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
