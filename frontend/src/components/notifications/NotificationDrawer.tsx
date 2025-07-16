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
        <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-30" />
          <motion.div
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            transition={{ type: 'tween' }}
            className="fixed right-0 top-0 h-full w-80 bg-white/60 backdrop-blur-lg rounded-l-2xl shadow-lg flex flex-col"
          >
            <header className="flex items-center border-b bg-white/60 backdrop-blur-lg px-4 py-3">
              <h2 className="flex-1 text-lg font-bold">Notifications</h2>
              <div className="flex-1 flex justify-center items-center gap-4">
                <label className="flex items-center gap-1">
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
                    className="text-sm hover:underline"
                    type="button"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <button onClick={onClose} aria-label="Close notifications" type="button">
                <XMarkIcon className="w-5 h-5 text-gray-500 hover:text-gray-700" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))}
              {loading && <Spinner />}
              {error && <AlertBanner variant="error">{error?.message}</AlertBanner>}
            </div>
            <footer className="sticky bottom-0 bg-white/60 backdrop-blur-lg p-4 border-t flex justify-between">
              {hasMore && (
                <button onClick={loadMore} className="text-sm hover:underline" type="button">
                  Load more
                </button>
              )}
              <button onClick={clearAll} className="px-4 py-1 rounded-full bg-red-100 text-red-700 text-sm" type="button">
                Clear All
              </button>
            </footer>
          </motion.div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
