/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const { protocol, hostname, port } = new URL(API_URL);

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: ({ url }) =>
        url.origin === self.location.origin &&
        /\.(?:png|svg|ico|woff2?)$/.test(url.pathname),
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
      },
    },
  ],
});

const remotePatterns = [
  {
    protocol: protocol.replace(':', ''),
    hostname,
    port: port || '',
    pathname: '/static/profile_pics/**',
  },
  {
    protocol: protocol.replace(':', ''),
    hostname,
    port: port || '',
    pathname: '/static/default-avatar.svg',
  },
  {
    protocol: protocol.replace(':', ''),
    hostname,
    port: port || '',
    pathname: '/static/cover_photos/**',
  },
  {
    protocol: protocol.replace(':', ''),
    hostname,
    port: port || '',
    pathname: '/static/portfolio_images/**',
  },
];

if (hostname !== 'localhost') {
  remotePatterns.push(
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
      pathname: '/static/profile_pics/**',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
      pathname: '/static/default-avatar.svg',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
      pathname: '/static/cover_photos/**',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
      pathname: '/static/portfolio_images/**',
    },
  );
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns,
  },
};

module.exports = withPWA(nextConfig);
