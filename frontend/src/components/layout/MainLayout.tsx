// components/layout/MainLayout.tsx
'use client';

import { ComponentProps, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import { HelpPrompt } from '../ui';
import clsx from 'clsx';

// --- CONSTANTS ---
const baseNavigation = [
  { name: 'Artists', href: '/artists' },
  { name: 'Services', href: '/services' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contact', href: '/contact' },
];

// --- FOOTER COMPONENT (Defined within MainLayout) ---
const SocialIcon = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="text-gray-400 hover:text-gray-500 no-underline hover:no-underline">
    <span className="sr-only">{children}</span>
    {children}
  </a>
);

const FacebookIcon = (props: ComponentProps<'svg'>) => (
  <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
    <path
      fillRule="evenodd"
      d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
      clipRule="evenodd"
    />
  </svg>
);

const Footer = () => (
  <footer className="bg-gradient-to-t from-brand-light/50 to-gray-50 border-t border-gray-200">
    <div className="mx-auto max-w-7xl px-6 py-10 text-left">
      {/* nav links */}
      <nav className="flex flex-wrap gap-x-8 gap-y-4 justify-center">
        {baseNavigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="text-sm font-medium no-underline hover:no-underline text-gray-600 hover:text-brand-dark transition"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {/* social icons */}
      <div className="mt-8 flex justify-center space-x-6">
        <SocialIcon href="https://facebook.com">
          <FacebookIcon className="h-6 w-6 text-gray-500 hover:text-brand-dark transition" />
        </SocialIcon>
      </div>

      {/* copyright */}
      <p className="mt-8 text-center text-xs text-gray-500">
        &copy; {new Date().getFullYear()} Booka.co.za. All rights reserved.
      </p>
    </div>
  </footer>
);

import { usePathname } from 'next/navigation';

interface Props {
  children: React.ReactNode;
  headerAddon?: React.ReactNode;
  fullWidthContent?: boolean;
}

export default function MainLayout({ children, headerAddon, fullWidthContent = false }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();

  const [showHeaderCompact, setShowHeaderCompact] = useState(false);

  const handleForceHeaderExpand = useCallback(() => {
    // When inline search is activated, force the header to be non-compact
    setShowHeaderCompact(false);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const scrollThreshold = 100; // This is the point where header should go compact

      // Only change to compact if scrolled past threshold AND it's not currently forced open
      // The `!showHeaderCompact` in condition prevents flickering if it was already manually expanded.
      if (scrollY > scrollThreshold && !showHeaderCompact) {
        setShowHeaderCompact(true);
      }
      // Expand if scrolled back above threshold AND it's currently compact
      // This also covers the case where it was forced expanded and then scrolled to top.
      else if (scrollY <= scrollThreshold && showHeaderCompact) {
        setShowHeaderCompact(false);
      }
    };

    handleScroll(); // Run once on mount to set initial state
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [showHeaderCompact]); // Dependency ensures effect re-runs if showHeaderCompact changes internally

  const contentWrapperClasses = fullWidthContent
    ? 'w-full'
    : 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 bg-gradient-to-b from-brand-light/50 to-gray-50">
      <div className="flex-grow">
        <Header
          isCompact={showHeaderCompact}
          onForceHeaderExpand={handleForceHeaderExpand} // Pass the new function
          extraBar={
            pathname.startsWith('/artists') ? (
              <div className="mx-auto w-full px-4">{headerAddon}</div>
            ) : undefined
          }
        />

        {/* CONTENT */}
        {/* We need to ensure content below pushes down when header expands */}
        {/* The padding-top or margin-top of the main content should dynamically
            match the header's height to prevent content jump. */}
        <main className={clsx("py-6 pb-24", {
          // You might need to adjust this padding value based on your actual header heights
          // For example, if your compact header is h-16 and full is h-24 + pb-5 + pt-2
          // You'd calculate the difference and apply as dynamic top padding/margin.
          // For now, let's assume default flow handles it with sticky.
        })}>
          <div className={contentWrapperClasses}>{children}</div>
          <HelpPrompt className="mx-auto mt-10 max-w-7xl sm:px-6 lg:px-8" />
        </main>
      </div>

      <Footer />

      {user && <MobileBottomNav user={user} />}
    </div>
  );
}