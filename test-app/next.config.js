/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // The @uncaught/core transport uses dynamic import('fs/promises')
      // which is only executed server-side, but webpack still tries to resolve it.
      // Tell webpack to treat these as empty modules on the client.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
      };
    }
    return config;
  },
};
module.exports = nextConfig;
