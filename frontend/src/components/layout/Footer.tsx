import Link from 'next/link';
import type { ComponentProps } from 'react';

const navigation = [
  {
    title: 'Company',
    links: [
      { name: 'About us', href: '#' },
      { name: 'Blog', href: '#' },
      { name: 'Partners', href: '#' },
    ],
  },
  {
    title: 'Planners',
    links: [
      { name: 'How it works', href: '#' },
      { name: 'Party ideas', href: '#' },
      { name: 'Request a quote', href: '#' },
    ],
  },
  {
    title: 'Entertainment',
    links: [
      { name: 'Book entertainment', href: '#' },
      { name: 'Book a speaker', href: '#' },
      { name: 'Musicians for hire', href: '#' },
      { name: 'Wedding entertainment', href: '#' },
    ],
  },
  {
    title: 'Support',
    links: [
      { name: 'Help', href: '#' },
      { name: 'Contact us', href: '#' },
      { name: 'Log in', href: '#' },
    ],
  },
  {
    title: 'Talent',
    links: [
      { name: 'Get gigs', href: '#' },
      { name: 'Pricing', href: '#' },
      { name: 'Testimonials', href: '#' },
    ],
  },
  {
    title: 'Services',
    links: [
      { name: 'Sound services', href: '#' },
      { name: 'Unique services', href: '#' },
      { name: 'Wedding services', href: '#' },
    ],
  },
];

const social = [
  {
    name: 'Pinterest',
    href: 'https://pinterest.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
        <path
          d="M216,112c0,44.18-32,72-64,72s-41.63-21.07-41.63-21.07h0L128,88l13.14-55.83h0A80,80,0,0,1,216,112Z"
          opacity="0.2"
        />
        <path d="M224,112c0,22.57-7.9,43.2-22.23,58.11C188.39,184,170.25,192,152,192c-17.88,0-29.82-5.86-37.43-12l-10.78,45.82A8,8,0,0,1,96,232a8.24,8.24,0,0,1-1.84-.21,8,8,0,0,1-6-9.62l32-136a8,8,0,0,1,15.58,3.66l-16.9,71.8C122,166,131.3,176,152,176c27.53,0,56-23.94,56-64A72,72,0,1,0,73.63,148a8,8,0,0,1-13.85,8A88,88,0,1,1,224,112Z" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://facebook.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
        <path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2" />
        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm8,191.63V152h24a8,8,0,0,0,0-16H136V112a16,16,0,0,1,16-16h16a8,8,0,0,0,0-16H152a32,32,0,0,0-32,32v24H96a8,8,0,0,0,0,16h24v63.63a88,88,0,1,1,16,0Z" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com',
    icon: (props: ComponentProps<'svg'>) => (
      <svg viewBox="0 0 256 256" fill="currentColor" {...props}>
        <path
          d="M176,32H80A48,48,0,0,0,32,80v96a48,48,0,0,0,48,48h96a48,48,0,0,0,48-48V80A48,48,0,0,0,176,32ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"
          opacity="0.2"
        />
        <path d="M176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24Zm40,152a40,40,0,0,1-40,40H80a40,40,0,0,1-40-40V80A40,40,0,0,1,80,40h96a40,40,0,0,1,40,40ZM128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm64-84a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer className="bg-gradient-to-t from-brand-light/50 to-gray-50 border-t border-gray-200">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <Link href="/" className="block text-3xl font-bold text-brand-dark">
              Booka.co.za
            </Link>
            <p className="text-md text-gray-600">
              With us, <b>planners have the confidence to bring their events to life</b>, while entertainers and event professionals enjoy quality leads and more opportunities to do what they love.
            </p>
            <div className="flex space-x-4">
              {social.map(({ name, href, icon: Icon }) => (
                <a
                  key={name}
                  href={href}
                  className="text-gray-400 hover:text-brand-dark transition"
                >
                  <span className="sr-only">{name}</span>
                  <Icon className="h-6 w-6" />
                </a>
              ))}
            </div>
          </div>

          <nav className="md:col-span-2 md:ml-auto md:w-fit grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-8">
            {navigation.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-brand-dark">
                  {section.title}
                </h3>
                <ul className="mt-4 space-y-2">
                  {section.links.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-gray-600 hover:text-brand-dark"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Booka.co.za. All rights reserved.
          </p>
          <p className="mt-4 md:mt-0 text-xs text-gray-500">
            ♥ Peace, Love &amp; Gigs ®
          </p>
        </div>
      </div>
    </footer>
  );
}

