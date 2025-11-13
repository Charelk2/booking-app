import type { QuoteV2, QuoteTotalsPreview as QuoteTotalsPreviewPayload } from '@/types';

export interface QuoteTotalsResolved {
  providerSubtotal?: number;
  platformFeeExVat?: number;
  platformFeeVat?: number;
  clientTotalInclVat?: number;
}

export const QUOTE_TOTALS_PLACEHOLDER = '—';

const toNumber = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export function resolveQuoteTotalsPreview(source?: Partial<QuoteV2> | null): QuoteTotalsResolved {
  const nested = (source as { totals_preview?: QuoteTotalsPreviewPayload | null })?.totals_preview;
  const legacy: any = source ?? {};

  return {
    // Safe provider subtotal fallback: use quote.subtotal if preview missing
    providerSubtotal: toNumber(
      nested?.provider_subtotal ?? legacy?.provider_subtotal_preview ?? (legacy?.subtotal as any),
    ),
    platformFeeExVat: toNumber(nested?.platform_fee_ex_vat ?? legacy?.booka_fee_preview),
    platformFeeVat: toNumber(nested?.platform_fee_vat ?? legacy?.booka_fee_vat_preview),
    clientTotalInclVat: toNumber(nested?.client_total_incl_vat ?? legacy?.client_total_preview),
  };
}

export const hasClientTotalPreview = (preview?: QuoteTotalsResolved): boolean =>
  typeof preview?.clientTotalInclVat === 'number' && Number.isFinite(preview.clientTotalInclVat);
