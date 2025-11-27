'use client';

import React from 'react';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { useRouter } from 'next/navigation';
import {
  callBookingAgent,
  type AiProvider,
  type BookingAgentMessage,
  type BookingAgentStateApi,
  type BookingAgentResponse,
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
  const [agentState, setAgentState] = React.useState<BookingAgentStateApi | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [messages, setMessages] = React.useState<BookingAgentMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! Tell me what you're planning — event type, city, rough date and guest count — and I’ll suggest some great service providers on Booka (musicians, DJs, photographers, video, kids’ entertainment, sound, and more).",
    },
  ]);
  const [availability, setAvailability] = React.useState<Record<number, 'available' | 'unavailable' | 'unknown'>>({});
  const router = useRouter();

  const handleSend = async () => {
    if (loading) return;
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Describe what you are looking for (e.g. “Acoustic duo in Cape Town under R8000”).');
      return;
    }
    const nextMessages: BookingAgentMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError(null);

    setLoading(true);
    try {
      const payload = {
        messages: nextMessages,
        state: agentState,
      };
      const res: BookingAgentResponse = await callBookingAgent(payload);
      setMessages(res.messages || nextMessages);
      setAgentState(res.state || null);
      setProviders(res.providers || []);
      // If the agent created a booking, navigate to the thread.
      const action = (res.actions || []).find((a) => a.type === 'booking_created');
      if (action) {
        router.push(action.url || `/booking-requests/${action.booking_request_id}`);
        return;
      }
    } catch (err: any) {
      if (err?.code === 'ai_agent_disabled') {
        setDisabled(true);
        setProviders([]);
        setError(null);
        return;
      }
      if (err?.code === 'ai_agent_unauthenticated') {
        const nextUrl =
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : '/service-providers';
        router.push(`/auth?intent=login&next=${encodeURIComponent(nextUrl)}`);
        return;
      }
      setError('AI suggestions are temporarily unavailable. Please try again or use the filters above.');
    } finally {
      setLoading(false);
    }
  };

  // When we have a date filter and providers, fetch basic availability per artist.
  React.useEffect(() => {
    const dateStr = agentState?.date || (when ? when.toISOString().slice(0, 10) : null);
    if (!dateStr || !providers.length) return;
    let cancelled = false;
    (async () => {
      const entries: [number, 'available' | 'unavailable' | 'unknown'][] = [];
      // Cap availability lookups to a small number of providers per turn
      // and run them in parallel so we don't block on a long waterfall of
      // sequential fetches.
      const slice = providers.slice(0, 4);
      await Promise.all(
        slice.map(async (p) => {
          const key = p.artist_id;
          if (!key) return;
          const status = await fetchArtistAvailability(key, dateStr);
          if (cancelled) return;
          entries.push([key, status]);
        })
      );
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
  }, [providers, agentState?.date, when]);

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
              <div className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-slate-500 animate-pulse">
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
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
            Send
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
              {agentState?.date && (
                <div className="mt-1 text-[11px] text-center text-slate-600">
                  {availability[p.artist_id] === 'available' && (
                    <span className="text-emerald-600">Available on {agentState.date}</span>
                  )}
                  {availability[p.artist_id] === 'unavailable' && (
                    <span className="text-red-600">Already booked on {agentState.date}</span>
                  )}
                  {availability[p.artist_id] === 'unknown' && (
                    <span>Checking availability…</span>
                  )}
                  {!availability[p.artist_id] && <span>Checking availability…</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
