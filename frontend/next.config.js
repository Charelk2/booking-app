/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const { protocol, hostname, port } = new URL(API_URL);

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

module.exports = nextConfig;
