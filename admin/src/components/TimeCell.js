import { jsx as _jsx } from "react/jsx-runtime";
import { useRecordContext } from 'react-admin';
export default function TimeCell({ value, source }) {
    const rec = useRecordContext();
    let v = value;
    if (typeof value === 'function')
        v = value(rec);
    if (v === undefined && source)
        v = rec?.[source];
    if (!v)
        return _jsx("span", { children: "\u2014" });
    try {
        const d = new Date(v);
        const local = d.toLocaleString();
        const iso = d.toISOString();
        return _jsx("time", { dateTime: iso, title: iso, children: local });
    }
    catch {
        return _jsx("span", { children: String(v) });
    }
}
