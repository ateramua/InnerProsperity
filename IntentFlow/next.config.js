console.log('✅ USING next.config.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',

  reactStrictMode: false,

  trailingSlash: true,

  productionBrowserSourceMaps: false,

  images: {
    unoptimized: true,
  },

  assetPrefix: './',

  compiler: {
    removeConsole: false,
    styledComponents: true,
  },

  experimental: {
    esmExternals: false,
  },

  webpack: (config, { isServer, dev }) => {

    /*
      REQUIRED FOR ELECTRON + NEXT STATIC EXPORT
    */
    if (!dev && !isServer) {
      config.optimization.splitChunks = false;
      config.optimization.runtimeChunk = false;
    }

    /*
      Fix .mjs module resolution
    */
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false,
      },
    });

    /*
      Prevent Electron/Node modules from breaking frontend build
    */
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
        os: false,
        crypto: false,
        sqlite3: false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;