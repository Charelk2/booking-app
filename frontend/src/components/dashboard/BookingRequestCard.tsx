'use client';

import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MicrophoneIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline';
import { BookingRequest } from '@/types';
import { formatStatus } from '@/lib/utils';
import { Avatar } from '../ui';

const getBadgeClass = (status: string): string => {
  if (
    status.includes('declined') ||
    status.includes('rejected') ||
    status.includes('withdrawn')
  ) {
    return 'status-badge-declined';
  }
  if (status.includes('confirmed') || status.includes('accepted')) {
    return 'status-badge-confirmed';
  }
  if (status === 'pending_quote') {
    return 'status-badge-pending-quote';
  }
  if (status.includes('quote')) {
    return 'status-badge-quote-provided';
  }
  if (status.includes('pending')) {
    return 'status-badge-pending-action';
  }
  return 'status-badge-pending-quote';
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
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-lg bg-gray-50 border border-gray-200 shadow-sm">
      <div className="flex gap-4 items-center">
        <Avatar
          src={avatarSrc}
          initials={clientName.charAt(0)}
          size={48}
          className="bg-blue-100 w-12 h-12"
        />
        <div>
          <div className="font-bold text-gray-800">{clientName}</div>
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
      <div className="flex flex-col items-end gap-2 mt-3 sm:mt-0">
        <span className={getBadgeClass(req.status)}>{formatStatus(req.status)}</span>
        <Link
          href={`/booking-requests/${req.id}`}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-md bg-brand-primary hover:opacity-90 text-white font-semibold transition shadow-md"
        >
          Manage
        </Link>
      </div>
    </div>
  );
}
