import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/Layout/AppShell';
import Sidebar from '../components/Navigation/Sidebar';
import Fifa2026Module, { FIFA_2026_MODULE_ENABLED } from '../modules/fifa2026';
import { APP_BG, APP_FG, APP_ON_FG } from '../theme/appPalette';

/**
 * Thin route wrapper — only integration surface for the FIFA 2026 plug-in.
 * Removal: delete this file + src/modules/fifa2026/ + sidebar nav entry + _app.css import.
 */
export default function Fifa2026Page() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!FIFA_2026_MODULE_ENABLED) {
      router.replace('/');
    }
  }, [router]);

  const handleNavigation = (viewId) => {
    if (viewId === 'fifa-2026') return;
    if (viewId === 'forecast') {
      router.push('/forecast');
      return;
    }
    if (viewId === 'investments') {
      router.push('/investments');
      return;
    }
    router.push(`/?view=${viewId}`);
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center"
        style={{ backgroundColor: APP_BG, color: APP_ON_FG }}
      >
        <div
          className="h-14 w-14 animate-spin rounded-full border-4"
          style={{ borderColor: `${APP_FG}33`, borderTopColor: APP_FG }}
        />
      </div>
    );
  }

  if (!FIFA_2026_MODULE_ENABLED) return null;

  return (
    <AppShell
      title="FIFA World Cup 2026"
      subtitle="Tournament dashboard — standings, fixtures, rankings, and knockout bracket."
    >
      <div className="flex min-h-[70vh] flex-col gap-6 lg:flex-row">
        <Sidebar
          onNavigate={handleNavigation}
          currentView="fifa-2026"
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
        <main className="flex-1 overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/30">
          <Fifa2026Module />
        </main>
      </div>
    </AppShell>
  );
}
