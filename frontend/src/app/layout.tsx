import { Inter } from 'next/font/google';
import Script from 'next/script';
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
  title: 'Artist Booking App',
  description: 'Book your favorite artists for services',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <Script
          src="https://unpkg.com/@googlemaps/extended-component-library@0.6.14/dist/index.min.js"
          strategy="afterInteractive"
          type="module"
          crossOrigin="anonymous"
        />
        <gmpx-api-loader
          api-key={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries="places"
        ></gmpx-api-loader>
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