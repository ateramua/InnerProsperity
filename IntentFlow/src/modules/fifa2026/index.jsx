import { TournamentProvider } from './hooks/useTournamentStore';
import TournamentPage from './components/TournamentPage';

/**
 * FIFA 2026 plug-in entry — mount this component from pages/fifa-2026.jsx only.
 * To remove: delete src/modules/fifa2026/, pages/fifa-2026.jsx, and sidebar nav entry.
 */
export default function Fifa2026Module() {
  return (
    <TournamentProvider>
      <TournamentPage />
    </TournamentProvider>
  );
}

export { FIFA_2026_MODULE_ENABLED } from './config';
export { fifa2026SidebarNavItem } from './integration/sidebarNavItem';
