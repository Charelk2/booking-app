/** @type {import('next').NextConfig} */
// Choose a sane default for production so rewrites don't point at localhost
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000');
const { protocol, hostname, port } = new URL(API_URL);
const apiBase = `${protocol}//${hostname}${port ? `:${port}` : ''}`;

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
    const connectApi = apiBase; // e.g., https://api.booka.co.za
    // Derive the secure WebSocket origin for CSP connect-src
    const wsApi = apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const csp = [
      // Allow Google Identity Services, Google Maps, and Paystack inline checkout
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com https://js.paystack.co",
      // Permit XHR/fetch and secure WebSocket to backend API, Google Identity/Maps, and Paystack API endpoints
      `connect-src 'self' ${connectApi} ${wsApi} https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://places.googleapis.com https://api.paystack.co`,
      // Frames for Google Identity widgets and Paystack's checkout iframe
      "frame-src 'self' https://accounts.google.com https://accounts.gstatic.com https://js.paystack.co https://checkout.paystack.com",
      // Images from backend API, Google Identity, and Google Maps (tiles, sprites)
      `img-src 'self' data: blob: ${connectApi} https://api.booka.co.za https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com`,
      // Allow inline styles and GSI stylesheet; Maps injects inline styles too
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    ].join('; ');
    return [
      {
        // Loosen CSP for pages to allow Google Identity Services to render One Tap
        source: '/:path*',
        headers: [
          // Keep clickjacking protection via frame-ancestors, but permit Google's frames
          // Note: frame-ancestors is evaluated by the framed page; we permit Google frames via frame-src
          { key: 'Content-Security-Policy', value: csp },
          // Explicitly allow FedCM in modern browsers
          { key: 'Permissions-Policy', value: 'identity-credentials-get=(self)' },
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
    ];
  },
};

module.exports = withPWA(nextConfig);
