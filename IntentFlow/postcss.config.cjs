module.exports = {
  plugins: {
    // Required plugins
    tailwindcss: {},
    autoprefixer: {},
    
    // 🚀 ADD THESE FOR PRODUCTION DESKTOP
    ...(process.env.NODE_ENV === 'production' && {
      // Optimize CSS for production but preserve all classes
      'cssnano': {
        preset: ['default', {
          discardComments: {
            removeAll: true,  // Remove comments (safe)
          },
          normalizeWhitespace: true,  // Minify whitespace (safe)
          // CRITICAL: Preserve all class names for sidebar
          reduceIdents: false,  // DON'T rename keyframes/IDs
          zindex: false,        // DON'T optimize z-index
          mergeIdents: false,   // DON'T merge CSS classes
          discardDuplicates: true,  // Safe - remove duplicates
          discardEmpty: true,       // Safe - remove empty rules
          minifyFontValues: true,   // Safe - minify font declarations
          colormin: true,           // Safe - minify colors
          convertValues: true,      // Safe - convert values
          normalizeUrl: true,       // Safe - normalize URLs
          orderedValues: true,      // Safe - order values
          minifySelectors: false,   // ⚠️ DON'T minify selectors
          minifyParams: false,      // ⚠️ DON'T minify parameters
        }],
      },
      
      // Additional optimization for production
      'postcss-discard-comments': {
        removeAll: true,  // Remove comments only
      },
    }),
  },
};

// Add environment variable detection
const isProduction = process.env.NODE_ENV === 'production';

console.log(`📦 PostCSS running in ${isProduction ? '🚀 PRODUCTION' : '🔧 DEVELOPMENT'} mode`);