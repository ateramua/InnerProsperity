/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactStrictMode: false,
  swcMinify: true,
  assetPrefix: './',
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: true,
    styledComponents: true,
  },
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