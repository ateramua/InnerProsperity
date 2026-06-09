import { FIFA_2026_MODULE_ENABLED } from '../config';

/** Single integration export for Sidebar — null when module disabled. */
export const fifa2026SidebarNavItem = FIFA_2026_MODULE_ENABLED
  ? {
      id: 'fifa-2026',
      label: 'FIFA 2026',
      icon: '⚽',
      route: '/fifa-2026',
      view: null,
    }
  : null;
