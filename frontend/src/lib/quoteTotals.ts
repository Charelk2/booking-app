import type { QuoteV2, QuoteTotalsPreview as QuoteTotalsPreviewPayload } from '@/types';

export interface QuoteTotalsResolved {
  providerSubtotal?: number;
  platformFeeExVat?: number;
  platformFeeVat?: number;
  clientTotalInclVat?: number;
}

export const QUOTE_TOTALS_PLACEHOLDER = '—';

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

/**
 * Normalize totals preview data from QuoteV2 responses (nested or legacy fields).
 * All Booka fee + VAT math happens on the backend; this helper simply surfaces
 * the provided values so components can display them or fall back to a placeholder.
 */
export function resolveQuoteTotalsPreview(source?: Partial<QuoteV2> | null): QuoteTotalsResolved {
  const nested = (source as { totals_preview?: QuoteTotalsPreviewPayload | null })?.totals_preview;
  const legacy: any = source ?? {};
  return {
    providerSubtotal: toNumber(nested?.provider_subtotal ?? legacy?.provider_subtotal_preview),
    platformFeeExVat: toNumber(nested?.platform_fee_ex_vat ?? legacy?.booka_fee_preview),
    platformFeeVat: toNumber(nested?.platform_fee_vat ?? legacy?.booka_fee_vat_preview),
    clientTotalInclVat: toNumber(nested?.client_total_incl_vat ?? legacy?.client_total_preview),
  };
}

export const hasClientTotalPreview = (preview: QuoteTotalsResolved | undefined): boolean =>
  typeof preview?.clientTotalInclVat === 'number' && Number.isFinite(preview.clientTotalInclVat);
