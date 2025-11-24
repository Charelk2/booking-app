import type { Metadata } from 'next';
import { getServiceProvider } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';

export const revalidate = 60;

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return { title: 'Service Provider' };
  }

  try {
    const { data: sp } = await getServiceProvider(id);
    const displayName =
      sp.business_name ||
      `${sp.user?.first_name ?? ''} ${sp.user?.last_name ?? ''}`.trim() ||
      'Service Provider';

    const image = sp.profile_picture_url
      ? getFullImageUrl(sp.profile_picture_url)
      : undefined;

    const description = sp.description || undefined;

    return {
      title: displayName,
      description,
      openGraph: {
        title: displayName,
        description,
        images: image ? [image] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: displayName,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: 'Service Provider' };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
