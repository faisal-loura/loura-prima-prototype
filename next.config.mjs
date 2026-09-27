/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Starts the server-side worker (src/instrumentation.ts).
    instrumentationHook: true,
  },
};

export default nextConfig;
