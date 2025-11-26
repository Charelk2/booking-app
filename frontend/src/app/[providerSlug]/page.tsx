import { notFound, redirect } from 'next/navigation';
import { getServiceProvider } from '@/lib/api';

type Params = { params: { providerSlug: string } };

export default async function ProviderAliasPage({ params }: Params) {
  const raw = params.providerSlug;

  // If this segment looks like a known app section, let the dedicated routes handle it.
  const reserved = new Set([
    'api',
    'auth',
    'dashboard',
    'service-providers',
    'category',
    'inbox',
    'faq',
    'support',
    'account',
  ]);
  if (reserved.has(raw)) {
    notFound();
  }

  try {
    const res = await getServiceProvider(raw);
    const slug = res.data.slug || String(res.data.user_id);
    redirect(`/service-providers/${encodeURIComponent(slug)}`);
  } catch {
    // If the slug does not resolve to a provider, fall back to 404.
    notFound();
  }
}

