import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { Title } from 'react-admin';
import { Box, Button, Card, CardContent, CardHeader, Grid, Typography, Alert, Stack } from '@mui/material';
// Infer admin API base (same heuristic as authProvider/dataProvider)
const inferAdminApiUrl = () => {
    const env = import.meta.env?.VITE_API_URL;
    if (env)
        return env;
    const host = window.location.hostname;
    if (host.endsWith('booka.co.za'))
        return 'https://api.booka.co.za/admin';
    return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};
const ADMIN_API_URL = inferAdminApiUrl();
const ROOT_API_URL = ADMIN_API_URL.replace(/\/?admin\/?$/, '');
export default function Migrations() {
    const [busy, setBusy] = React.useState(false);
    const [profileRes, setProfileRes] = React.useState(null);
    const [serviceRes, setServiceRes] = React.useState(null);
    const [error, setError] = React.useState(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('booka_admin_token') : null;
    const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
    const runProfiles = async () => {
        setError(null);
        setBusy(true);
        try {
            const res = await fetch(`${ROOT_API_URL}/api/v1/ops/migrate-profile-images-to-files`, { method: 'POST', headers });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const json = (await res.json());
            setProfileRes(json);
        }
        catch (e) {
            setError(`Profile images migration failed: ${e?.message || String(e)}`);
        }
        finally {
            setBusy(false);
        }
    };
    const runServices = async () => {
        setError(null);
        setBusy(true);
        try {
            const res = await fetch(`${ROOT_API_URL}/api/v1/ops/migrate-service-media-to-files`, { method: 'POST', headers });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const json = (await res.json());
            setServiceRes(json);
        }
        catch (e) {
            setError(`Service media migration failed: ${e?.message || String(e)}`);
        }
        finally {
            setBusy(false);
        }
    };
    const reset = () => { setProfileRes(null); setServiceRes(null); setError(null); };
    return (_jsxs(Box, { p: 2, children: [_jsx(Title, { title: "Migrations" }), _jsx(Typography, { variant: "h6", gutterBottom: true, children: "Image Migrations" }), _jsx(Typography, { variant: "body2", color: "text.secondary", gutterBottom: true, children: "Convert legacy data: URLs to static file URLs so Next.js can optimize images. Safe to run multiple times." }), _jsx(Stack, { spacing: 2, sx: { my: 2 }, children: error && _jsx(Alert, { severity: "error", children: error }) }), _jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { item: true, xs: 12, md: 6, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Profile Images", subheader: "Users & service providers (profile pics, covers, portfolio array)" }), _jsxs(CardContent, { children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", children: [_jsx(Button, { variant: "contained", onClick: runProfiles, disabled: busy, children: "Run Migration" }), _jsx(Button, { onClick: reset, disabled: busy, children: "Clear" })] }), profileRes && (_jsxs(Box, { mt: 2, children: [_jsx(Typography, { variant: "subtitle2", children: "Result" }), _jsx("pre", { style: { background: '#f6f8fa', padding: 12, borderRadius: 8, overflowX: 'auto' }, children: JSON.stringify(profileRes, null, 2) })] }))] })] }) }), _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Service Media", subheader: "Services.media_url data: \u2192 /static/portfolio_images" }), _jsxs(CardContent, { children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", children: [_jsx(Button, { variant: "contained", onClick: runServices, disabled: busy, children: "Run Migration" }), _jsx(Button, { onClick: reset, disabled: busy, children: "Clear" })] }), serviceRes && (_jsxs(Box, { mt: 2, children: [_jsx(Typography, { variant: "subtitle2", children: "Result" }), _jsx("pre", { style: { background: '#f6f8fa', padding: 12, borderRadius: 8, overflowX: 'auto' }, children: JSON.stringify(serviceRes, null, 2) })] }))] })] }) })] }), _jsx(Box, { mt: 3, children: _jsxs(Alert, { severity: "info", children: ["After running, refresh a service provider page and check Network for ", _jsx("code", { children: "/_next/image" }), " requests."] }) })] }));
}
