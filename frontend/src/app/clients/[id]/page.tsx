import ClientProfilePanel from '@/components/chat/MessageThread/ClientProfilePanel';
import { apiUrl } from '@/lib/api';

type ClientProfile = {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    profile_picture_url?: string | null;
    member_since_year?: number | null;
  };
  stats: {
    completed_events: number;
    cancelled_events: number;
    avg_rating: number | null;
    reviews_count: number;
  };
  verifications: {
    email_verified: boolean;
    phone_verified: boolean;
    payment_verified: boolean;
  };
  reviews: Array<{
    id: number;
    rating: number;
    comment: string;
    created_at: string;
    provider?: { id: number; business_name?: string | null; city?: string | null };
    booking?: { id: number; event_date?: string | null; service_title?: string | null };
  }>;
};

export default async function ClientProfilePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Client not found</h1>
        <p className="text-sm text-gray-600">The client profile you’re looking for does not exist.</p>
      </main>
    );
  }

  let profile: ClientProfile | null = null;
  try {
    const res = await fetch(apiUrl(`/api/v1/users/${id}/profile`), {
      // Server-side: include cookies for auth so private stats stay protected
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      profile = null;
    } else {
      profile = (await res.json()) as ClientProfile;
    }
  } catch {
    profile = null;
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Client profile unavailable</h1>
        <p className="text-sm text-gray-600">
          We couldn’t load this client’s profile right now. Please try again later.
        </p>
      </main>
    );
  }

  const displayName = `${profile.user.first_name || ''} ${profile.user.last_name || ''}`.trim() || 'Client';

  // Reuse the existing slide-over panel layout, but render it as a full page by
  // passing props that make sense in this context.
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="sr-only">Client profile for {displayName}</h1>
      <ClientProfilePanel
        clientId={profile.user.id}
        clientName={displayName}
        clientAvatarUrl={profile.user.profile_picture_url || null}
        providerName={undefined}
        bookingRequestId={0}
        canReview={false}
        isOpen={true}
        autoOpenReview={false}
        onClose={() => {}}
      />
    </main>
  );
}

