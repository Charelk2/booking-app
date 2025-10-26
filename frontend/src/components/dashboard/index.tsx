// frontend/src/components/dashboard/index.tsx
'use client';

import React, {
  Fragment,
  useState,
  useMemo,
  type ReactNode,
  type SVGProps,
} from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Dialog, Transition } from '@headlessui/react';
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
} from '@heroicons/react/24/outline';
import './dashboard.css';

import { BookingRequest, ServiceProviderProfile } from '@/types';
import { formatStatus } from '@/lib/utils';
import { statusChipClass } from '@/components/ui/status';
import { Avatar } from '../ui';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import {
  updateBookingRequestArtist, // keeping original API name
  postMessageToBookingRequest,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// AddServiceCategorySelector

interface Category {
  id: string;
  label: string;
  Icon: React.ComponentType<SVGProps<SVGSVGElement>>;
}

const categories: Category[] = [
  { id: 'musician', label: 'Musician', Icon: MusicalNoteIcon },
  { id: 'dj', label: 'DJ', Icon: SpeakerWaveIcon },
  { id: 'photographer', label: 'Photographer', Icon: CameraIcon },
  { id: 'videographer', label: 'Videographer', Icon: VideoCameraIcon },
  { id: 'speaker', label: 'Speaker', Icon: MegaphoneIcon },
  { id: 'sound_service', label: 'Sound Service', Icon: SparklesIcon },
  { id: 'wedding_venue', label: 'Wedding Venue', Icon: HomeModernIcon },
  { id: 'caterer', label: 'Caterer', Icon: CakeIcon },
  { id: 'bartender', label: 'Bartender', Icon: BeakerIcon },
  { id: 'mc_host', label: 'MC & Host', Icon: MicrophoneIcon },
];

interface AddServiceCategorySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
}

export function AddServiceCategorySelector({
  isOpen,
  onClose,
  onSelect,
}: AddServiceCategorySelectorProps) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
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

        <Dialog.Panel className="relative z-10 flex h-full w-full flex-col bg-white">
          <div className="flex items-center justify-between p-6">
            <Dialog.Title className="text-2xl font-semibold">Booka</Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-20">
            <h2 className="mb-28 text-center text-4xl font-bold">Choose your line of work</h2>
            <div className="grid grid-cols-5 grid-rows-2 gap-4">
              {categories.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`category-${id}`}
                  onClick={() => {
                    onSelect(id);
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center rounded border p-4 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <Icon className="mb-2 h-8 w-8" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>
    </Transition>
  );
}

// ---------------------------------------------------------------------------
// BookingRequestCard

export interface BookingRequestCardProps {
  req: BookingRequest;
}

export function BookingRequestCard({ req }: BookingRequestCardProps) {
  const { user } = useAuth();
  const isServiceProvider = user?.user_type === 'service_provider';

  // Avatar
  const avatarSrc = isServiceProvider
    ? req.client?.profile_picture_url || req.client?.user_type ? req.client?.profile_picture_url : null
    : (
        req.service_provider_profile?.profile_picture_url ??
        req.service_provider?.profile_picture_url ??
        req.service_provider?.user?.profile_picture_url ??
        null
      );

  // Display name
  const displayName = isServiceProvider
    ? (req.client ? `${req.client.first_name} ${req.client.last_name}` : 'Unknown Client')
    : (
        req.service_provider_profile?.business_name ||
        (req.service_provider ? `${req.service_provider.first_name ?? ''} ${req.service_provider.last_name ?? ''}`.trim() : 'Unknown Service Provider')
      );

  const formattedDate = format(new Date(req.created_at), 'dd MMM yyyy');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar src={avatarSrc} initials={displayName.charAt(0)} size={48} className="w-12 h-12" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
            <div className="mt-0.5 text-sm text-gray-600 truncate">{req.service?.title || '—'}</div>
            <div className="mt-1 text-xs text-gray-500">Requested {formattedDate}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span
            data-testid="status-chip"
            className={clsx(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              statusChipClass(req.status)
            )}
          >
            {formatStatus(req.status)}
          </span>
          <div className="mt-2">
            <Link
              href={`/booking-requests/${req.id}`}
              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Manage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardTabs

interface Tab {
  id: 'bookings' | 'services' | 'requests';
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface DashboardTabsProps {
  tabs?: Tab[];
  active: 'bookings' | 'services' | 'requests';
  onChange: (id: 'bookings' | 'services' | 'requests') => void;
  variant?: 'underline' | 'segmented';
}

export function DashboardTabs({
  tabs = [],
  active,
  onChange,
  variant = 'underline',
}: DashboardTabsProps) {
  if (tabs.length === 0) return null;

  if (variant === 'segmented') {
    return (
      <div className="sticky top-0 z-30 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto w-full">
          <div className="mx-auto inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {tabs.map((tab) => {
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChange(tab.id)}
                  className={clsx(
                    'relative inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm',
                    isActive ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={clsx(
                        'ml-1 inline-flex items-center justify-center rounded-full px-2 text-xs',
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 bg-gray-50 border-b">
      <div className="flex text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 px-4 py-2 flex items-center justify-center space-x-1 ${
              active === tab.id
                ? 'text-gray-900 border-b-2 border-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 text-xs text-gray-600">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileSaveBar

interface MobileSaveBarProps {
  onSave: () => void;
  isSaving?: boolean;
}

export function MobileSaveBar({ onSave, isSaving = false }: MobileSaveBarProps) {
  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 sm:hidden bg-white border-t p-2 flex justify-end">
      <Button onClick={onSave} isLoading={isSaving} fullWidth>
        Save Changes
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverviewCard / Section

interface OverviewCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  className?: string;
}

export function OverviewCard({ label, value, icon, className }: OverviewCardProps) {
  return (
    <div className={clsx('flex items-center space-x-3 p-4 rounded-lg bg-white border border-gray-200 shadow-sm', className)}>
      <div className="text-brand-dark">{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-lg font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

interface Stat {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

interface OverviewSectionProps {
  primaryStats: Stat[];
  secondaryStats?: Stat[];
}

export function OverviewSection({ primaryStats, secondaryStats = [] }: OverviewSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {primaryStats.map((s) => (
          <OverviewCard key={s.label} label={s.label} value={s.value} icon={s.icon ?? null} />
        ))}
      </div>
      {secondaryStats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t pt-4">
          {secondaryStats.map((s) => (
            <OverviewCard key={s.label} label={s.label} value={s.value} icon={s.icon ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile completeness

export function computeProfileCompleteness(stepsCompleted: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.round((stepsCompleted / totalSteps) * 100);
}

interface ProfileCompletenessProps {
  stepsCompleted: number;
  totalSteps: number;
}

export function ProfileCompleteness({ stepsCompleted, totalSteps }: ProfileCompletenessProps) {
  const percentage = useMemo(() => computeProfileCompleteness(stepsCompleted, totalSteps), [stepsCompleted, totalSteps]);
  return (
    <div className="w-full" data-testid="profile-completeness-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" data-testid="profile-completeness">
        <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile progress (provider profile)

const fields: (keyof ServiceProviderProfile)[] = [
  'business_name',
  'description',
  'location',
  'profile_picture_url',
  'cover_photo_url',
];

export function computeProfileCompletion(profile?: Partial<ServiceProviderProfile>): number {
  if (!profile) return 0;
  let filled = 0;
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i];
    filled += profile[key] ? 1 : 0;
  }
  return Math.round((filled / fields.length) * 100);
}

interface ProfileProgressProps {
  profile: Partial<ServiceProviderProfile> | null;
}

export function ProfileProgress({ profile }: ProfileProgressProps) {
  const percentage = useMemo(() => computeProfileCompletion(profile || undefined), [profile]);
  return (
    <div className="w-full" data-testid="profile-progress-wrapper">
      <div className="flex justify-between text-sm mb-1">
        <span>Profile Completion</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5" data-testid="profile-progress">
        <div className="bg-brand-secondary h-2.5 rounded-full progress-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickActionButton

interface QuickActionButtonProps {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function QuickActionButton({ label, href, onClick, icon, className }: QuickActionButtonProps) {
  const content = <span className="flex items-center gap-1">{icon}{label}</span>;
  const baseClass = clsx('bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-3 rounded-lg text-sm font-medium transition', className);
  if (href) {
    return (
      <Link href={href} className={baseClass} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={baseClass} onClick={onClick}>
      {content}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SectionList

interface SectionListProps<T> {
  title: string;
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyState: React.ReactNode;
  footer?: React.ReactNode;
}

export function SectionList<T>({ title, data, renderItem, emptyState, footer }: SectionListProps<T>) {
  return (
    <section className="border border-gray-200 rounded-md shadow-sm">
      <h2 className="px-4 py-2 text-lg font-medium">{title}</h2>
      <div className="px-4 pb-4">
        {data.length === 0 ? (
          <div className="text-sm text-gray-500 py-2">{emptyState}</div>
        ) : (
          <ul className="space-y-2 mt-2">
            {data.map((item, i) => (
              <li key={i}>{renderItem(item)}</li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// UpdateRequestModal

interface UpdateRequestModalProps {
  isOpen: boolean;
  request: BookingRequest;
  onClose: () => void;
  onUpdated: (req: BookingRequest) => void;
}

export function UpdateRequestModal({
  isOpen,
  request,
  onClose,
  onUpdated,
}: UpdateRequestModalProps) {
  const [status, setStatus] = useState(request.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // keep existing API function name used in your codebase
      const res = await updateBookingRequestArtist(request.id, { status });
      if (note.trim()) {
        const cid = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
          ? (crypto as any).randomUUID()
          : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
        await postMessageToBookingRequest(request.id, { content: note.trim() }, { clientRequestId: cid });
      }
      onUpdated(res.data);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center transition-opacity">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white transform transition-transform duration-200">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Update Request</h3>
          <form onSubmit={handleSubmit} className="mt-2 px-7 py-3 space-y-4 text-left">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as BookingRequest['status'])}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand focus:border-brand sm:text-sm"
              >
                <option value="pending_quote">Pending Quote</option>
                <option value="quote_provided">Quote Provided</option>
                <option value="request_declined">Declined</option>
              </select>
            </div>
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700">Note to client</label>
              <textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand focus:border-brand sm:text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="items-center px-4 py-3 space-x-2 text-right">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
