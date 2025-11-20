import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { IconButton, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { useRecordContext } from 'react-admin';
import CodeIcon from '@mui/icons-material/Code';
export default function JsonButton({ value, source, title = 'Details' }) {
    const [open, setOpen] = React.useState(false);
    const rec = useRecordContext();
    let v = value;
    if (typeof value === 'function')
        v = value(rec);
    if (v === undefined && source)
        v = rec?.[source];
    return (_jsxs(_Fragment, { children: [_jsx(IconButton, { size: "small", onClick: () => setOpen(true), "aria-label": "view json", children: _jsx(CodeIcon, { fontSize: "small" }) }), _jsxs(Dialog, { open: open, onClose: () => setOpen(false), maxWidth: "sm", fullWidth: true, children: [_jsx(DialogTitle, { children: title }), _jsx(DialogContent, { children: _jsx("pre", { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }, children: JSON.stringify(v ?? {}, null, 2) }) })] })] }));
}
