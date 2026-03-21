// src/pages/index.jsx
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import Sidebar from '../components/Navigation/Sidebar';
import ViewContainers from '../views/ViewContainer';
import UpdateIndicator from '../components/UpdateIndicator';

import PropertyMapView from '../views/PropertyMapView';
import ReflectsView from '../views/ReflectsView';

import useRealtimeUpdates from '../hooks/useRealtimeUpdates';

import '../views/CashAccountsView';
import '../views/AllAccountsView';

import '../views/force-imports';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [currentView, setCurrentView] = useState('propertyMap');
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

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

  // ✅ Listen for "accounts-updated" events and refresh accounts
  useEffect(() => {
    const handleAccountsUpdated = () => {
      loadAccounts();
    };

    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
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
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p style={{ marginTop: 12 }}>Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Sidebar
        onNavigate={handleNavigation}
        currentView={currentView}
      />

      <main style={styles.main}>
        <div style={styles.mainGlass}>
          <ViewContainers
            currentView={currentView}
            accounts={accounts}
            budgetData={{}}
            transactions={[]}
            onNavigate={handleNavigation}
          />
        </div>
      </main>

      <UpdateIndicator
        lastUpdate={lastUpdate}
        onRefresh={refresh}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB 0%, #0047AB 40%, #0f2e1c 100%)',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  main: {
    flex: 1,
    marginLeft: '280px',
    padding: '2rem',
    minHeight: '100vh',
    color: 'white'
  },
  mainGlass: {
    backdropFilter: 'blur(16px)',
    background: '#0047AB',
    borderRadius: '18px',
    padding: '2rem',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 0 40px rgba(99,102,241,0.15)',
    minHeight: '85vh'
  },
  loadingContainer: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB, #0047AB, #0047AB)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white'
  },
  loadingSpinner: {
    width: '56px',
    height: '56px',
    border: '5px solid rgba(255,255,255,0.15)',
    borderTopColor: '#6366F1',
    borderRadius: '50%',
    animation: 'spin 0.9s linear infinite',
    boxShadow: '0 0 20px rgba(99,102,241,0.6)'
  }
};