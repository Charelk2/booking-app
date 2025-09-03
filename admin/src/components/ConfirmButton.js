import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { Button } from 'react-admin';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
export default function ConfirmButton({ label, confirmTitle = 'Please confirm', confirmContent, confirmPlaceholder, confirmTextRequired, onConfirm, color = 'primary', variant = 'outlined', }) {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);
    const disabled = !!confirmTextRequired && value.trim() !== confirmTextRequired.trim();
    const handleConfirm = async () => {
        try {
            setSubmitting(true);
            await onConfirm(value);
            setOpen(false);
            setValue('');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(Button, { label: label, color: color, variant: variant, onClick: () => setOpen(true) }), _jsxs(Dialog, { open: open, onClose: () => setOpen(false), fullWidth: true, maxWidth: "xs", children: [_jsx(DialogTitle, { children: confirmTitle }), _jsxs(DialogContent, { children: [_jsx("div", { style: { marginTop: 8, color: '#555' }, children: confirmContent }), confirmTextRequired !== undefined && (_jsx(TextField, { autoFocus: true, margin: "dense", fullWidth: true, placeholder: confirmPlaceholder, value: value, onChange: (e) => setValue(e.target.value) }))] }), _jsxs(DialogActions, { children: [_jsx(Button, { label: "Cancel", onClick: () => setOpen(false) }), _jsx(Button, { label: "Confirm", onClick: handleConfirm, disabled: submitting || disabled, color: color })] })] })] }));
}
