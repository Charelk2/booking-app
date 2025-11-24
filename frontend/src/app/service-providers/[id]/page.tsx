import ProfileClient from './ProfileClient';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
} from '@/lib/api';

export const revalidate = 60;

type Params = { params: { id: string } };

export default async function Page({ params }: Params) {
  const id = Number(params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <ProfileClient
        serviceProviderId={0}
        initialServiceProvider={null as any}
        initialServices={[]}
        initialReviews={[]}
      />
    );
  }

  const [spRes, svcsRes, revsRes] = await Promise.all([
    getServiceProvider(id),
    getServiceProviderServices(id),
    getServiceProviderReviews(id),
  ]);

  return (
    <ProfileClient
      serviceProviderId={id}
      initialServiceProvider={spRes.data}
      initialServices={svcsRes.data}
      initialReviews={revsRes.data}
    />
  );
}
