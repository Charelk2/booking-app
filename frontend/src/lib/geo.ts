export interface LatLng {
  lat: number;
  lng: number;
}

export const geocodeAddress = async (address: string): Promise<LatLng | null> => {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
  );
  const data = await res.json();
  if (data.status === 'OK') {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  }
  return null;
};

export const reverseGeocode = async (coords: LatLng): Promise<string | null> => {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const { lat, lng } = coords;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
      `${lat},${lng}`,
    )}&key=${key}`,
  );
  const data = await res.json();
  if (data.status === 'OK' && Array.isArray(data.results) && data.results[0]?.formatted_address) {
    return String(data.results[0].formatted_address);
  }
  return null;
};

export const calculateDistanceKm = (a: LatLng, b: LatLng): number => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};
