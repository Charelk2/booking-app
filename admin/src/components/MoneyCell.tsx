import * as React from 'react';
import { useRecordContext } from 'react-admin';

const ZAR = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
});

export default function MoneyCell({ value, source }: { value?: any | ((rec:any)=>any); source?: string }) {
  const rec = useRecordContext<any>();
  let v: any = value;
  if (typeof value === 'function') v = value(rec);
  if (v === undefined && source) v = rec?.[source];
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ZAR.format(isFinite(n) ? n : 0)}</span>;
}
