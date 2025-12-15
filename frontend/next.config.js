/** @type {import('next').NextConfig} */
// Choose a sane default for production so rewrites don't point at localhost
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000');
const { protocol, hostname, port } = new URL(API_URL);
const apiBase = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
// Optional separate WS URL (e.g., to avoid Next dev proxy); default to API_URL
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || API_URL;
let wsOrigin = '';
try {
  const u = new URL(WS_URL);
  wsOrigin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:');
} catch {}

// PWA
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Never cache API requests (prevents offline SW from breaking login/data)
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:png|svg|ico|woff2?)$/.test(url.pathname),
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      // App shell for offline navigation
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: { cacheName: 'app-shell', networkTimeoutSeconds: 3 },
    },
    {
      // Critical CSS
      urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:css)$/.test(url.pathname),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'styles' },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
});

// next/image remote patterns for your backend (profile pics, covers, etc.)
const remotePatterns = [
  // Direct mounts for uploaded assets
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/profile_pics/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/cover_photos/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/portfolio_images/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/attachments/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/media/**' },
  // Static assets (default avatar, etc.)
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/profile_pics/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/default-avatar.svg' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/cover_photos/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/portfolio_images/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/attachments/**' },
];

// Also allow localhost when API_URL points at your IP (useful on laptop)
if (hostname !== 'localhost') {
  remotePatterns.push(
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/profile_pics/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/cover_photos/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/portfolio_images/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/attachments/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/media/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/profile_pics/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/default-avatar.svg' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/cover_photos/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/portfolio_images/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/attachments/**' },
  );
}

// Hard-allow production API origin to prevent env drift from breaking images
remotePatterns.push(
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/profile_pics/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/cover_photos/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/portfolio_images/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/attachments/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/media/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/static/profile_pics/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/static/default-avatar.svg' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/static/cover_photos/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/static/portfolio_images/**' },
  { protocol: 'https', hostname: 'api.booka.co.za', pathname: '/static/attachments/**' },
);

// Cloudflare Images delivery (groundwork)
remotePatterns.push(
  { protocol: 'https', hostname: 'imagedelivery.net', pathname: '/**' },
);
// Optional custom domain for Cloudflare Images (e.g., images.example.com)
if (process.env.NEXT_PUBLIC_CF_IMAGES_DOMAIN) {
  try {
    const u = new URL(`https://${process.env.NEXT_PUBLIC_CF_IMAGES_DOMAIN.replace(/^https?:\/\//, '')}`);
    remotePatterns.push({ protocol: 'https', hostname: u.hostname, pathname: '/**' });
  } catch {}
}

// Allow media served from Cloudflare R2 (public base) and the S3 endpoint host
try {
  const r2Public = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || 'https://media.booka.co.za').replace(/\/+$/, '');
  const r2PublicHost = new URL(r2Public).hostname;
  if (r2PublicHost && r2PublicHost !== 'api.booka.co.za') {
    remotePatterns.push({ protocol: 'https', hostname: r2PublicHost, pathname: '/**' });
  }
} catch {}
try {
  const r2Endpoint = (process.env.NEXT_PUBLIC_R2_S3_ENDPOINT || '').replace(/\/+$/, '');
  const r2Host = r2Endpoint ? new URL(r2Endpoint).hostname : (process.env.NEXT_PUBLIC_R2_ACCOUNT_ID ? `${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com` : '');
  if (r2Host) {
    remotePatterns.push({ protocol: 'https', hostname: r2Host, pathname: '/**' });
  }
} catch {}

// Helper: derive R2 endpoints for CSP/image allowlists
const R2_PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || 'https://media.booka.co.za').replace(/\/+$/, '');
const R2_ACCOUNT_ID = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
const R2_S3_ENDPOINT = (process.env.NEXT_PUBLIC_R2_S3_ENDPOINT || '').replace(/\/+$/, '');
// Prefer explicit endpoint, otherwise build EU endpoint from account id, otherwise wildcard subdomain
const R2_S3_ORIGIN = (() => {
  try {
    if (R2_S3_ENDPOINT) return new URL(R2_S3_ENDPOINT).origin;
    if (R2_ACCOUNT_ID) return `https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`;
  } catch {}
  // CSP supports wildcard subdomains; use as a last resort
  return 'https://*.r2.cloudflarestorage.com';
})();

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Allow production builds on Vercel even if there are
  // outstanding ESLint or TypeScript issues in test/dev files.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns,
    // Enable Next.js image optimizer; we’ll mark blob/data previews as unoptimized per-image.
    unoptimized: false,
    // Reduce revalidation frequency for optimized images; encourages browser to reuse cached transforms
    minimumCacheTTL: 86400, // 1 day
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const connectApi = apiBase; // e.g., https://api.booka.co.za
    // Derive WebSocket origins for CSP connect-src (API base + explicit WS base if set)
    const wsApi = apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const wsExtra = wsOrigin && wsOrigin !== wsApi ? ` ${wsOrigin}` : '';
    // In development, Next.js React Refresh uses eval/new Function.
    // Allow 'unsafe-eval' only in dev so HMR works on localhost.
    const scriptSrcBase = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;
    const scriptSrcElemBase = `script-src-elem 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

    const csp = [
      // Default policy
      "default-src 'self'",
      // Scripts: app + Google Identity/Maps + Paystack + Cloudflare Insights + Vercel Live
      `${scriptSrcBase} https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com https://js.paystack.co https://static.cloudflareinsights.com https://va.vercel-scripts.com https://vercel.live`,
      // Cover script elements explicitly (older browsers fallback to script-src, but be explicit)
      `${scriptSrcElemBase} https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com https://js.paystack.co https://static.cloudflareinsights.com https://va.vercel-scripts.com https://vercel.live`,
      // XHR/fetch and WebSocket: backend API, R2, Google Identity/Maps, Paystack, and Cloudflare Insights collection
      `connect-src 'self' ${connectApi} ${wsApi}${wsExtra} ${R2_S3_ORIGIN} ${R2_PUBLIC_BASE} https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://places.googleapis.com https://api.paystack.co https://cloudflareinsights.com`,
      // Frames for Google Identity widgets, Paystack's checkout iframe, and Google Maps embeds
      "frame-src 'self' https://accounts.google.com https://accounts.gstatic.com https://js.paystack.co https://checkout.paystack.com https://www.google.com https://maps.google.com",
      // Images: backend API, Cloudflare R2, Cloudflare Images, Google Identity/Maps, and local blob/data
      `img-src 'self' data: blob: ${connectApi} https://api.booka.co.za ${R2_PUBLIC_BASE} ${R2_S3_ORIGIN} https://imagedelivery.net https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com`,
      // Media (audio/video) sources including R2 and local blob previews
      `media-src 'self' data: blob: ${connectApi} ${R2_PUBLIC_BASE} ${R2_S3_ORIGIN}`,
      // Styles: inline + GSI stylesheet; Maps injects inline styles too
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      // Fonts: self + data URIs for inlined fonts when present
      "font-src 'self' data:",
      // Workers (if any): allow same-origin + blob
      "worker-src 'self' blob:",
      // Lock down other legacy sinks
      "object-src 'none'",
      // Restrict base URI
      "base-uri 'self'",
      // Frame-ancestors: disallow embedding off-site
      "frame-ancestors 'self'",
    ].join('; ');
    return [
      {
        // Loosen CSP for pages to allow Google Identity Services to render One Tap
        source: '/:path*',
        headers: [
          // Keep clickjacking protection via frame-ancestors, but permit Google's frames
          // Note: frame-ancestors is evaluated by the framed page; we permit Google frames via frame-src
          { key: 'Content-Security-Policy', value: csp },
          // Provide a matching Report-Only policy so report-only scanners don't default to 'none'
          { key: 'Content-Security-Policy-Report-Only', value: csp },
          // Explicitly allow FedCM in modern browsers
          { key: 'Permissions-Policy', value: 'identity-credentials-get=(self)' },
        ],
      },
      {
        // Auth endpoints must never be cached; ensure Set-Cookie passes through unchanged
        source: '/auth/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      {
        // Immutable caching for public static images (favicon, default avatar)
        source: '/:file(favicon|default-avatar).svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Immutable caching for category icons served from /public/categories
        source: '/categories/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/media/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Proxy all backend HTTP requests through Next (works on phone + laptop)
      // Preserve the `/api` prefix when forwarding so paths like
      // `/api/v1/service-provider-profiles` hit `/api/v1/...` on the backend.
      { source: '/api/:path*',   destination: `${apiBase}/api/:path*` },
      // Safety: handle stale bundles that accidentally request /static/api/... by
      // forwarding them to /api/... so avatars and other API-served images keep working
      { source: '/static/api/:path*', destination: '/api/:path*' },
      // Auth routes (cookie-based) should also proxy to the backend
      { source: '/auth/:path*',  destination: `${apiBase}/auth/:path*` },
      { source: '/media/:path*', destination: `${apiBase}/media/:path*` },
      // Direct attachments mount (bypasses /static if desired)
      { source: '/attachments/:path*', destination: `${apiBase}/attachments/:path*` },
      { source: '/static/:path*', destination: `${apiBase}/static/:path*` },
      // Realtime endpoint; WS will use NEXT_PUBLIC_WS_URL when set, but allow same-origin proxy too
      { source: '/api/v1/ws', destination: `${apiBase}/api/v1/ws` },
    ];
  },
};

module.exports = withPWA(nextConfig);
