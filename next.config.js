const path = require('path');
const os = require('os');

const target = path.join(os.tmpdir(), 'next-jukebox-build');
const relativePath = path.relative(__dirname, target);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: relativePath,
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
