/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactStrictMode: true,
  swcMinify: false,
  assetPrefix: './',
  productionBrowserSourceMaps: true,
  compiler: {
    removeConsole: false,
    styledComponents: true,
  },
  // Remove exportPathMap - it's causing the build errors
  webpack: (config, { isServer, dev }) => {
    if (!dev && !isServer) {
      config.optimization.splitChunks = false;
      config.optimization.runtimeChunk = false;
    }
    config.module.rules.push({
      test: /\.m?js$/,
      type: "javascript/auto",
      resolve: {
        fullySpecified: false,
      },
    });
    return config;
  },
};

module.exports = nextConfig;