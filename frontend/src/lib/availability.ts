import { apiUrl } from '@/lib/api';

export type ArtistAvailability = {
  unavailable_dates: string[];
};

export async function fetchArtistAvailability(
  artistId: number,
  when: string
): Promise<'available' | 'unavailable' | 'unknown'> {
  if (!artistId || !when) return 'unknown';
  try {
    const res = await fetch(
      apiUrl(`/api/v1/service-provider-profiles/${artistId}/availability?when=${encodeURIComponent(when)}`),
      { credentials: 'include' }
    );
    if (!res.ok) return 'unknown';
    const data: ArtistAvailability = await res.json();
    if (Array.isArray(data.unavailable_dates)) {
      return data.unavailable_dates.includes(when) ? 'unavailable' : 'available';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

