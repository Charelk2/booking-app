"use client";

import React, { Fragment, useState, useMemo, type SVGProps } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format } from "date-fns";
import { Dialog, Transition } from "@headlessui/react";
import {
  XMarkIcon,
  MusicalNoteIcon,
  CameraIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  MegaphoneIcon,
  SparklesIcon,
  HomeModernIcon,
  CakeIcon,
  BeakerIcon,
  MicrophoneIcon,
  CalendarIcon,
  PlusIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  WalletIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

import { Avatar, Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import type { BookingRequest, ArtistProfile } from "@/types";
import { formatStatus } from "@/lib/utils";

// ---------------------------------------------------------------------------
// StatCard

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

export const StatCard = ({ label, value, icon }: StatCardProps) => (
  <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-between transition-shadow duration-200 hover:shadow-lg">
    <div>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
    <div className="text-brand-primary p-3 bg-brand-primary/10 rounded-full">
      {icon}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ProfileProgress

const fields: (keyof ArtistProfile)[] = [
  "business_name",
  "description",
  "location",
  "profile_picture_url",
  "cover_photo_url",
];

export const computeProfileCompletion = (
  profile?: Partial<ArtistProfile>,
): number => {
  if (!profile) return 0;
  const filled = fields.reduce(
    (acc, key) => acc + (profile[key] ? 1 : 0),
    0,
  );
  return Math.round((filled / fields.length) * 100);
};

interface ProfileProgressProps {
  profile: Partial<ArtistProfile> | null;
}

export const ProfileProgress = ({ profile }: ProfileProgressProps) => {
  const percentage = useMemo(
    () => computeProfileCompletion(profile || undefined),
    [profile],
  );
  return (
    <div className="w-full" data-testid="profile-progress-wrapper">
      <div className="flex justify-between text-sm mb-2">
        <span>Complete Your Profile</span>
        <span>{percentage}%</span>
      </div>
      <div
        className="w-full bg-gray-200 rounded-full h-2.5"
        data-testid="profile-progress"
      >
        <div
          className="bg-brand-secondary h-2.5 rounded-full progress-bar-fill transition-all duration-500 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BookingRequestCard

interface BookingRequestCardProps {
  req: BookingRequest;
}

const getBadgeClass = (status: string): string => {
  const mapping: Record<string, string> = {
    pending_quote: "status-badge-pending-quote bg-orange-100 text-orange-800",
    pending_artist_confirmation:
      "status-badge-pending-action bg-orange-100 text-orange-800",
    quote_provided: "status-badge-quote-provided bg-blue-100 text-blue-800",
    request_confirmed: "status-badge-confirmed bg-green-100 text-green-800",
    request_declined: "status-badge-declined bg-red-100 text-red-800",
  };
  return mapping[status] ?? "status-badge-default bg-gray-100 text-gray-800";
};

export const BookingRequestCard = ({ req }: BookingRequestCardProps) => {
  const { user } = useAuth();
  const isUserArtist = user?.user_type === "service_provider";
  const displayName = isUserArtist
    ? req.client?.first_name || "Unknown Client"
    : req.artist_profile?.business_name || req.artist?.first_name || "Unknown Artist";

  const avatarSrc = isUserArtist
    ? req.client?.profile_picture_url || null
    : req.artist_profile?.profile_picture_url || null;

  const ServiceIcon =
    req.service?.title === "Live Musiek" ? MicrophoneIcon : MusicalNoteIcon;
  const formattedDate = format(new Date(req.created_at), "dd MMM yyyy");

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl bg-white border border-gray-100 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex gap-4 items-center">
        <Avatar
          src={avatarSrc ?? undefined}
          alt={displayName}
          initials={displayName.charAt(0)}
          size={64}
        />
        <div>
          <div className="font-semibold text-xl text-gray-900">{displayName}</div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <ServiceIcon className="w-4 h-4" />
            <span>{req.service?.title || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <CalendarIcon className="w-4 h-4" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start sm:items-end gap-2 mt-4 sm:mt-0">
        <span
          className={clsx(
            "px-3 py-1 text-xs font-semibold rounded-full",
            getBadgeClass(req.status),
          )}
        >
          {formatStatus(req.status)}
        </span>
        <Link href={`/booking-requests/${req.id}`}>
          <Button
            variant="secondary"
            className="flex items-center gap-2"
          >
            Manage <ArrowRightIcon className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AddServiceCategorySelector

interface Category {
  id: string;
  label: string;
  Icon: React.ComponentType<SVGProps<SVGSVGElement>>;
}

const categories: Category[] = [
  { id: "musician", label: "Musician", Icon: MusicalNoteIcon },
  { id: "dj", label: "DJ", Icon: SpeakerWaveIcon },
  { id: "photographer", label: "Photographer", Icon: CameraIcon },
  { id: "videographer", label: "Videographer", Icon: VideoCameraIcon },
  { id: "speaker", label: "Speaker", Icon: MegaphoneIcon },
  { id: "event_service", label: "Event Service", Icon: SparklesIcon },
  { id: "wedding_venue", label: "Wedding Venue", Icon: HomeModernIcon },
  { id: "caterer", label: "Caterer", Icon: CakeIcon },
  { id: "bartender", label: "Bartender", Icon: BeakerIcon },
  { id: "mc_host", label: "MC & Host", Icon: MicrophoneIcon },
];

interface AddServiceCategorySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}

export const AddServiceCategorySelector = ({
  isOpen,
  onClose,
  onSelect,
}: AddServiceCategorySelectorProps) => (
  <Transition show={isOpen} as={Fragment}>
    <Dialog onClose={onClose} className="fixed inset-0 z-50 overflow-y-auto">
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 z-0 bg-black/30" />
      </Transition.Child>

      <div className="flex min-h-full items-center justify-center p-4">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Dialog.Panel className="relative w-full max-w-4xl rounded-3xl bg-white p-8 shadow-2xl" role="dialog">
            <div className="flex items-center justify-between pb-4">
              <Dialog.Title className="text-2xl font-bold text-gray-900">
                Choose your line of work
              </Dialog.Title>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mt-6">
              {categories.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`category-${id}`}
                  onClick={() => {
                    onSelect(id);
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-6 border rounded-xl transition-all duration-200 hover:bg-gray-50 hover:border-brand-primary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <div className="mb-3 text-brand-primary/80">
                    <Icon className="h-10 w-10" />
                  </div>
                  <span className="font-semibold text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </Dialog>
  </Transition>
);

// ---------------------------------------------------------------------------
// Main Dashboard Page

export function DashboardPage() {
  const { user, artistProfile } = useAuth();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const artistName = artistProfile?.business_name || user?.first_name || "Artist";

  const overviewStats = [
    { label: "Total Bookings", value: 12, icon: <BriefcaseIcon className="w-6 h-6" /> },
    { label: "Earnings This Month", value: "$1,250", icon: <WalletIcon className="w-6 h-6" /> },
    { label: "Pending Requests", value: 3, icon: <CalendarDaysIcon className="w-6 h-6" /> },
  ];

  const pendingRequests: BookingRequest[] = [
    {
      id: 1,
      status: "pending_quote",
      created_at: new Date().toISOString(),
      client: { id: 1, first_name: "Jane", last_name: "Doe", profile_picture_url: null } as any,
      service: { id: 1, title: "Live Musician" } as any,
      artist: { id: 1, first_name: "Test", last_name: "Artist", user_type: "service_provider" } as any,
    },
    {
      id: 2,
      status: "quote_provided",
      created_at: new Date().toISOString(),
      client: { id: 2, first_name: "John", last_name: "Smith", profile_picture_url: null } as any,
      service: { id: 2, title: "Photographer" } as any,
      artist: { id: 1, first_name: "Test", last_name: "Artist", user_type: "service_provider" } as any,
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
        <header className="py-6 px-4 sm:px-8 bg-white border-b border-gray-100 shadow-sm">
          <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>
        </header>

        <main className="py-8 px-4 sm:px-8 container mx-auto space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col sm:flex-row items-center sm:items-start gap-8">
            <Avatar
              src={artistProfile?.profile_picture_url ?? undefined}
              alt={artistName}
              initials={artistName.charAt(0)}
              size={96}
            />
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                Welcome, {artistName}!
              </h2>
              <p className="text-gray-500 mb-6">
                Here's a quick look at your account activity.
              </p>

              <div className="max-w-md mx-auto sm:mx-0">
                <ProfileProgress profile={artistProfile} />
              </div>

              <div className="mt-6 flex flex-wrap gap-4 justify-center sm:justify-start">
                <Link href="/profile-editor">
                  <Button
                    variant="primary"
                    className="flex items-center gap-2"
                  >
                    Edit Profile <ArrowRightIcon className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  className="flex items-center gap-2"
                  onClick={() => setIsCategoryModalOpen(true)}
                >
                  <PlusIcon className="w-4 h-4" /> Add a Service
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {overviewStats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Pending Requests</h3>
            <div className="space-y-4">
              {pendingRequests.length > 0 ? (
                pendingRequests.map((req) => (
                  <BookingRequestCard key={req.id} req={req} />
                ))
              ) : (
                <div className="p-8 bg-white rounded-2xl shadow-sm border text-center text-gray-500">
                  <p>You're all caught up! No pending requests at the moment.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <AddServiceCategorySelector
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSelect={(categoryId) => console.log(categoryId)}
      />
    </>
  );
}

export default DashboardPage;

