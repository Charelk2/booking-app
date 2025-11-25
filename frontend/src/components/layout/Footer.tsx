import Link from 'next/link';
import { 
  User, 
  Music, 
  FileText, 
  LifeBuoy, 
  MapPin,
  Facebook,
  Instagram,
  Linkedin, // Assuming you might want LinkedIn, or we can stick to the SVG paths provided
} from 'lucide-react';
import type { ComponentProps } from 'react';

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

// 3. Social Media Icons (Using SVG paths for custom branding feel, or Lucide if preferred)
const social = [
  {
    name: 'Instagram',
    href: 'https://instagram.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
        <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l-6.52-25.95a12,12,0,0,1,11.08-14.89h0a12,12,0,0,0,10.6-17.61l-14.77-24.89a12,12,0,0,1,4.47-16.14l1.37-.87A12,12,0,0,0,227,8.68L199.3,2.37A12,12,0,0,1,188,12.28l-1.57.17a12,12,0,0,0-9.83,7.12L165.23,45.3a12,12,0,0,1-16.32,5.81l-1.74-.69a48,48,0,1,0-38.34,0l-1.74.69a12,12,0,0,1-16.32-5.81L79.4,19.57a12,12,0,0,0-9.83-7.12L68,12.28A12,12,0,0,1,56.7,2.37L29,8.68a12,12,0,0,0-4.75,16.66l1.37.87a12,12,0,0,1,4.47,16.14L15.32,67.24a12,12,0,0,0,10.6,17.61h0a12,12,0,0,1,11.08,14.89L30.48,125.68A12,12,0,0,0,42.12,140h0a12,12,0,0,1,11.75,15.69l-3.32,12.38A12,12,0,0,0,62.14,182.6l24.2,6.48a12,12,0,0,1,8.63,14.28l-1.12,4.64a48,48,0,1,0,68.3,0l-1.12-4.64a12,12,0,0,1,8.63-14.28l24.2-6.48a12,12,0,0,0,11.59-14.53l-3.32-12.38A12,12,0,0,1,213.88,140h0A12,12,0,0,0,216,130.16ZM128,192a32,32,0,1,1,32-32A32,32,0,0,1,128,192Zm0-160a32,32,0,1,1-32,32A32,32,0,0,1,128,32Z" opacity="0.2"/>
        <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160ZM176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24Zm40,152a40,40,0,0,1-40,40H80a40,40,0,0,1-40-40V80A40,40,0,0,1,80,40h96a40,40,0,0,1,40,40Z"/>
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://facebook.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
        <path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"></path>
        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm8,191.63V152h24a8,8,0,0,0,0-16H136V112a16,16,0,0,1,16-16h16a8,8,0,0,0,0-16H152a32,32,0,0,0-32,32v24H96a8,8,0,0,0,0,16h24v63.63a88,88,0,1,1,16,0Z"></path>
      </svg>
    ),
  },
  {
    name: 'Pinterest',
    href: 'https://pinterest.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
         <path d="M224,112c0,22.57-7.9,43.2-22.23,58.11C188.39,184,170.25,192,152,192c-17.88,0-29.82-5.86-37.43-12l-10.78,45.82A8,8,0,0,1,96,232a8.24,8.24,0,0,1-1.84-.21,8,8,0,0,1-6-9.62l32-136a8,8,0,0,1,15.58,3.66l-16.9,71.8C122,166,131.3,176,152,176c27.53,0,56-23.94,56-64A72,72,0,1,0,73.63,148a8,8,0,0,1-13.85,8A88,88,0,1,1,224,112Z"></path>
      </svg>
    ),
  }
];

export default function Footer() {
  return (
    <footer className="bg-white text-gray-900 font-sans">
      {/* TOP BORDER LINE 
         Mimicking the strong separator from the inspo
      */}
      <div className="w-full h-0.5 bg-black" />

      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
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
      <div className="border-t-2 border-black mx-6 lg:mx-auto max-w-7xl">
        <div className="py-12 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
          
          {/* Big Brand Logo */}
          <div className="space-y-2">
            <Link href="/" className="block text-5xl md:text-6xl font-black tracking-tighter text-black hover:opacity-80 transition-opacity">
              booka
            </Link>
            <p className="text-xs text-gray-500 font-medium max-w-sm">
              Peace, Love & Gigs ® <br/>
              Empowering entertainers, enabling planners.
            </p>
          </div>

          {/* Socials & Copyright */}
          <div className="flex flex-col md:items-end gap-6">
            <div className="flex gap-4">
              {social.map(({ name, href, icon: Icon }) => (
                <a
                  key={name}
                  href={href}
                  className="text-black hover:scale-110 transition-transform duration-200"
                >
                  <span className="sr-only">{name}</span>
                  <Icon className="h-8 w-8" />
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