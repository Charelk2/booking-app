'use client';

import React from 'react';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { useRouter } from 'next/navigation';
import {
  searchProvidersWithAi,
  createBookingRequest,
  type AiProvider,
  type AiProviderFilters,
  type AiChatMessage,
} from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import { fetchArtistAvailability } from '@/lib/availability';

type AiProviderSearchPanelProps = {
  category?: string;
  location?: string;
  when?: Date | null;
  minPrice?: number;
  maxPrice?: number;
};

export default function AiProviderSearchPanel({
  category,
  location,
  when,
  minPrice,
  maxPrice,
}: AiProviderSearchPanelProps) {
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<AiProvider[]>([]);
  const [filters, setFilters] = React.useState<AiProviderFilters | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [messages, setMessages] = React.useState<AiChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! Tell me about your event (type, city, rough date, budget) and I'll suggest some Booka providers that fit.",
    },
  ]);
  const [availability, setAvailability] = React.useState<Record<number, 'available' | 'unavailable' | 'unknown'>>({});
  const router = useRouter();

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Describe what you are looking for (e.g. “Acoustic duo in Cape Town under R8000”).');
      return;
    }
    const nextMessages: AiChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const userMessages = [...nextMessages].filter((m) => m.role === 'user');
      const recentTexts = userMessages
        .slice(-3)
        .map((m) => m.content?.trim())
        .filter((t): t is string => Boolean(t));
      const combinedQuery = recentTexts.join(' ');
      if (!combinedQuery) {
        setError('Describe what you are looking for (e.g. “Acoustic duo in Cape Town under R8000”).');
        return;
      }
      const payload = {
        query: combinedQuery,
        category: category || filters?.category || null,
        location: location || filters?.location || null,
        when: when ? when.toISOString().slice(0, 10) : filters?.when || null,
        min_price:
          typeof minPrice === 'number'
            ? minPrice
            : typeof filters?.min_price === 'number'
            ? filters.min_price
            : null,
        max_price:
          typeof maxPrice === 'number'
            ? maxPrice
            : typeof filters?.max_price === 'number'
            ? filters.max_price
            : null,
        limit: 6,
      };
      const res = await searchProvidersWithAi(payload);
      setProviders(res.providers || []);
      setFilters(res.filters || null);
      const top = (res.providers || [])[0];
      const f = res.filters || {};
      const lines: string[] = [];
      if (top) {
        const locText = top.location ? ` (${top.location})` : '';
        const count = (res.providers || []).length;
        if (count === 1) {
          lines.push(`I found 1 provider on Booka that fits: ${top.name}${locText}.`);
        } else {
          lines.push(`I found ${count} providers on Booka. Top match: ${top.name}${locText}.`);
        }
        if (top.client_total_preview != null) {
          lines.push(
            `Bookings on Booka for this artist typically start from about R${Math.round(
              Number(top.client_total_preview),
            )}.`,
          );
        } else if (top.starting_price != null) {
          lines.push(
            `Their base fee currently starts from about R${Math.round(Number(top.starting_price))}.`,
          );
        }
      } else {
        lines.push("I couldn't find any providers on Booka that match that yet.");
      }
      const missing: string[] = [];
      if (!f.when) missing.push('date');
      if (!f.location) missing.push('location');
      if (f.min_price == null && f.max_price == null) missing.push('budget');
      const queryLower = combinedQuery.toLowerCase();
      if (!queryLower.includes('wedding') && !queryLower.includes('birthday') && !queryLower.includes('corporate')) {
        missing.push('event_type');
      }
      if (!queryLower.includes('guest') && !queryLower.includes('people')) {
        missing.push('guests');
      }
      const questions: string[] = [];
      if (missing.includes('date')) questions.push('Do you have a specific date in mind?');
      if (missing.includes('location')) questions.push('Which town or city is your event in?');
      if (missing.includes('budget')) questions.push('Roughly what budget range are you thinking of?');
      if (missing.includes('event_type')) {
        questions.push('What type of event is it (e.g. wedding, birthday, corporate)?');
      }
      if (missing.includes('guests')) {
        questions.push('About how many guests are you expecting?');
      }
      if (questions.length) {
        lines.push(questions.slice(0, 3).join(' '));
      }
      setMessages([...nextMessages, { role: 'assistant', content: lines.join(' ') }]);
    } catch (err: any) {
      if (err?.code === 'ai_search_disabled') {
        setDisabled(true);
        setProviders([]);
        setError(null);
        return;
      }
      setError('AI suggestions are temporarily unavailable. Please try again or use the filters above.');
    } finally {
      setLoading(false);
    }
  };

  // When we have a date filter and providers, fetch basic availability per artist.
  React.useEffect(() => {
    const dateStr = filters?.when;
    if (!dateStr || !providers.length) return;
    let cancelled = false;
    (async () => {
      const entries: [number, 'available' | 'unavailable' | 'unknown'][] = [];
      for (const p of providers) {
        const key = p.artist_id;
        if (!key) continue;
        const status = await fetchArtistAvailability(key, dateStr);
        if (cancelled) return;
        entries.push([key, status]);
      }
      if (!cancelled && entries.length) {
        setAvailability((prev) => {
          const next = { ...prev };
          for (const [id, status] of entries) {
            next[id] = status;
          }
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providers, filters?.when]);

  const handleStartBooking = (provider: AiProvider) => {
    if (!provider.artist_id) return;
    const userTexts = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content?.trim())
      .filter((t): t is string => Boolean(t));
    const note =
      (userTexts.length ? userTexts.join('\n') : undefined) ||
      `Booking request created from AI search for ${provider.name}`;
    const whenDate = filters?.when;
    const payload: any = {
      service_provider_id: provider.artist_id,
      message: note,
    };
    if (whenDate) {
      // Use midday local time for the proposed datetime; backend stores as ISO.
      payload.proposed_datetime_1 = `${whenDate}T12:00:00`;
    }
    void (async () => {
      try {
        const res = await createBookingRequest(payload);
        const id = res.data?.id;
        if (id) {
          router.push(`/booking-requests/${id}`);
        }
      } catch (err: any) {
        // If not authenticated, fall back to login; user can complete booking from the inbox later.
        const status = err?.response?.status ?? err?.status;
        if (status === 401) {
          const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/booking-requests';
          router.push(`/auth?intent=login&next=${encodeURIComponent(next)}`);
          return;
        }
        // Otherwise, keep the user on the page; errors remain silent for now to avoid noisy UX.
        // They can still use the normal booking flow from the provider page.
      }
    })();
  };

  if (disabled) return null;

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Let AI help you find providers</h2>
      <p className="mt-1 text-xs text-slate-600">
        Describe your event in your own words — we’ll suggest a few matches from Booka.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 space-y-2">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={
                m.role === 'assistant'
                  ? 'flex justify-start'
                  : 'flex justify-end'
              }
            >
              <div
                className={
                  m.role === 'assistant'
                    ? 'inline-block max-w-[85%] rounded-lg bg-slate-100 px-3 py-2'
                    : 'inline-block max-w-[85%] rounded-lg bg-brand text-white px-3 py-2'
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-slate-500">
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/60 focus:border-brand"
            placeholder="e.g. Acoustic duo for a wedding in Cape Town, budget R5–8k, 80 guests..."
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {providers.length > 0 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {providers.map((p) => (
            <div key={p.slug} className="flex flex-col items-stretch">
              <ServiceProviderCardCompact
                serviceProviderId={p.artist_id}
                name={p.name}
                subtitle={undefined}
                imageUrl={getFullImageUrl(p.avatar_url || null) || undefined}
                price={
                  p.client_total_preview != null
                    ? Number(p.client_total_preview)
                    : p.starting_price != null
                    ? Number(p.starting_price)
                    : undefined
                }
                rating={p.rating ?? undefined}
                ratingCount={p.review_count ?? undefined}
                location={p.location}
                categories={p.categories || []}
                href={p.profile_url || `/${p.slug}`}
                className="w-40"
              />
              {filters?.when && (
                <div className="mt-1 text-[11px] text-center text-slate-600">
                  {availability[p.artist_id] === 'available' && (
                    <span className="text-emerald-600">Available on {filters.when}</span>
                  )}
                  {availability[p.artist_id] === 'unavailable' && (
                    <span className="text-red-600">Already booked on {filters.when}</span>
                  )}
                  {availability[p.artist_id] === 'unknown' && (
                    <span>Checking availability…</span>
                  )}
                  {!availability[p.artist_id] && <span>Checking availability…</span>}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleStartBooking(p)}
                className="mt-1 text-[11px] text-center text-brand underline"
              >
                Check availability &amp; book
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
