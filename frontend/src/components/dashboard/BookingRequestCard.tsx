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
  const avatarSrc = req.client?.profile_photo_url || '/default-avatar.png';
  const clientName = req.client
    ? `${req.client.first_name} ${req.client.last_name}`
    : 'Unknown Client';
  const ServiceIcon =
    req.service?.title === 'Live Musiek' ? MicrophoneIcon : MusicalNoteIcon;
  const formattedDate = format(new Date(req.created_at), 'dd MMM yyyy');

  return (
    <div className="flex justify-between rounded-lg bg-white shadow p-4">
      <div className="flex gap-4">
        <img
          src={avatarSrc}
          alt={clientName}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/default-avatar.png';
          }}
          className="w-12 h-12 rounded-full object-cover"
        />
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
        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
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
