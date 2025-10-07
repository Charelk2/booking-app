import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
// Import directly from the TSX implementation to avoid re-export TDZ issues in Next/Flight
import { NotificationsProvider } from '@/hooks/useNotifications.tsx';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import MobileTelemetry from '@/components/analytics/MobileTelemetry';
import RouteProgress from '@/components/layout/RouteProgress';
import './globals.css';


const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Booka | Book Musicians, DJs & Event Pros in South Africa',
  description:
    'South Africa’s marketplace for live entertainment and event services. Browse vetted musicians, DJs & photographers; get quotes, chat, and pay securely.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
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
          <RealtimeProvider>
          <NotificationsProvider>
            <Suspense fallback={null}>
              <RouteProgress />
              {children}
            </Suspense>
            <Toaster position="top-right" />
          </NotificationsProvider>
          </RealtimeProvider>
        </AuthProvider>
        <MobileTelemetry />
        <div id="modal-root"></div>

      </body>
    </html>
  );
}
