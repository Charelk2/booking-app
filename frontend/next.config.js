/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
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
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/profile_pics/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/default-avatar.svg' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/cover_photos/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/portfolio_images/**' },
  { protocol: protocol.replace(':', ''), hostname, port: port || '', pathname: '/static/attachments/**' },
];

// Also allow localhost when API_URL points at your IP (useful on laptop)
if (hostname !== 'localhost') {
  remotePatterns.push(
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/profile_pics/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/default-avatar.svg' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/cover_photos/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/portfolio_images/**' },
    { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/static/attachments/**' },
  );
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns,
    // If you prefer to bypass optimization during dev, uncomment:
    // unoptimized: true,
  },
  async headers() {
    return [
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
      { source: '/api/:path*',   destination: `${apiBase}/:path*` },
      { source: '/media/:path*', destination: `${apiBase}/media/:path*` },
      { source: '/static/:path*', destination: `${apiBase}/static/:path*` },
    ];
  },
};

module.exports = withPWA(nextConfig);
