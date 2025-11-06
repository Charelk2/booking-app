import * as React from 'react';
import { useRecordContext } from 'react-admin';

export default function TimeCell({ value, source }: { value?: any | ((rec:any)=>any); source?: string }) {
  const rec = useRecordContext<any>();
  let v: any = value;
  if (typeof value === 'function') v = value(rec);
  if (v === undefined && source) v = rec?.[source];
  if (!v) return <span>—</span>;
  try {
    const d = new Date(v);
    const local = d.toLocaleString();
    const iso = d.toISOString();
    return <time dateTime={iso} title={iso}>{local}</time>;
  } catch {
    return <span>{String(v)}</span>;
  }
}
