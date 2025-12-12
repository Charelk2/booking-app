import { Service } from '@/types';
import { getFullImageUrl, formatCurrency } from '@/lib/utils';

export type ServiceDisplay = {
  id: number;
  title: string;
  type: string;
  mediaUrl: string | null;
  durationLabel: string | null;
  priceNumber: number | null;
  priceText: string | null;
};

export function getServiceDisplay(service: Service, currency: string = 'ZAR'): ServiceDisplay {
  const any = service as any;

  const typeRaw: string = (any.service_type as string) || 'Service';
  const type: string = typeRaw.trim().toLowerCase() === 'personalized video'
    ? 'Personalised Video'
    : typeRaw;
  const titleRaw: string = service.title || any.service_type || 'Service';
  const title: string = titleRaw.trim().toLowerCase() === 'personalized video'
    ? 'Personalised Video'
    : titleRaw;

  const rawMedia = any.media_url || any.image_url || any.cover_image_url || any.photo_url || any.image || null;
  const mediaUrl = rawMedia ? getFullImageUrl(rawMedia) : null;

  const durationLabel: string | null =
    any.duration ||
    (any.details && any.details.duration_label) ||
    (typeof any.duration_minutes === 'number' && Number.isFinite(any.duration_minutes)
      ? `${any.duration_minutes} min`
      : null);

  let priceNumber: number | null = null;
  if (typeof any.base_price === 'number') priceNumber = any.base_price;
  else if (typeof service.price === 'number') priceNumber = service.price;
  else if (typeof any.cost === 'number') priceNumber = any.cost;
  else if (typeof any.base_price === 'string') priceNumber = parseFloat(any.base_price);
  else if (typeof service.price === 'string') priceNumber = parseFloat(service.price as unknown as string);
  else if (typeof any.cost === 'string') priceNumber = parseFloat(any.cost);

  // Use a stable 'en' locale to avoid SSR/CSR mismatch for separators
  const priceText = typeof priceNumber === 'number' && Number.isFinite(priceNumber)
    ? formatCurrency(priceNumber, currency, 'en')
    : null;

  return {
    id: service.id,
    title,
    type,
    mediaUrl,
    durationLabel,
    priceNumber,
    priceText,
  };
}
