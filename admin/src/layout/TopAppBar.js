import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { AppBar as RAAppBar, TitlePortal, useDataProvider, useRedirect } from 'react-admin';
import { Toolbar, TextField, InputAdornment, IconButton, Badge, Select, MenuItem, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import NearMeIcon from '@mui/icons-material/NearMe';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
export default function TopAppBar(props) {
    const dp = useDataProvider();
    const redirect = useRedirect();
    const [q, setQ] = React.useState('');
    const [counts, setCounts] = React.useState({ pending: 0, payouts: 0, disputes: 0 });
    const [type, setType] = React.useState('providers');
    React.useEffect(() => {
        (async () => {
            try {
                const [listings, payouts, disputes] = await Promise.all([
                    dp.getList('listings', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'pending_review' } }),
                    dp.getList('payouts', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'queued' } }),
                    dp.getList('disputes', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'open' } }),
                ]);
                setCounts({ pending: (listings?.data?.length ?? listings.total ?? 0), payouts: payouts.total ?? 0, disputes: disputes.total ?? 0 });
            }
            catch { }
        })();
    }, [dp]);
    const doSearch = () => {
        if (!q)
            return;
        if (type === 'providers') {
            redirect(`/providers?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
        }
        else if (type === 'listings') {
            redirect(`/listings?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
        }
        else if (type === 'users') {
            redirect(`/users?email=${encodeURIComponent(q)}`);
        }
        else if (type === 'conversations') {
            redirect(`/conversations?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
        }
    };
    return (_jsxs(RAAppBar, { ...props, children: [_jsxs(Toolbar, { variant: "dense", sx: { gap: 2, display: 'flex', alignItems: 'center' }, children: [_jsx(TitlePortal, {}), _jsx(TextField, { size: "small", placeholder: "Search providers, listings, conversations\u2026", value: q, onChange: (e) => setQ(e.target.value), sx: { minWidth: 240, flex: 1, maxWidth: 520, bgcolor: '#fff', borderRadius: 1, alignSelf: 'center', input: { color: '#000' } }, InputProps: {
                            startAdornment: (_jsx(InputAdornment, { position: "start", children: _jsx(SearchIcon, {}) })),
                            endAdornment: (_jsx(InputAdornment, { position: "end", children: _jsx(IconButton, { onClick: doSearch, children: _jsx(SearchIcon, {}) }) })),
                        } }), _jsxs(Select, { size: "small", value: type, onChange: (e) => setType(e.target.value), sx: { minWidth: 140, bgcolor: '#fff', borderRadius: 1, alignSelf: 'center' }, children: [_jsx(MenuItem, { value: "providers", children: "Providers" }), _jsx(MenuItem, { value: "listings", children: "Listings" }), _jsx(MenuItem, { value: "users", children: "Users" }), _jsx(MenuItem, { value: "conversations", children: "Conversations" })] }), _jsx(Tooltip, { title: "Pending listings", children: _jsx(IconButton, { color: "inherit", onClick: () => redirect('/listings'), "aria-label": "Pending listings", children: _jsx(Badge, { badgeContent: counts.pending, color: "error", children: _jsx(PlaylistAddCheckIcon, {}) }) }) }), _jsx(Tooltip, { title: "Queued payouts", children: _jsx(IconButton, { color: "inherit", onClick: () => redirect('/payouts'), "aria-label": "Queued payouts", children: _jsx(Badge, { badgeContent: counts.payouts, color: "error", children: _jsx(NearMeIcon, {}) }) }) }), _jsx(Tooltip, { title: "Open disputes", children: _jsx(IconButton, { color: "inherit", onClick: () => redirect('/disputes'), "aria-label": "Open disputes", children: _jsx(Badge, { badgeContent: counts.disputes, color: "error", children: _jsx(SupportAgentIcon, {}) }) }) })] }), _jsx("span", { "aria-hidden": true, style: { flex: 1 } })] }));
}
