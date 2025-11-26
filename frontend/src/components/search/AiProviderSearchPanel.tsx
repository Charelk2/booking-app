'use client';

import React from 'react';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { searchProvidersWithAi, type AiProvider, type AiProviderFilters } from '@/lib/api';
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
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<AiProvider[]>([]);
  const [explanation, setExplanation] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<AiProviderFilters | null>(null);
  const [disabled, setDisabled] = React.useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Describe what you are looking for (e.g. “Acoustic duo in Cape Town under R8000”).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        query: trimmed,
        category: category || null,
        location: location || null,
        when: when ? when.toISOString().slice(0, 10) : null,
        min_price: typeof minPrice === 'number' ? minPrice : null,
        max_price: typeof maxPrice === 'number' ? maxPrice : null,
        limit: 6,
      };
      const res = await searchProvidersWithAi(payload);
      setProviders(res.providers || []);
      setExplanation(res.explanation || null);
      setFilters(res.filters || null);
    } catch (err: any) {
      if (err?.code === 'ai_search_disabled') {
        setDisabled(true);
        setProviders([]);
        setExplanation(null);
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
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={2}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/60 focus:border-brand"
          placeholder="e.g. Acoustic duo for a wedding in Cape Town, budget R5–8k, 80 guests..."
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching…' : 'Ask AI'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {explanation && !error && (
        <p className="mt-2 text-xs text-slate-600">{explanation}</p>
      )}
      {providers.length > 0 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {providers.map((p) => (
            <ServiceProviderCardCompact
              key={p.slug}
              serviceProviderId={0}
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
          ))}
        </div>
      )}
    </section>
  );
}

