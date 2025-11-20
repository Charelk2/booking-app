import { jsx as _jsx } from "react/jsx-runtime";
import { useRecordContext } from 'react-admin';
const colorFor = (v) => {
    const s = (v || '').toLowerCase();
    if (['paid', 'confirmed', 'completed', 'success'].includes(s))
        return '#16a34a';
    if (['queued', 'processing', 'pending', 'scheduled'].includes(s))
        return '#0ea5e9';
    if (['failed', 'cancelled', 'blocked', 'error'].includes(s))
        return '#ef4444';
    if (['warning', 'hold', 'held'].includes(s))
        return '#f59e0b';
    return '#6b7280';
};
export default function StatusBadge({ value, source }) {
    const rec = useRecordContext();
    let v = value;
    if (typeof value === 'function')
        v = value(rec);
    if (v === undefined && source)
        v = rec?.[source];
    const label = String(v ?? '—');
    const bg = '#f3f4f6';
    const fg = colorFor(label);
    const style = {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        background: bg,
        border: `1px solid ${fg}22`,
    };
    return _jsx("span", { style: style, children: label });
}
