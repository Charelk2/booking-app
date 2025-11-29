import { QuoteV2Create, ServiceItem } from "@/types";

type CommonQuoteInput = {
  bookingRequestId: number;
  artistId: number;
  clientId: number;
  serviceName?: string;
  serviceFee: number;
  items: (ServiceItem & { key?: string })[];
  travelFee?: number;
  accommodation?: string | null;
  discount?: number | null | "";
  expiresHours?: number | "" | null;
};

const buildServices = (serviceName: string | undefined, serviceFee: number, items: (ServiceItem & { key?: string })[]): ServiceItem[] => {
  return [
    { description: serviceName ?? "Service fee", price: serviceFee },
    ...items.map(({ key: _key, ...rest }) => rest),
  ];
};

const toExpiryIso = (hours: number | "" | null | undefined): string | null => {
  if (hours === "" || hours == null) return null;
  const hrs = Number(hours);
  if (!Number.isFinite(hrs)) return null;
  return new Date(Date.now() + hrs * 3600000).toISOString();
};

export function buildLiveQuotePayload(
  input: CommonQuoteInput & { soundFee: number; isSupplierParent?: boolean },
): QuoteV2Create {
  const {
    bookingRequestId,
    artistId,
    clientId,
    serviceName,
    serviceFee,
    items,
    soundFee,
    travelFee,
    accommodation,
    discount,
    expiresHours,
    isSupplierParent,
  } = input;

  return {
    booking_request_id: bookingRequestId,
    service_provider_id: artistId,
    artist_id: artistId,
    client_id: clientId,
    services: buildServices(serviceName, serviceFee, items),
    sound_fee: isSupplierParent ? 0 : soundFee,
    travel_fee: travelFee ?? 0,
    accommodation: accommodation || null,
    discount: discount || null,
    expires_at: toExpiryIso(expiresHours),
  };
}

export function buildSoundQuotePayload(
  input: CommonQuoteInput,
): QuoteV2Create {
  const {
    bookingRequestId,
    artistId,
    clientId,
    serviceName,
    serviceFee,
    items,
    travelFee,
    accommodation,
    discount,
    expiresHours,
  } = input;

  return {
    booking_request_id: bookingRequestId,
    service_provider_id: artistId,
    artist_id: artistId,
    client_id: clientId,
    services: buildServices(serviceName ?? "Sound package", serviceFee, items),
    sound_fee: 0,
    travel_fee: travelFee ?? 0,
    accommodation: accommodation || null,
    discount: discount || null,
    expires_at: toExpiryIso(expiresHours),
  };
}
