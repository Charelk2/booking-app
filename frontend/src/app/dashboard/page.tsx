'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMyClientBookings,
  getMyArtistBookings,
  getArtistServices,
  getArtistProfileMe,
  getMyBookingRequests,
  getBookingRequestsForArtist,
  updateService,
  deleteService,
} from '@/lib/api';
import { format } from 'date-fns';
import { normalizeService } from '@/lib/utils';
import AddServiceModal from '@/components/dashboard/AddServiceModal';
import EditServiceModal from '@/components/dashboard/EditServiceModal';
import RecentActivity from '@/components/dashboard/RecentActivity';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [events] = useState<{ id: string | number; timestamp: string; description: string }[]>([]);

  // Dashboard stats
  const servicesCount = services.length;
  const totalEarnings = bookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + b.total_price, 0);

  const displayedRequests = showAllRequests
    ? bookingRequests
    : bookingRequests.slice(0, 5);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        if (user.user_type === 'artist') {
          const [bData, sData, pData, rData] = await Promise.all([
            getMyArtistBookings(),
            getArtistServices(user.id),
            getArtistProfileMe(),
            getBookingRequestsForArtist(),
          ]);
          setBookings(bData.data);
          setServices(
            sData.data
              .map(normalizeService)
              .sort((a, b) => a.display_order - b.display_order)
          );
          setArtistProfile(pData.data);
          setBookingRequests(rData.data);
        } else {
          const [bData, rData] = await Promise.all([
            getMyClientBookings(),
            getMyBookingRequests(),
          ]);
          setBookings(bData.data);
          setBookingRequests(rData.data);
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, router]);

  const handleServiceAdded = (newService: Service) => {
    setServices((prev) =>
      [...prev, normalizeService(newService)].sort((a, b) => a.display_order - b.display_order)
    );
  };

  const handleServiceUpdated = (updated: Service) => {
    const norm = normalizeService(updated);
    setServices((prev) =>
      prev
        .map((s) => (s.id === norm.id ? norm : s))
        .sort((a, b) => a.display_order - b.display_order)
    );
  };

  const handleDeleteService = async (id: number) => {
    try {
      await deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const moveService = async (id: number, dir: 'up' | 'down') => {
    const sorted = [...services].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((s) => s.id === id);
    const ni = dir === 'up' ? idx - 1 : idx + 1;
    if (ni < 0 || ni >= sorted.length) return;
    const [item] = sorted.splice(idx, 1);
    sorted.splice(ni, 0, item);
    const updated = sorted.map((s, i) => ({ ...s, display_order: i + 1 }));
    setServices(updated);
    try {
      await Promise.all(
        updated.map((s) => updateService(s.id, { display_order: s.display_order }))
      );
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <p>Loading user...</p>
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin h-16 w-16 border-b-2 border-indigo-600 rounded-full" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-red-600">{error}</p>
        </div>
      </MainLayout>
    );
  }

  const showLocationPrompt = user.user_type === 'artist' && !artistProfile?.location;

  return (
    <MainLayout>
      <div className="px-4 py-6 space-y-6 overflow-auto">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {showLocationPrompt && (
          <div className="p-4 bg-yellow-50 rounded-md">
            <p className="text-yellow-800">
              Please add your location to your profile.{' '}
              <Link href="/dashboard/profile/edit" className="underline">
                Update now
              </Link>
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'bookings', href: '/bookings', icon: '🗓', label: 'Total Bookings', value: bookings.length },
            ...(user.user_type === 'artist'
              ? [
                  { key: 'services', href: '/services', icon: '🎤', label: 'Total Services', value: servicesCount },
                  { key: 'earnings', href: '/earnings', icon: '💰', label: 'Total Earnings', value: totalEarnings.toFixed(2) },
                ]
              : []),
          ].map(({ key, href, icon, label, value }, i) => (
            <Link href={href} key={key} className="block">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-5 bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
              >
                <dt className="flex items-center text-sm text-gray-500 space-x-2">
                  <span>{icon}</span>
                  <span>{label}</span>
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-gray-900">{value}</dd>
              </motion.div>
            </Link>
          ))}
        </div>

        {user.user_type === 'artist' && (
          <button
            onClick={() => router.push('/services/new')}
            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500"
          >
            Add Service
          </button>
        )}

        {/* Recent Activity */}
        <RecentActivity events={events} />

        {/* Booking Requests */}
        <section className="mt-8">
          <h2 className="text-lg font-medium">Booking Requests</h2>
          {bookingRequests.length === 0 ? (
            <div className="mt-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <div className="text-sm text-gray-500 px-4 py-6 text-center">No bookings yet</div>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold">{user.user_type === 'artist' ? 'Client' : 'Artist'}</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Service</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {displayedRequests.map((req) => (
                    <tr key={req.id}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{
                        user
