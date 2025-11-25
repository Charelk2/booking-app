import Link from 'next/link';
import {
  User,
  Music,
  FileText,
  LifeBuoy,
  MapPin,
} from 'lucide-react';

// --- Configuration ---

// 1. The "Bash-style" Quick Actions (Left Column)
// These are your high-value actions that need to stand out like "Track Order" did in the inspo.
const quickActions = [
  { 
    name: 'Log in to your account', 
    href: '#', 
    icon: User 
  },
  { 
    name: 'Request a quote', 
    href: '#', 
    icon: FileText 
  },
  { 
    name: 'Get gigs & join us', 
    href: '#', 
    icon: Music 
  },
  { 
    name: 'Contact support', 
    href: '#', 
    icon: LifeBuoy 
  },
  {
    name: 'Find local talent',
    href: '#',
    icon: MapPin
  }
];

// 2. The Main Link Columns
const navigation = [
  {
    title: 'Company',
    links: [
      { name: 'About us', href: '#' },
      { name: 'Blog', href: '#' },
      { name: 'Partners', href: '#' },
      { name: 'Careers', href: '#' },
    ],
  },
  {
    title: 'Entertainment',
    links: [
      { name: 'Book entertainment', href: '#' },
      { name: 'Musicians for hire', href: '#' },
      { name: 'Wedding bands', href: '#' },
      { name: 'Speakers', href: '#' },
    ],
  },
  {
    title: 'Services',
    links: [
      { name: 'Sound services', href: '#' },
      { name: 'Lighting & Stage', href: '#' },
      { name: 'Wedding services', href: '#' },
      { name: 'Corporate events', href: '#' },
    ],
  },
  {
    title: 'Legal & Help',
    links: [
      { name: 'Help Center', href: '#' },
      { name: 'Terms & Conditions', href: '#' },
      { name: 'Privacy Policy', href: '#' },
    ],
  },
];

// 3. Social Media Icons (uniform outline style)
const social = [
  {
    name: 'Instagram',
    href: 'https://instagram.com',
    label: 'IG',
  },
  {
    name: 'Facebook',
    href: 'https://facebook.com',
    label: 'f',
  },
  {
    name: 'Pinterest',
    href: 'https://pinterest.com',
    label: 'P',
  },
];

function SocialIcon({ label, className }: { label: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="10"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-white text-gray-900 font-sans">
      {/* TOP BORDER LINE 
         Mimicking the strong separator from the inspo
      */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="h-0.5 bg-black" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          {/* LEFT COLUMN: UTILITY / QUICK ACTIONS
            This mimics the "Pay Account", "Track Order" section.
            Bold, icon-driven, high utility.
          */}
          <div className="lg:w-1/4 shrink-0 space-y-8">
             <div className="space-y-6">
                {quickActions.map((action) => (
                  <Link 
                    key={action.name} 
                    href={action.href}
                    className="group flex items-center gap-4 text-sm font-bold text-gray-900 hover:text-brand-dark transition-colors duration-200"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 group-hover:bg-brand-light/20 group-hover:text-brand-dark transition-colors">
                      <action.icon className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <span className="group-hover:translate-x-1 transition-transform duration-200">
                      {action.name}
                    </span>
                  </Link>
                ))}
             </div>
          </div>

          {/* RIGHT GRID: NAVIGATION LINKS
            Clean, bold headers, simple list.
          */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 w-full">
            {navigation.map((section) => (
              <div key={section.title}>
                <h3 className="text-base font-bold tracking-tight text-black mb-6">
                  {section.title}
                </h3>
                <ul role="list" className="space-y-4">
                  {section.links.map((item) => (
                    <li key={item.name}>
                      <Link 
                        href={item.href} 
                        className="text-sm text-gray-600 hover:text-black hover:underline underline-offset-4 transition-all"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: BRANDING & SOCIALS
         Thick separator, large logo, socials on right.
      */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 border-t-2 border-black">
        <div className="py-12 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
          
          {/* Big Brand Logo */}
          <div className="space-y-2">
            <Link href="/" className="block text-5xl md:text-6xl font-black tracking-tighter text-black hover:opacity-80 transition-opacity">
              Booka
            </Link>
            <p className="text-xs text-gray-500 font-medium max-w-sm">
              Peace, Love & Gigs ® <br/>
              Empowering entertainers, enabling planners.
            </p>
          </div>

          {/* Socials & Copyright */}
          <div className="flex flex-col md:items-end gap-6">
            <div className="flex gap-4">
              {social.map(({ name, href, label }) => (
                <a
                  key={name}
                  href={href}
                  className="text-black hover:scale-110 transition-transform duration-200"
                >
                  <span className="sr-only">{name}</span>
                  <SocialIcon label={label} className="h-8 w-8" />
                </a>
              ))}
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-gray-500">
                &copy; {new Date().getFullYear()} Booka.co.za. All rights reserved.
              </p>
              <div className="flex gap-4 text-xs text-gray-400 justify-end">
                <Link href="#" className="hover:text-black">Privacy</Link>
                <Link href="#" className="hover:text-black">Terms</Link>
                <Link href="#" className="hover:text-black">Sitemap</Link>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </footer>
  );
}
