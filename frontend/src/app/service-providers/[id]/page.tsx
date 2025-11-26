import ProfileClient from './ProfileClient';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
} from '@/lib/api';

export const revalidate = 60;

type Params = { params: { id: string } };

export default async function Page({ params }: Params) {
  const raw = params.id;

  // Allow both numeric IDs and slugs in the URL segment.
  const spRes = await getServiceProvider(/^\d+$/.test(raw) ? Number(raw) : raw);
  const providerId = (spRes.data.user_id ?? (/^\d+$/.test(raw) ? Number(raw) : 0)) || 0;

  const [svcsRes, revsRes] = await Promise.all([
    getServiceProviderServices(providerId),
    getServiceProviderReviews(providerId),
  ]);

  return (
    <ProfileClient
      serviceProviderId={providerId}
      initialServiceProvider={spRes.data}
      initialServices={svcsRes.data}
      initialReviews={revsRes.data}
    />
  );
}
