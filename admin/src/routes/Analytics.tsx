import * as React from 'react';
import { Title } from 'react-admin';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Alert,
  Stack,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const inferAdminApiUrl = () => {
  const env = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (env) return env;
  const host = window.location.hostname;
  if (host.endsWith('booka.co.za')) return 'https://api.booka.co.za/admin';
  return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};

const ADMIN_API_URL = inferAdminApiUrl();
const ROOT_API_URL = ADMIN_API_URL.replace(/\/?admin\/?$/, '');

type Totals = {
  searches: number;
  clicks: number;
  unique_sessions: number;
  unique_users: number;
};

type SourceRow = {
  source: string;
  searches: number;
};

type LocationRow = {
  location: string;
  searches: number;
  clicks: number;
};

type CategoryRow = {
  category_value: string;
  searches: number;
  clicks: number;
};

type ProblemQueryRow = {
  category_value: string | null;
  location: string | null;
  total_searches: number;
  zero_result_count: number;
  zero_result_rate: number;
};

type SearchAnalyticsSummary = {
  totals: Totals;
  by_source: SourceRow[];
  top_locations: LocationRow[];
  top_categories: CategoryRow[];
};

export default function Analytics() {
  const [summary, setSummary] = React.useState<SearchAnalyticsSummary | null>(null);
  const [problems, setProblems] = React.useState<ProblemQueryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('booka_admin_token') : null;
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const [summaryRes, problemsRes] = await Promise.all([
          fetch(`${ROOT_API_URL}/api/v1/search-analytics/summary`, { headers }),
          fetch(`${ROOT_API_URL}/api/v1/search-analytics/problem-queries?limit=20`, {
            headers,
          }),
        ]);

        if (!summaryRes.ok) throw new Error(`Summary HTTP ${summaryRes.status}`);
        if (!problemsRes.ok && problemsRes.status !== 404) {
          throw new Error(`Problem queries HTTP ${problemsRes.status}`);
        }

        const summaryJson = (await summaryRes.json()) as SearchAnalyticsSummary;
        const problemsJson: ProblemQueryRow[] =
          problemsRes.ok ? await problemsRes.json() : [];

        if (!cancelled) {
          setSummary(summaryJson);
          setProblems(Array.isArray(problemsJson) ? problemsJson : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load search analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = summary?.totals;
  const hasData = !!totals && totals.searches > 0;

  const ctr =
    totals && totals.searches > 0
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

  return (
    <Box p={2}>
      <Title title="Analytics · Search" />

      <Typography variant="h6" gutterBottom>
        Search Analytics
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        High-level view of how users search on Booka: where they search from, which
        locations and categories they care about, and how often searches turn into
        artist clicks.
      </Typography>

      <Stack spacing={2} sx={{ my: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      {loading && !summary && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {!loading && !hasData && (
        <Alert severity="info">
          No search analytics yet. Once users start using the search bar, data will
          appear here automatically.
        </Alert>
      )}

      {hasData && (
        <Grid container spacing={2}>
          {/* KPI cards */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Total searches
                </Typography>
                <Typography variant="h4">
                  {totals!.searches.toLocaleString('en-ZA')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Searches with clicks
                </Typography>
                <Typography variant="h4">
                  {totals!.clicks.toLocaleString('en-ZA')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Click-through rate
                </Typography>
                <Typography variant="h4">
                  {ctr.toFixed(1)}
                  <span style={{ fontSize: 16 }}>%</span>
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Unique sessions / users
                </Typography>
                <Typography variant="h6">
                  {totals!.unique_sessions.toLocaleString('en-ZA')} sessions
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {totals!.unique_users.toLocaleString('en-ZA')} users with accounts
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Top locations */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader title="Top locations" subheader="By search volume" />
              <CardContent sx={{ height: 280 }}>
                {locationsData.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No location data yet.
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={locationsData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 32 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="searches" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Top categories */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader title="Top categories" subheader="By search volume" />
              <CardContent sx={{ height: 280 }}>
                {categoriesData.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No category data yet.
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoriesData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 32 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="searches" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* By source */}
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardHeader
                title="Searches by entry point"
                subheader="Header vs hero vs artists page"
              />
              <CardContent sx={{ height: 260 }}>
                {sourcesData.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No source data yet.
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sourcesData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="searches" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Problem queries */}
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardHeader
                title="Problem searches (zero results)"
                subheader="Category/location combinations that often return no providers"
              />
              <CardContent>
                {problems.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No problem searches yet.
                  </Typography>
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Category</TableCell>
                          <TableCell>Location</TableCell>
                          <TableCell align="right">Total searches</TableCell>
                          <TableCell align="right">Zero-result searches</TableCell>
                          <TableCell align="right">Zero-result rate</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {problems.map((row, idx) => (
                          <TableRow key={`${row.category_value}-${row.location}-${idx}`}>
                            <TableCell>{row.category_value || 'Any'}</TableCell>
                            <TableCell>{row.location || 'Any'}</TableCell>
                            <TableCell align="right">
                              {row.total_searches.toLocaleString('en-ZA')}
                            </TableCell>
                            <TableCell align="right">
                              {row.zero_result_count.toLocaleString('en-ZA')}
                            </TableCell>
                            <TableCell align="right">
                              {(row.zero_result_rate * 100).toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

