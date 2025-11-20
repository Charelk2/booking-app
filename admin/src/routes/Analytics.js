import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { Title } from 'react-admin';
import { Box, Grid, Card, CardContent, CardHeader, Typography, Alert, Stack, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, } from 'recharts';
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
export default function Analytics() {
    const [summary, setSummary] = React.useState(null);
    const [problems, setProblems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('booka_admin_token') : null;
                const headers = token
                    ? { Authorization: `Bearer ${token}` }
                    : {};
                const [summaryRes, problemsRes] = await Promise.all([
                    fetch(`${ROOT_API_URL}/api/v1/search-analytics/summary`, { headers }),
                    fetch(`${ROOT_API_URL}/api/v1/search-analytics/problem-queries?limit=20`, {
                        headers,
                    }),
                ]);
                if (!summaryRes.ok)
                    throw new Error(`Summary HTTP ${summaryRes.status}`);
                if (!problemsRes.ok && problemsRes.status !== 404) {
                    throw new Error(`Problem queries HTTP ${problemsRes.status}`);
                }
                const summaryJson = (await summaryRes.json());
                const problemsJson = problemsRes.ok ? await problemsRes.json() : [];
                if (!cancelled) {
                    setSummary(summaryJson);
                    setProblems(Array.isArray(problemsJson) ? problemsJson : []);
                }
            }
            catch (e) {
                if (!cancelled)
                    setError(e?.message || 'Failed to load search analytics');
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, []);
    const totals = summary?.totals;
    const hasData = !!totals && totals.searches > 0;
    const ctr = totals && totals.searches > 0
        ? (totals.clicks / totals.searches) * 100
        : 0;
    const locationsData = (summary?.top_locations || []).map((row) => ({
        name: row.location || '(missing)',
        searches: row.searches,
        clicks: row.clicks,
    }));
    const categoriesData = (summary?.top_categories || []).map((row) => ({
        name: row.category_value || '(none)',
        searches: row.searches,
        clicks: row.clicks,
    }));
    const sourcesData = (summary?.by_source || []).map((row) => ({
        name: row.source || '(unknown)',
        searches: row.searches,
    }));
    return (_jsxs(Box, { p: 2, children: [_jsx(Title, { title: "Analytics \u00B7 Search" }), _jsx(Typography, { variant: "h6", gutterBottom: true, children: "Search Analytics" }), _jsx(Typography, { variant: "body2", color: "text.secondary", gutterBottom: true, children: "High-level view of how users search on Booka: where they search from, which locations and categories they care about, and how often searches turn into artist clicks." }), _jsx(Stack, { spacing: 2, sx: { my: 2 }, children: error && _jsx(Alert, { severity: "error", children: error }) }), loading && !summary && (_jsx(Box, { sx: { display: 'flex', justifyContent: 'center', my: 4 }, children: _jsx(CircularProgress, { size: 32 }) })), !loading && !hasData && (_jsx(Alert, { severity: "info", children: "No search analytics yet. Once users start using the search bar, data will appear here automatically." })), hasData && (_jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "overline", color: "text.secondary", children: "Total searches" }), _jsx(Typography, { variant: "h4", children: totals.searches.toLocaleString('en-ZA') })] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "overline", color: "text.secondary", children: "Searches with clicks" }), _jsx(Typography, { variant: "h4", children: totals.clicks.toLocaleString('en-ZA') })] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "overline", color: "text.secondary", children: "Click-through rate" }), _jsxs(Typography, { variant: "h4", children: [ctr.toFixed(1), _jsx("span", { style: { fontSize: 16 }, children: "%" })] })] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 3, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "overline", color: "text.secondary", children: "Unique sessions / users" }), _jsxs(Typography, { variant: "h6", children: [totals.unique_sessions.toLocaleString('en-ZA'), " sessions"] }), _jsxs(Typography, { variant: "body2", color: "text.secondary", children: [totals.unique_users.toLocaleString('en-ZA'), " users with accounts"] })] }) }) }), _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Top locations", subheader: "By search volume" }), _jsx(CardContent, { sx: { height: 280 }, children: locationsData.length === 0 ? (_jsx(Typography, { variant: "body2", color: "text.secondary", children: "No location data yet." })) : (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: locationsData, margin: { top: 8, right: 16, left: 0, bottom: 32 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "name", tick: { fontSize: 11 }, interval: 0, angle: -30, textAnchor: "end" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "searches" })] }) })) })] }) }), _jsx(Grid, { item: true, xs: 12, md: 6, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Top categories", subheader: "By search volume" }), _jsx(CardContent, { sx: { height: 280 }, children: categoriesData.length === 0 ? (_jsx(Typography, { variant: "body2", color: "text.secondary", children: "No category data yet." })) : (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: categoriesData, margin: { top: 8, right: 16, left: 0, bottom: 32 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "name", tick: { fontSize: 11 }, interval: 0, angle: -30, textAnchor: "end" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "searches" })] }) })) })] }) }), _jsx(Grid, { item: true, xs: 12, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Searches by entry point", subheader: "Header vs hero vs artists page" }), _jsx(CardContent, { sx: { height: 260 }, children: sourcesData.length === 0 ? (_jsx(Typography, { variant: "body2", color: "text.secondary", children: "No source data yet." })) : (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: sourcesData, margin: { top: 8, right: 16, left: 0, bottom: 16 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "name", tick: { fontSize: 12 } }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "searches" })] }) })) })] }) }), _jsx(Grid, { item: true, xs: 12, children: _jsxs(Card, { variant: "outlined", children: [_jsx(CardHeader, { title: "Problem searches (zero results)", subheader: "Category/location combinations that often return no providers" }), _jsx(CardContent, { children: problems.length === 0 ? (_jsx(Typography, { variant: "body2", color: "text.secondary", children: "No problem searches yet." })) : (_jsx(Box, { sx: { overflowX: 'auto' }, children: _jsxs(Table, { size: "small", children: [_jsx(TableHead, { children: _jsxs(TableRow, { children: [_jsx(TableCell, { children: "Category" }), _jsx(TableCell, { children: "Location" }), _jsx(TableCell, { align: "right", children: "Total searches" }), _jsx(TableCell, { align: "right", children: "Zero-result searches" }), _jsx(TableCell, { align: "right", children: "Zero-result rate" })] }) }), _jsx(TableBody, { children: problems.map((row, idx) => (_jsxs(TableRow, { children: [_jsx(TableCell, { children: row.category_value || 'Any' }), _jsx(TableCell, { children: row.location || 'Any' }), _jsx(TableCell, { align: "right", children: row.total_searches.toLocaleString('en-ZA') }), _jsx(TableCell, { align: "right", children: row.zero_result_count.toLocaleString('en-ZA') }), _jsxs(TableCell, { align: "right", children: [(row.zero_result_rate * 100).toFixed(1), "%"] })] }, `${row.category_value}-${row.location}-${idx}`))) })] }) })) })] }) })] }))] }));
}
