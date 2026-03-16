/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing config
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactStrictMode: true,
  
  // ✅ CRITICAL FIX FOR ELECTRON
  output: 'export',
  assetPrefix: './',  // This makes paths relative
  basePath: '',
  
  // Disable SWC minification to preserve class names
  swcMinify: false,
  
  // Preserve component names and styles
  compiler: {
    styledComponents: {
      displayName: true,
      fileName: true,
      pure: true,
    },
  },
  
  // Generate source maps for debugging
  productionBrowserSourceMaps: true,
  
  // Webpack configuration for production
  webpack: (config, { isServer, dev }) => {
    // Handle .mjs files
    config.module.rules.push({
      test: /\.m?js$/,
      type: "javascript/auto",
      resolve: {
        fullySpecified: false,
      },
    });

    // CRITICAL: Ensure paths are correct for Electron
    if (!dev) {
      config.output.publicPath = './_next/';  // Force correct public path
    }

    return config;
  },
};

module.exports = nextConfig;