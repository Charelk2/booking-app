"use client";

import { useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Link from 'next/link';
import {
  QuestionMarkCircleIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  BuildingStorefrontIcon,
  MapPinIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

type CategoryId =
  | 'booking'
  | 'payments'
  | 'quotes'
  | 'providers'
  | 'account'
  | 'messages'
  | 'cancellations'
  | 'security';

const CATEGORIES: { id: CategoryId; label: string; icon: any }[] = [
  { id: 'booking', label: 'Bookings', icon: CalendarDaysIcon },
  { id: 'payments', label: 'Payments', icon: CreditCardIcon },
  { id: 'quotes', label: 'Quotes', icon: Cog6ToothIcon },
  { id: 'providers', label: 'Service Providers', icon: BuildingStorefrontIcon },
  { id: 'messages', label: 'Messages', icon: ChatBubbleLeftRightIcon },
  { id: 'cancellations', label: 'Cancellations', icon: QuestionMarkCircleIcon },
  { id: 'security', label: 'Trust & Safety', icon: ShieldCheckIcon },
  { id: 'account', label: 'Account', icon: Cog6ToothIcon },
];

type Faq = { id: string; category: CategoryId; q: string; a: string };

const FAQS: Faq[] = [
  {
    id: 'how-to-book',
    category: 'booking',
    q: 'How do I start a booking?',
    a: 'Browse services, pick a date and location, then send a booking request. We guide you step by step and keep your progress saved so you can finish later.',
  },
  {
    id: 'availability',
    category: 'booking',
    q: 'How is availability checked?',
    a: 'We check provider calendars in real time and merge Google Calendar data when providers connect it. Blocked dates are disabled during selection, and clashes are flagged.',
  },
  {
    id: 'quotes-overview',
    category: 'quotes',
    q: 'What’s included in a quote?',
    a: 'Quotes include performance fees, sound and accommodation providers (if needed), travel costs, taxes, and applicable discounts. You can see a running total in the chat thread.',
  },
  {
    id: 'travel-costs',
    category: 'booking',
    q: 'How are travel and accommodation calculated?',
    a: 'We estimate driving vs. flights based on distance and nearest airports. If your event is far, accommodation is added automatically. We also fetch a 3‑day weather forecast for planning.',
  },
  {
    id: 'payments-when',
    category: 'payments',
    q: 'When do I pay?',
    a: 'After you accept a quote, you pay the full amount to confirm the booking. No deposits are required.',
  },
  {
    id: 'payment-methods',
    category: 'payments',
    q: 'What payment methods are supported?',
    a: 'Card payments are supported right in the app. If alternative methods are needed for your region, your provider can share details in chat.',
  },
  {
    id: 'message-where',
    category: 'messages',
    q: 'Where do I find my messages?',
    a: 'Open your Inbox to see all conversations. We support real‑time chat, unread counts, typing indicators, and attachments. Messages queue offline and send automatically once you’re back online.',
  },
  {
    id: 'provider-selection',
    category: 'providers',
    q: 'How are providers selected for my needs?',
    a: 'We match your event details to a provider’s preferences with smart fallbacks (e.g., sound or accommodation partners). You can review and confirm options during the quote step.',
  },
  {
    id: 'cancel-policy',
    category: 'cancellations',
    q: 'What is the cancellation policy?',
    a: 'Policies vary by provider and will be visible before you pay. Many providers offer partial refunds up to a certain date; always review the policy shown on your quote.',
  },
  {
    id: 'location-input',
    category: 'booking',
    q: 'Can I search by town or venue?',
    a: 'Yes. Start typing a town or venue and select a result. We use Places to improve accuracy and estimate travel more precisely.',
  },
  {
    id: 'account-security',
    category: 'security',
    q: 'How do you keep my account secure?',
    a: 'We use secure sessions, optional MFA, and follow best practices for data handling. You can review recent activity from your account page and sign out of other devices.',
  },
  {
    id: 'edit-profile',
    category: 'account',
    q: 'Where can I update my profile?',
    a: 'Clients can edit their profile under Account. Service providers can update their profile and portfolio from the Dashboard.',
  },
];

export default function FaqPage() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategoryId | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((f) =>
      (active === 'all' || f.category === active) &&
      (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
    );
  }, [query, active]);

  const grouped = useMemo(() => {
    const map = new Map<CategoryId, Faq[]>();
    for (const f of filtered) {
      const arr = map.get(f.category) || [];
      arr.push(f);
      map.set(f.category, arr);
    }
    return map;
  }, [filtered]);

  return (
    <MainLayout>
      {/* Hero/search */}
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Frequently Asked Questions
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Short, practical answers for bookings, quotes, payments, and messaging.
          </p>
          <div className="mt-6">
            <label htmlFor="faq-search" className="sr-only">Search FAQs</label>
            <div className="relative max-w-xl">
              <input
                id="faq-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bookings, payments, quotes…"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-slate-900 shadow-sm focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 014.356 8.876l3.634 3.634a1 1 0 01-1.415 1.415l-3.634-3.634A5.5 5.5 0 118.5 3zm0 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Category pills */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => setActive('all')}
              className={`px-3 py-1.5 rounded-full text-sm border ${active === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm border ${active === c.id ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-700 border-slate-200 hover:border-slate-300'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="max-w-5xl mx-auto px-6 py-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink href="/contact" title="Contact support" icon={ChatBubbleLeftRightIcon}>
          Get help from our team
        </QuickLink>
        <QuickLink href="/privacy" title="Privacy" icon={ShieldCheckIcon}>
          Learn how we protect data
        </QuickLink>
        <QuickLink href="/terms" title="Terms & policies" icon={QuestionMarkCircleIcon}>
          Review policies and terms
        </QuickLink>
        <QuickLink href="/service-providers" title="Find providers" icon={BuildingStorefrontIcon}>
          Explore services by category
        </QuickLink>
      </section>

      {/* FAQ list */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        {[...(grouped.keys() as any)].map((cat: CategoryId) => {
          const items = grouped.get(cat)!;
          const meta = CATEGORIES.find((c) => c.id === cat);
          if (!items?.length) return null;
          const Icon = meta?.icon || MapPinIcon;
          return (
            <div key={cat} className="mt-10">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">{meta?.label || cat}</h2>
              </div>
              <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {items.map((f) => (
                  <details key={f.id} className="group open:bg-slate-50">
                    <summary className="list-none cursor-pointer px-4 py-4 flex items-start gap-3 select-none">
                      <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-slate-300 group-open:bg-slate-400" aria-hidden="true" />
                      <span className="text-slate-900 font-medium">{f.q}</span>
                      <svg className="ml-auto h-5 w-5 text-slate-400 group-open:rotate-180 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
                    </summary>
                    <div className="px-4 pb-4 pt-1 text-slate-700">
                      {f.a}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}

        {/* Didn’t find it? */}
        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <QuestionMarkCircleIcon className="h-6 w-6 text-slate-500" />
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Didn’t find what you need?</p>
            <p className="text-sm text-slate-600">Our team can help with bookings, payments, and account issues.</p>
          </div>
          <Link href="/contact" className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Contact support
          </Link>
        </div>
      </section>
    </MainLayout>
  );
}

function QuickLink({ href, title, icon: Icon, children }: { href: string; title: string; icon: any; children: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200">
          <Icon className="h-5 w-5 text-slate-500" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{title}</p>
          <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">{children}</p>
        </div>
      </div>
    </Link>
  );
}
