import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { Card, CardContent, Grid, Typography, TextField, InputAdornment, IconButton, Divider, useMediaQuery } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import NearMeIcon from '@mui/icons-material/NearMe';
import { useDataProvider, Title, useRedirect, Button, SimpleList } from 'react-admin';
export default function Dashboard() {
    const dp = useDataProvider();
    const redirect = useRedirect();
    const isSmall = useMediaQuery('(max-width:900px)');
    const [kpi, setKpi] = React.useState({ bookingsToday: 0, payoutsQueued: 0, disputesOpen: 0, listingsPending: 0 });
    const [pendingListings, setPendingListings] = React.useState([]);
    const [recentConvos, setRecentConvos] = React.useState([]);
    const [emailQuery, setEmailQuery] = React.useState('');
    const [globalQuery, setGlobalQuery] = React.useState('');
    React.useEffect(() => {
        (async () => {
            try {
                const [bookings, payouts, disputes, listings, pendingList, convos] = await Promise.all([
                    dp.getList('bookings', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { today: true } }),
                    dp.getList('payouts', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'queued' } }),
                    dp.getList('disputes', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'open' } }),
                    dp.getList('listings', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'pending_review' } }),
                    dp.getList('listings', { pagination: { page: 1, perPage: 5 }, sort: { field: 'updated_at', order: 'DESC' }, filter: { status: 'pending_review' } }),
                    dp.getList('conversations', { pagination: { page: 1, perPage: 5 }, sort: { field: 'last_at', order: 'DESC' }, filter: {} }),
                ]);
                setKpi({
                    bookingsToday: bookings.total ?? 0,
                    payoutsQueued: payouts.total ?? 0,
                    disputesOpen: disputes.total ?? 0,
                    listingsPending: listings.total ?? 0,
                });
                setPendingListings(pendingList.data ?? []);
                setRecentConvos(convos.data ?? []);
            }
            catch { }
        })();
    }, [dp]);
    const CardKPI = ({ label, value, icon }) => (_jsx(Card, { sx: { height: 130 }, children: _jsxs(CardContent, { children: [_jsxs(Typography, { variant: "overline", color: "text.secondary", sx: { display: 'flex', alignItems: 'center', gap: 1 }, children: [icon, label] }), _jsx(Typography, { variant: "h4", sx: { mt: 1 }, children: value.toLocaleString('en-ZA') })] }) }));
    const QuickAction = ({ label, to, icon }) => (_jsx(Card, { sx: { cursor: 'pointer' }, onClick: () => redirect(to), children: _jsxs(CardContent, { sx: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [icon, _jsx(Typography, { children: label })] }), _jsx(ArrowForwardIcon, {})] }) }));
    const doEmailSearch = () => {
        if (!emailQuery)
            return;
        redirect(`/users?email=${encodeURIComponent(emailQuery)}`);
    };
    const doGlobalSearch = () => {
        if (!globalQuery)
            return;
        redirect(`/providers?filter=${encodeURIComponent(JSON.stringify({ q: globalQuery }))}`);
    };
    return (_jsxs(_Fragment, { children: [_jsx(Title, { title: "Dashboard" }), _jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { item: true, xs: 12, md: 7, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "subtitle2", color: "text.secondary", children: "Global search" }), _jsx(TextField, { fullWidth: true, size: "small", placeholder: "Search providers, listings, conversations\u2026", value: globalQuery, onChange: (e) => setGlobalQuery(e.target.value), InputProps: {
                                            startAdornment: (_jsx(InputAdornment, { position: "start", children: _jsx(SearchIcon, {}) })),
                                            endAdornment: (_jsx(InputAdornment, { position: "end", children: _jsx(IconButton, { onClick: doGlobalSearch, children: _jsx(ArrowForwardIcon, {}) }) })),
                                        } }), _jsx(Divider, { sx: { my: 2 } }), _jsx(Typography, { variant: "subtitle2", color: "text.secondary", children: "Quick user lookup" }), _jsxs(Grid, { container: true, spacing: 1, alignItems: "center", children: [_jsx(Grid, { item: true, xs: 8, md: 9, children: _jsx(TextField, { fullWidth: true, size: "small", placeholder: "email@example.com", value: emailQuery, onChange: (e) => setEmailQuery(e.target.value) }) }), _jsx(Grid, { item: true, xs: 4, md: 3, children: _jsx(Button, { label: "Open", onClick: doEmailSearch }) })] })] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 5, children: _jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { item: true, xs: 6, children: _jsx(CardKPI, { label: "Bookings (Today)", value: kpi.bookingsToday, icon: _jsx(NearMeIcon, { fontSize: "small" }) }) }), _jsx(Grid, { item: true, xs: 6, children: _jsx(CardKPI, { label: "Pending Listings", value: kpi.listingsPending, icon: _jsx(PlaylistAddCheckIcon, { fontSize: "small" }) }) }), _jsx(Grid, { item: true, xs: 6, children: _jsx(CardKPI, { label: "Payouts Queued", value: kpi.payoutsQueued, icon: _jsx(NearMeIcon, { fontSize: "small" }) }) }), _jsx(Grid, { item: true, xs: 6, children: _jsx(CardKPI, { label: "Disputes Open", value: kpi.disputesOpen, icon: _jsx(SupportAgentIcon, { fontSize: "small" }) }) })] }) }), _jsx(Grid, { item: true, xs: 12, children: _jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(QuickAction, { label: "Providers", to: "/providers", icon: _jsx(PeopleAltIcon, {}) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(QuickAction, { label: "Support Inbox", to: "/conversations", icon: _jsx(SupportAgentIcon, {}) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(QuickAction, { label: "Admin Users", to: "/admin_users", icon: _jsx(AdminPanelSettingsIcon, {}) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(QuickAction, { label: "Create Payout Batch", to: "/payouts/run", icon: _jsx(NearMeIcon, {}) }) })] }) }), _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", sx: { mb: 1 }, children: "Pending Moderation" }), isSmall ? (_jsx(SimpleList, { primaryText: (r) => r.title, secondaryText: (r) => `${r.category ?? ''} · ${r.price ?? ''}`, linkType: (r) => ({ pathname: `/listings/${r.id}/show` }), total: pendingListings.length, data: pendingListings })) : (_jsx(Grid, { container: true, spacing: 1, children: pendingListings.map((l) => (_jsxs(Grid, { item: true, xs: 12, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600 }, children: l.title }), _jsxs("div", { style: { color: '#666', fontSize: 12 }, children: [l.category || '—', " \u00B7 ", l.price ?? ''] })] }), _jsx(Button, { label: "Open", onClick: () => redirect(`/listings/${l.id}/show`) })] }), _jsx(Divider, { sx: { my: 1 } })] }, l.id))) }))] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", sx: { mb: 1 }, children: "Recent Conversations" }), isSmall ? (_jsx(SimpleList, { primaryText: (r) => r.provider_email, secondaryText: (r) => r.last_message, tertiaryText: (r) => r.last_at, linkType: (r) => ({ pathname: `/conversations/${r.id}/show` }), data: recentConvos })) : (_jsx(Grid, { container: true, spacing: 1, children: recentConvos.map((t) => (_jsxs(Grid, { item: true, xs: 12, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600 }, children: t.provider_email }), _jsx("div", { style: { color: '#666', fontSize: 12 }, children: t.last_message || '—' })] }), _jsx(Button, { label: "Open", onClick: () => redirect(`/conversations/${t.id}/show`) })] }), _jsx(Divider, { sx: { my: 1 } })] }, t.id))) }))] }) }) })] })] }));
}
