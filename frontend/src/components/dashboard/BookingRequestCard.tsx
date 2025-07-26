'use client';

import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ChatBubbleLeftEllipsisIcon,
  ArrowPathIcon,
  CalendarIcon,
  MicrophoneIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline';
import { BookingRequest, User } from '@/types';
import { formatStatus } from '@/lib/utils';
import { Avatar } from '../ui';

const STATUS_COLORS: Record<'pending' | 'quoted' | 'booked' | 'declined', string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  booked: 'bg-brand-light text-brand-dark',
  declined: 'bg-red-100 text-red-800',
};

const getStatusColor = (status: string): string => {
  if (status.includes('declined') || status.includes('rejected') || status.includes('withdrawn')) {
    return STATUS_COLORS.declined;
  }
  if (status.includes('confirmed') || status.includes('accepted')) {
    return STATUS_COLORS.booked;
  }
  if (status !== 'pending_quote' && status.includes('quote')) {
    return STATUS_COLORS.quoted;
  }
  return STATUS_COLORS.pending;
};

export interface BookingRequestCardProps {
  req: BookingRequest;
  user: User;
  onUpdate: () => void;
}

export default function BookingRequestCard({
  req,
  user,
  onUpdate,
}: BookingRequestCardProps) {
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
        <div className="flex gap-2">
          <Link
            href={`/booking-requests/${req.id}`}
            className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm"
          >
            <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
            Chat
          </Link>
          {user.user_type === 'artist' && (
            <button
              type="button"
              onClick={onUpdate}
              className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Update
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
