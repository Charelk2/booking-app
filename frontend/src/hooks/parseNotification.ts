import { ChatBubbleLeftRightIcon, CalendarDaysIcon, CheckCircleIcon, CurrencyDollarIcon, BellAlertIcon } from '@heroicons/react/24/outline';
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
      return {
        icon: <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-600" />,
        title: n.sender_name ?? 'New message',
        subtitle: truncate(n.message.replace(/^New message:\s*/i, '').trim()),
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
    case 'deposit_due':
      return {
        icon: <CurrencyDollarIcon className="w-5 h-5 text-indigo-600" />,
        title: 'Deposit Due',
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
        title: truncate(n.message || 'Notification'),
        subtitle: '',
      };
  }
}

