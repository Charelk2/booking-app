// frontend/src/lib/names.ts
import type { BookingRequest, User } from '@/types';

/**
 * Compute the counterparty display label for a thread item.
 * - Client view: prefer business name of the artist; fall back to artist first + last.
 * - Artist view: show client first + last.
 * Optionally accepts a fallback label (e.g., from preview/index) to reduce flicker
 * before full relations are loaded.
 */
export function counterpartyLabel(
  req: Partial<BookingRequest> | null | undefined,
  currentUser?: User | null,
  fallback?: string | null,
): string {
  if (!req) return fallback || '';
  const isArtist = currentUser?.user_type === 'service_provider';

  // Artist perspective → client full name
  if (isArtist) {
    const first = (req as any)?.client?.first_name as string | undefined;
    const last = (req as any)?.client?.last_name as string | undefined;
    if (first && last) return `${first} ${last}`.trim();
    if (first) return first;
    return (fallback || '').trim();
  }

  // Client perspective → provider business name, fallback to artist full name
  const business =
    (req as any)?.service_provider_profile?.business_name ||
    (req as any)?.artist_profile?.business_name ||
    (req as any)?.service_provider?.business_name ||
    (req as any)?.artist?.business_name;
  if (business) return String(business);

  const artistFirst =
    (req as any)?.service_provider?.user?.first_name ||
    (req as any)?.artist?.user?.first_name ||
    (req as any)?.artist?.first_name;
  const artistLast =
    (req as any)?.service_provider?.user?.last_name ||
    (req as any)?.artist?.user?.last_name ||
    (req as any)?.artist?.last_name;
  if (artistFirst && artistLast) return `${artistFirst} ${artistLast}`.trim();
  if (artistFirst) return artistFirst;
  return (fallback || '').trim();
}

/**
 * Choose an avatar URL for the counterparty with the same role rules.
 * Uses nested relations first, then optional fallback URL carried from previews.
 */
export function counterpartyAvatar(
  req: Partial<BookingRequest> | null | undefined,
  currentUser?: User | null,
  fallbackUrl?: string | null,
): string | null {
  if (!req) return fallbackUrl ?? null;
  const isArtist = currentUser?.user_type === 'service_provider';
  if (isArtist) {
    const url = (req as any)?.client?.profile_picture_url;
    return (url ?? fallbackUrl ?? null) as string | null;
  }
  const url =
    (req as any)?.service_provider_profile?.profile_picture_url ||
    (req as any)?.artist_profile?.profile_picture_url ||
    (req as any)?.service_provider?.profile_picture_url ||
    (req as any)?.artist?.profile_picture_url;
  return (url ?? fallbackUrl ?? null) as string | null;
}

