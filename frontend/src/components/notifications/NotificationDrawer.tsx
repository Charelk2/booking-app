'use client';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
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
    loadMore,
    hasMore,
  } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const clearAll = async () => {
    await Promise.all(notifications.map((n) => deleteNotification(n.id)));
  };

  const toggleUnreadOnly = () => setUnreadOnly((v) => !v);

  const filtered = unreadOnly
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          open={isOpen}
          onClose={onClose}
          className="fixed inset-0 z-50 flex justify-end"
        >
          <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-30" />
          <Dialog.Panel
            as={motion.div}
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            transition={{ type: 'tween' }}
            className="h-full w-96 bg-white/60 backdrop-blur-md rounded-l-3xl shadow-2xl border border-white/20 flex flex-col"
          >
            <header className="flex items-center px-4 py-3 border-b border-white/20 bg-white/60 backdrop-blur-md">
              <h2 className="text-lg font-bold flex-1">Notifications</h2>
              <div className="flex flex-1 justify-center items-center gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={toggleUnreadOnly}
                    className="rounded"
                  />
                  <span>Unread</span>
                </label>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="hover:underline" type="button">
                    Mark all read
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close notifications"
                type="button"
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={markAsRead}
                />
              ))}
              {loading && <Spinner />}
              {error && <AlertBanner variant="error">{error?.message}</AlertBanner>}
            </div>
            <footer className="sticky bottom-0 bg-white/60 backdrop-blur-md px-4 py-4 border-t border-white/20 flex justify-between items-center">
              <button
                onClick={clearAll}
                className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm hover:bg-red-200"
                type="button"
              >
                Clear All
              </button>
              {hasMore && (
                <button onClick={loadMore} className="text-sm hover:underline" type="button">
                  Load more
                </button>
              )}
            </footer>
          </Dialog.Panel>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
