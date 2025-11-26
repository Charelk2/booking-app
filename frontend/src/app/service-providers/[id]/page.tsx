import ProfileClient from './ProfileClient';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
} from '@/lib/api';
import { redirect } from 'next/navigation';

export const revalidate = 60;

type Params = { params: { id: string } };

export default async function Page({ params }: Params) {
  const raw = params.id;

  // Legacy path: /service-providers/[id or slug]
  // Always redirect to the canonical root slug route when possible.
  const spRes = await getServiceProvider(/^\d+$/.test(raw) ? Number(raw) : raw);
  const slug = spRes.data.slug || String(spRes.data.user_id || raw);
  redirect(`/${encodeURIComponent(slug)}`);

  // Unreachable, but keeps the type checker happy.
  return null;
}
