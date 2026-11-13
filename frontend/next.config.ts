import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://localhost:4187'}/api/:path*`,
      },
    ];
  },
};
export default config;
