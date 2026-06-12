/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// `output: 'export'` with `next dev` breaks chunk URLs on nested routes
// (requests like `/login/_next/static/...`). Use static export only for production builds.
const nextConfig = {
  ...(isDev
    ? { distDir: process.env.INTENTFLOW_NEXT_DIST_DIR || '.next' }
    : {
        output: 'export',
        distDir: 'out',
      }),
  trailingSlash: true,
  images: { unoptimized: true },
  assetPrefix: isDev ? undefined : './',
  basePath: '',
  swcMinify: false,
  
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Remove electron-renderer target for static export
      // config.target = 'electron-renderer';
      
      config.resolve.fallback = {
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        util: false,
        url: false,
        buffer: false,
        // Provide browser-safe polyfills for Node.js globals
        __dirname: false,
        process: require.resolve('process/browser'),
      };
      
      // Add ProvidePlugin for process
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: 'process/browser',
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;