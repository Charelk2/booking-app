'use client';

import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MicrophoneIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline';
import { BookingRequest, User } from '@/types';
import { formatStatus } from '@/lib/utils';
import { Avatar } from '../ui';

const STATUS_COLORS: Record<
  'pending' | 'pendingAction' | 'quoted' | 'booked' | 'declined',
  string
> = {
  pending: 'bg-yellow-100 text-yellow-800',
  pendingAction: 'bg-orange-100 text-orange-800',
  quoted: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  booked: 'bg-brand-light text-brand-dark',
  declined: 'bg-red-100 text-red-800',
};

const getStatusColor = (status: string): string => {
  if (
    status.includes('declined') ||
    status.includes('rejected') ||
    status.includes('withdrawn')
  ) {
    return STATUS_COLORS.declined;
  }
  if (status.includes('confirmed') || status.includes('accepted')) {
    return STATUS_COLORS.booked;
  }
  if (status !== 'pending_quote' && status.includes('quote')) {
    return STATUS_COLORS.quoted;
  }
  if (status !== 'pending_quote' && status.includes('pending')) {
    return STATUS_COLORS.pendingAction;
  }
  return STATUS_COLORS.pending;
};

export interface BookingRequestCardProps {
  req: BookingRequest;
}

export default function BookingRequestCard({ req }: BookingRequestCardProps) {
  const avatarSrc = req.client?.profile_picture_url || null;
  const clientName = req.client
    ? `${req.client.first_name} ${req.client.last_name}`
    : 'Unknown Client';
  const ServiceIcon =
    req.service?.title === 'Live Musiek' ? MicrophoneIcon : MusicalNoteIcon;
  const formattedDate = format(new Date(req.created_at), 'dd MMM yyyy');

  return (
    <div className="flex justify-between rounded-lg bg-white shadow p-4">
      <div className="flex gap-4">
        <Avatar src={avatarSrc} initials={clientName.charAt(0)} size={48} />
        <div>
          <div className="font-bold text-gray-900">{clientName}</div>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <ServiceIcon className="w-4 h-4" />
            <span>{req.service?.title || '—'}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <CalendarIcon className="w-4 h-4" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
            req.status,
          )}`}
        >
          {formatStatus(req.status)}
        </span>
        <Link
          href={`/booking-requests/${req.id}`}
          className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm"
        >
          Manage Request
        </Link>
      </div>
    </div>
  );
}
