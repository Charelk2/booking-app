/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    // Allow localhost (for local development) and the LAN IP
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/static/**',
      },
      {
        protocol: 'http',
        hostname: '192.168.3.203',
        port: '8000',
        pathname: '/static/**',
      },
    ],
    // If you prefer using domains instead of remotePatterns, you can uncomment:
    // domains: ['localhost', '192.168.3.203'],
  },
};

module.exports = nextConfig;
