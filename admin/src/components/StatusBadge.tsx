import * as React from 'react';
import { useRecordContext } from 'react-admin';

const colorFor = (v: string) => {
  const s = (v || '').toLowerCase();
  if (['paid','confirmed','completed','success'].includes(s)) return '#16a34a';
  if (['queued','processing','pending','scheduled'].includes(s)) return '#0ea5e9';
  if (['failed','cancelled','blocked','error'].includes(s)) return '#ef4444';
  if (['warning','hold','held'].includes(s)) return '#f59e0b';
  return '#6b7280';
};

export default function StatusBadge({ value, source }: { value?: any | ((rec:any)=>any); source?: string }) {
  const rec = useRecordContext<any>();
  let v: any = value;
  if (typeof value === 'function') v = value(rec);
  if (v === undefined && source) v = rec?.[source];
  const label = String(v ?? '—');
  const bg = '#f3f4f6';
  const fg = colorFor(label);
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    color: fg,
    background: bg,
    border: `1px solid ${fg}22`,
  };
  return <span style={style}>{label}</span>;
}
