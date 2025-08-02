// src/components/layout/MainLayout.tsx
'use client';

import { ComponentProps, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext'; // Assuming AuthContext is set up
import Header from './Header';
import MobileBottomNav from './MobileBottomNav'; // Assuming MobileBottomNav is set up
import { HelpPrompt } from '../ui'; // Assuming HelpPrompt is set up
import clsx from 'clsx';
import { usePathname, useParams } from 'next/navigation';


// --- CONSTANTS ---
const baseNavigation = [
  { name: 'Artists', href: '/artists' },
  { name: 'Services', href: '/services' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contact', href: '/contact' },
];

// Define header states (shared type)
type HeaderState = 'initial' | 'compacted';

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


interface Props {
  children: React.ReactNode;
  headerAddon?: React.ReactNode;
  fullWidthContent?: boolean;
}

export default function MainLayout({ children, headerAddon, fullWidthContent = false }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const params = typeof useParams === 'function' ? (useParams() as { id?: string }) : {};
  const isArtistDetail = pathname.startsWith('/artists') && Boolean(params.id);

  // State to manage the header's visual and functional state
  const [headerState, setHeaderState] = useState<HeaderState>(
    isArtistDetail ? 'compacted' : 'initial',
  );

  const scrollThreshold = 150; // Distance to scroll before compacting header

  // Callback to force header state (e.g., when compact search is clicked or search is submitted)
  const forceHeaderState = useCallback((state: HeaderState) => {
    setHeaderState(state);
  }, []);

  // Effect for scroll-based header state changes
  useEffect(() => {
    if (isArtistDetail) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY > scrollThreshold) {
        setHeaderState('compacted');
      } else {
        setHeaderState('initial');
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isArtistDetail]);

  const contentWrapperClasses = fullWidthContent
    ? 'w-full'
    : 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';

  const isArtistsRoot = pathname === '/artists' && !params.id;
  const showSearchBar = pathname === '/' || pathname.startsWith('/artists');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 bg-gradient-to-b from-brand-light/50 to-gray-50">
      <div className="flex-grow">
        <Header
          headerState={headerState}
          onForceHeaderState={forceHeaderState}
          extraBar={
            isArtistsRoot ? <div className="mx-auto w-full px-4">{headerAddon}</div> : undefined
          }
          showSearchBar={showSearchBar}
          alwaysCompact={isArtistDetail}
        />

        {/* CONTENT */}
        <main className={clsx("py-6 pb-24", {
          // Adjust padding if content jumps due to header height changes.
          // With max-height transitions, it should typically flow well.
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