import ProfileClient from './ProfileClient';
import { getServiceProvider, getServiceProviderServices, getServiceProviderReviews } from '@/lib/api';

export const revalidate = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    // Graceful fallback: avoid throwing to keep a soft 200 with not found UI
    const empty: any = null;
    return (
      <ProfileClient
        serviceProviderId={0}
        initialServiceProvider={empty}
        initialServices={[]}
        initialReviews={[]}
      />
    );
  }

  try {
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
  } catch {
    // Fail-soft: render a not-found style shell instead of throwing on the server
    const empty: any = null;
    return (
      <ProfileClient
        serviceProviderId={id}
        initialServiceProvider={empty}
        initialServices={[]}
        initialReviews={[]}
      />
    );
  }
}
