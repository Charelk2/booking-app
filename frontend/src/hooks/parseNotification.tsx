import {
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline';
import type { Notification } from '@/types';
import React from 'react';

export interface ParsedNotification {
  icon: React.ReactElement;
  title: string;
  subtitle: string;
}

function truncate(text: string, len = 50): string {
  if (!text) return '';
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

export default function parseNotification(n: Notification): ParsedNotification {
  switch (n.type) {
    case 'new_message':
      const match = n.message.match(/^New message from ([^:]+):\s*/i);
      return {
        icon: <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-600" />,
        title: n.sender_name ?? match?.[1]?.trim() ?? 'New message',
        subtitle: truncate(
          n.message
            .replace(/^New message from ([^:]+):\s*/i, '')
            .replace(/^New message:\s*/i, '')
            .trim(),
        ),
      };
    case 'message_thread_notification':
      return {
        icon: <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-600" />,
        title: n.sender_name ?? 'Message thread',
        subtitle: truncate(n.message),
      };
    case 'new_booking_request':
      return {
        icon: <CalendarDaysIcon className="w-5 h-5 text-indigo-600" />,
        title: n.sender_name ?? 'Booking request',
        subtitle: truncate(
          n.booking_type
            ? `sent a new booking request for ${n.booking_type}`
            : n.message,
        ),
      };
    case 'booking_status_updated':
      return {
        icon: <CheckCircleIcon className="w-5 h-5 text-indigo-600" />,
        title: 'Booking updated',
        subtitle: truncate(n.message),
      };
    case 'quote_accepted':
      return {
        icon: <CheckCircleIcon className="w-5 h-5 text-indigo-600" />,
        title: 'Quote Accepted',
        subtitle: truncate(n.message),
      };
    case 'new_booking':
      return {
        icon: <CheckCircleIcon className="w-5 h-5 text-indigo-600" />,
        title: 'Booking Confirmed',
        subtitle: truncate(n.message),
      };
    case 'review_request':
      return {
        icon: <BellAlertIcon className="w-5 h-5 text-indigo-600" />,
        title: 'Review Request',
        subtitle: truncate(n.message),
      };
    default:
      return {
        icon: <BellAlertIcon className="w-5 h-5 text-indigo-600" />,
        title:
          (n.type as string)
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || 'Notification',
        subtitle: truncate(n.message),
      };
  }
}
