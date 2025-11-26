'use client';

import React from 'react';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import Link from 'next/link';
import {
  sendAiAssistant,
  type AiProvider,
  type AiProviderFilters,
  type AiChatMessage,
} from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';

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
      const payload = {
        messages: nextMessages,
        category: category || null,
        location: location || null,
        when: when ? when.toISOString().slice(0, 10) : null,
        min_price: typeof minPrice === 'number' ? minPrice : null,
        max_price: typeof maxPrice === 'number' ? maxPrice : null,
        limit: 6,
      };
      const res = await sendAiAssistant(payload);
      setMessages(res.messages || nextMessages);
      setProviders(res.providers || []);
      setFilters(res.filters || null);
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
                price={p.starting_price != null ? Number(p.starting_price) : undefined}
                rating={p.rating ?? undefined}
                ratingCount={p.review_count ?? undefined}
                location={p.location}
                categories={p.categories || []}
                href={p.profile_url || `/${p.slug}`}
                className="w-40"
              />
              <Link
                href={`/booking?artist_id=${encodeURIComponent(String(p.artist_id || ''))}`}
                className="mt-1 text-[11px] text-center text-brand underline"
              >
                Check availability &amp; book
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
