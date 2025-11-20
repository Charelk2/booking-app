import { jsx as _jsx } from "react/jsx-runtime";
import { useRecordContext } from 'react-admin';
const ZAR = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
});
export default function MoneyCell({ value, source }) {
    const rec = useRecordContext();
    let v = value;
    if (typeof value === 'function')
        v = value(rec);
    if (v === undefined && source)
        v = rec?.[source];
    const n = typeof v === 'number' ? v : Number(v ?? 0);
    return _jsx("span", { style: { fontVariantNumeric: 'tabular-nums' }, children: ZAR.format(isFinite(n) ? n : 0) });
}
