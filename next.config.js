/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 800, // Check for file modifications every 800ms
        aggregateTimeout: 300, // Throttle compilation trigger
        ignored: /node_modules/,
      }
    }
    return config
  }
}

module.exports = nextConfig
