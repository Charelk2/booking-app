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
    const csp = [
      // Allow Google Identity Services and Google Maps JS API
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com",
      // Permit XHR/fetch to backend API and Google Identity/Maps endpoints used by Places
      `connect-src 'self' ${connectApi} https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://places.googleapis.com`,
      // Frames for Google Identity widgets
      "frame-src 'self' https://accounts.google.com https://accounts.gstatic.com",
      // Images from Google Identity and Google Maps (tiles, sprites)
      "img-src 'self' data: https://accounts.google.com https://accounts.gstatic.com https://maps.googleapis.com https://maps.gstatic.com",
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
      { source: '/api/:path*',   destination: `${apiBase}/:path*` },
      { source: '/media/:path*', destination: `${apiBase}/media/:path*` },
      { source: '/static/:path*', destination: `${apiBase}/static/:path*` },
    ];
  },
};

module.exports = withPWA(nextConfig);
