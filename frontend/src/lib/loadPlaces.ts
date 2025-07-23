import { Loader } from '@googlemaps/js-api-loader';

let loader: Loader | null = null;

export async function loadPlaces(): Promise<typeof google.maps.places | null> {
  if (typeof window === 'undefined') return null;
  if (window.google?.maps?.places) return window.google.maps.places;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) return null;

  if (!loader) {
    loader = new Loader({ apiKey, libraries: ['places'] });
  }

  await loader.load();
  return window.google?.maps?.places || null;
}