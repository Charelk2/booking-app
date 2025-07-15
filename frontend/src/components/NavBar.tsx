'use client';
import { useState } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import NotificationDrawer from './notifications/NotificationDrawer';
import useNotifications, { NotificationsProvider } from '@/hooks/useNotifications';

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const toggleDrawer = () => setOpen((v) => !v);

  return (
    <nav className="flex items-center justify-between p-4 bg-white shadow">
      <div className="text-lg font-bold">Booking App</div>
      <div className="relative">
        <button onClick={toggleDrawer} className="relative p-2" type="button">
          <BellIcon className="w-6 h-6 text-gray-600 hover:text-gray-800" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 w-4 h-4 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
      <NotificationDrawer isOpen={open} onClose={toggleDrawer} />
    </nav>
  );
}

export function NavBarWithProvider({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <NavBar />
      {children}
    </NotificationsProvider>
  );
}
