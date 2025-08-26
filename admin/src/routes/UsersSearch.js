import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { Card, CardContent, Grid, TextField as MuiTextField, MenuItem } from '@mui/material';
import { Title, useNotify, useDataProvider } from 'react-admin';
import ConfirmButton from '../components/ConfirmButton';
export default function UsersSearch() {
    const [email, setEmail] = React.useState('');
    const [result, setResult] = React.useState(null);
    const dp = useDataProvider();
    const notify = useNotify();
    const [role, setRole] = React.useState('admin');
    const onSearch = async () => {
        if (!email)
            return;
        try {
            const res = await dp.httpClient(`${dp.API_URL || ''}/users/search?email=${encodeURIComponent(email)}`);
            setResult(res.json);
        }
        catch (e) {
            notify(e?.message || 'Search failed', { type: 'warning' });
        }
    };
    const purge = async (confirmEmail) => {
        if (!result?.user?.id)
            return;
        try {
            await dp.httpClient(`${dp.API_URL || ''}/users/${result.user.id}/purge`, {
                method: 'POST',
                body: JSON.stringify({ confirm: confirmEmail || '', force: true }),
            });
            notify('app.user.purged', { type: 'info' });
            setResult(null);
        }
        catch (e) {
            const detail = e?.body?.detail || e?.message || 'Purge failed';
            notify(detail, { type: 'warning' });
        }
    };
    const makeAdmin = async () => {
        if (!result?.user?.email)
            return;
        try {
            await dp.httpClient(`${dp.API_URL || ''}/admin_users`, {
                method: 'POST',
                body: JSON.stringify({ email: result.user.email, role }),
            });
            notify('app.admin.granted', { type: 'info' });
        }
        catch (e) {
            const detail = e?.body?.detail || e?.message || 'Grant failed';
            notify(detail, { type: 'warning' });
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(Title, { title: "Users" }), _jsx(Grid, { container: true, spacing: 2, children: _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx("h3", { style: { marginTop: 0 }, children: "Search by email" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(MuiTextField, { fullWidth: true, size: "small", placeholder: "email@example.com", value: email, onChange: (e) => setEmail(e.target.value) }), _jsx(ConfirmButton, { label: "Search", onConfirm: onSearch, confirmTitle: "Confirm search" })] }), result && (_jsx("div", { style: { marginTop: 16, lineHeight: 1.7 }, children: result.exists ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("strong", { children: "ID:" }), " ", result.user.id] }), _jsxs("div", { children: [_jsx("strong", { children: "Email:" }), " ", result.user.email] }), _jsxs("div", { children: [_jsx("strong", { children: "Type:" }), " ", result.user.user_type] }), _jsxs("div", { children: [_jsx("strong", { children: "Active:" }), " ", String(result.user.is_active)] }), _jsxs("div", { children: [_jsx("strong", { children: "Verified:" }), " ", String(result.user.is_verified)] }), _jsxs("div", { style: { marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }, children: [_jsx(ConfirmButton, { label: "Purge user", color: "error", confirmTitle: "Type email to confirm purge", confirmPlaceholder: "email@example.com", confirmTextRequired: result.user.email, onConfirm: purge }), _jsx(MuiTextField, { select: true, size: "small", label: "Role", value: role, onChange: (e) => setRole(e.target.value), children: ['support', 'payments', 'trust', 'content', 'admin', 'superadmin'].map(r => (_jsx(MenuItem, { value: r, children: r }, r))) }), _jsx(ConfirmButton, { label: "Make admin", onConfirm: makeAdmin, confirmTitle: "Confirm grant" })] })] })) : (_jsx("div", { children: "User not found" })) }))] }) }) }) })] }));
}
