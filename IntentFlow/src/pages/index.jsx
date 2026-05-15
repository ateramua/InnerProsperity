// src/pages/index.jsx
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import AppShell from '../components/layout/AppShell';
import Sidebar from '../components/Navigation/Sidebar';
import ViewContainers from '../views/ViewContainer';
import UpdateIndicator from '../components/UpdateIndicator';

import PropertyMapView from '../views/PropertyMapView';
import ReflectsView from '../views/ReflectsView';

import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import { APP_BG, APP_FG, APP_ON_FG } from '../theme/appPalette';

import '../views/CashAccountsView';
import '../views/AllAccountsView';

import '../views/force-imports';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [currentView, setCurrentView] = useState('propertyMap');
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const { lastUpdate, refresh } = useRealtimeUpdates(
    [
      'transaction:added',
      'transaction:updated',
      'transaction:deleted',
      'budget:assigned',
      'budget:moved',
      'prosperity:updated'
    ],
    (eventType) => {
      switch (eventType) {
        case 'transaction:added':
        case 'transaction:updated':
        case 'transaction:deleted':
          loadAccounts();
          break;

        case 'budget:assigned':
        case 'budget:moved':
          if (currentView === 'propertyMap') {
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
          }
          break;

        default:
          break;
      }
    }
  );

  // Function to load accounts
  const loadAccounts = async () => {
    if (!window.electronAPI) return;

    setLoadingAccounts(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
        if (accountsResult?.success) {
          setAccounts(accountsResult.data || []);
          console.log('💰 HomePage loaded accounts:', accountsResult.data.length);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Load accounts on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ✅ Listen for "accounts-updated" events and refresh accounts
  useEffect(() => {
    const handleAccountsUpdated = () => {
      loadAccounts();
    };

    window.addEventListener('accounts-updated', handleAccountsUpdated);
    const unsubIpc = window.electronAPI?.onAccountsUpdated?.(handleAccountsUpdated);
    return () => {
      window.removeEventListener('accounts-updated', handleAccountsUpdated);
      if (typeof unsubIpc === 'function') unsubIpc();
    };
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  const handleNavigation = (viewId) => {
    setCurrentView(viewId);
  };

  if (loading || loadingAccounts) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center"
        style={{ backgroundColor: APP_BG, color: APP_ON_FG }}
      >
        <div
          className="h-14 w-14 animate-spin rounded-full border-4 shadow-lg"
          style={{ borderColor: `${APP_FG}33`, borderTopColor: APP_FG }}
        />
        <p className="mt-3 text-lg font-medium" style={{ color: APP_ON_FG }}>
          Loading your workspace...
        </p>
      </div>
    );
  }

  return (
    <AppShell title="IntentFlow" subtitle="Your personal finance dashboard with fast navigation and live updates.">
      <div className="flex min-h-[70vh] flex-col gap-6 lg:flex-row">
        <Sidebar
          onNavigate={handleNavigation}
          currentView={currentView}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        <main className="flex-1">
          <div className="glass rounded-3xl p-4 md:p-6 xl:p-8 min-h-[70vh] shadow-2xl shadow-black/30 border border-white/10">
            <ViewContainers
              currentView={currentView}
              accounts={accounts}
              budgetData={{}}
              transactions={[]}
              onNavigate={handleNavigation}
            />
          </div>
        </main>
      </div>

      <UpdateIndicator lastUpdate={lastUpdate} onRefresh={refresh} />
    </AppShell>
  );
}