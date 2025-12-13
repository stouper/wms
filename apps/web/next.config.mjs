/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // 프론트(4000) → /api/* → 백엔드(3000) 프록시
      { source: '/api/:path*', destination: 'http://127.0.0.1:3000/:path*' },
    ];
  },
};
export default nextConfig;
