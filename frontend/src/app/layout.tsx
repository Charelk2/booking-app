import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/hooks/useNotifications';
import './globals.css';


const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Service Provider Booking App',
  description: 'Book your favorite artists for services',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <NotificationsProvider>
            {children}
            <Toaster position="top-right" />
          </NotificationsProvider>
        </AuthProvider>
        <div id="modal-root"></div>

      </body>
    </html>
  );
}
