/**
 * FIFA 2026 plug-in integration manifest.
 *
 * Touchpoints to remove/disable this module:
 * 1. src/modules/fifa2026/                    — entire module
 * 2. src/pages/fifa-2026.jsx                 — route wrapper
 * 3. Sidebar.jsx                             — fifa2026SidebarNavItem import + spread + handleNavigation
 * 4. src/pages/_app.jsx                      — fifa2026.css import
 * 5. config.jsx                              — FIFA_2026_MODULE_ENABLED = false (soft disable)
 */
export const FIFA_2026_INTEGRATION = {
  route: '/fifa-2026',
  storageKey: 'intentflow:fifa2026:v7',
  touchpoints: [
    'src/modules/fifa2026/',
    'src/pages/fifa-2026.jsx',
    'src/components/Navigation/Sidebar.jsx',
    'src/pages/_app.jsx',
  ],
};
