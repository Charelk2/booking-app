import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Script from 'next/script';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/hooks/useNotifications';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata = {
  title: 'Artist Booking App',
  description: 'Book your favorite artists for services',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
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
        <Script
          src="https://unpkg.com/@googlemaps/places@1.0.0/dist/index.min.js"
          type="module"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
