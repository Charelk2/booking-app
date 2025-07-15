'use client';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import useNotifications from '@/hooks/useNotifications';
import NotificationItem from './NotificationItem';
import Spinner from '../ui/Spinner';
import AlertBanner from '../ui/AlertBanner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({ isOpen, onClose }: Props) {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const toggleUnreadOnly = () => setUnreadOnly((v) => !v);

  const filtered = unreadOnly
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-30" />
          <motion.div
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            transition={{ type: 'tween' }}
            className="fixed right-0 top-0 h-full w-80 bg-white rounded-l-2xl shadow-lg flex flex-col"
          >
            <header className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={toggleUnreadOnly}
                  />
                  <span className="text-sm">Unread only</span>
                </label>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-indigo-600 hover:underline"
                    type="button"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} aria-label="Close notifications" type="button">
                  <XMarkIcon className="w-5 h-5 text-gray-500 hover:text-gray-700" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))}
              {loading && <Spinner className="mt-4" />}
              {error && (
                <AlertBanner variant="error" className="mt-2">
                  {error?.message}
                </AlertBanner>
              )}
            </div>
            {notifications.length > 20 && (
              <footer className="p-4 border-t text-center">
                <Link href="/notifications" className="text-indigo-600 hover:underline">
                  View all notifications
                </Link>
              </footer>
            )}
          </motion.div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
