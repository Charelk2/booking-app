import { getFullImageUrl, getTownProvinceFromAddress } from '@/lib/utils';
import type { Service, ServiceProviderProfile } from '@/types';

/**
 * Format a human-friendly location string from an address.
 */
export function formatCityRegion(address?: string | null): string {
  if (!address) return '';
  return getTownProvinceFromAddress(address) || address;
}

/**
 * Safely format the location for a provider/service profile.
 */
export function formatProfileLocation(
  profile?: Partial<Pick<ServiceProviderProfile, 'location'>> | { location?: string | null },
): string {
  return formatCityRegion(profile?.location ?? null);
}

/**
 * Choose a hero image URL from a service or provider payload.
 * Prefers media_url/image_url variants and normalizes through getFullImageUrl.
 */
export function pickHeroMedia(entity: Partial<Service> | Record<string, any>): string | null {
  const raw =
    (entity as any)?.media_url ||
    (entity as any)?.image_url ||
    (entity as any)?.cover_image_url ||
    (entity as any)?.photo_url ||
    (entity as any)?.image ||
    null;
  return raw ? getFullImageUrl(raw) : null;
}

/**
 * Format distance in km with rounding; returns empty string when absent.
 */
export function formatDistanceKm(distanceKm?: number | null): string {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return '';
  const rounded = Math.round(distanceKm);
  return `${rounded} km`;
}
