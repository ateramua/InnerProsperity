// src/components/Header.jsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // Don't show header on login page
  if (router.pathname === '/login') {
    return null;
  }

  return (
    <header style={styles.header}>
      <div style={styles.headerLeft}>
        <div style={styles.logo} onClick={() => router.push('/')}>
          <i className="fas fa-wallet" style={styles.logoIcon}></i>
          <span style={styles.logoText}>Money Manager</span>
        </div>

        <nav style={styles.nav}>
          <button 
            onClick={() => router.push('/')}
            style={{
              ...styles.navLink,
              ...(router.pathname === '/' ? styles.activeNavLink : {})
            }}
          >
            <i className="fas fa-home"></i> Home
          </button>
          <button 
            onClick={() => router.push('/accounts')}
            style={{
              ...styles.navLink,
              ...(router.pathname === '/accounts' ? styles.activeNavLink : {})
            }}
          >
            <i className="fas fa-wallet"></i> Accounts
          </button>
          <button 
            onClick={() => router.push('/transactions')}
            style={{
              ...styles.navLink,
              ...(router.pathname === '/transactions' ? styles.activeNavLink : {})
            }}
          >
            <i className="fas fa-exchange-alt"></i> Transactions
          </button>
          <button 
            onClick={() => router.push('/settings')}
            style={{
              ...styles.navLink,
              ...(router.pathname === '/settings' ? styles.activeNavLink : {})
            }}
          >
            <i className="fas fa-cog"></i> Settings
          </button>
        </nav>
      </div>

      {/* User menu */}
      {user && (
        <div style={styles.userMenuContainer}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={styles.userButton}
          >
            <div style={{
              ...styles.userAvatar,
              background: user.avatarColor || '#2a5298'
            }}>
              {(user.fullName || user.username).charAt(0).toUpperCase()}
            </div>
            <span style={styles.userName}>{user.fullName || user.username}</span>
            <i className={`fas fa-chevron-${showUserMenu ? 'up' : 'down'}`} style={styles.chevronIcon}></i>
          </button>

          {showUserMenu && (
            <div style={styles.userMenu}>
              <div style={styles.userMenuHeader}>
                <div style={styles.userInfo}>
                  <div style={styles.userFullName}>{user.fullName || user.username}</div>
                  <div style={styles.userUsername}>@{user.username}</div>
                  {user.email && <div style={styles.userEmail}>{user.email}</div>}
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={styles.logoutButton}
                onMouseEnter={(e) => e.target.style.background = '#fee2e2'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                <i className="fas fa-sign-out-alt" style={{ color: '#dc3545' }}></i>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '48px'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  logoIcon: {
    fontSize: '24px',
    color: '#2a5298'
  },
  logoText: {
    fontSize: '1.2rem',
    fontWeight: 600,
    color: '#1e293b'
  },
  nav: {
    display: 'flex',
    gap: '8px'
  },
  navLink: {
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    borderRadius: '20px',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease'
  },
  activeNavLink: {
    background: '#f1f5f9',
    color: '#2a5298'
  },
  userMenuContainer: {
    position: 'relative'
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '40px',
    cursor: 'pointer'
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 600
  },
  userName: {
    fontWeight: 500,
    color: '#334155'
  },
  chevronIcon: {
    fontSize: '12px',
    color: '#64748b'
  },
  userMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    border: '1px solid #e2e8f0',
    minWidth: '240px',
    zIndex: 1000
  },
  userMenuHeader: {
    padding: '16px',
    borderBottom: '1px solid #e2e8f0'
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  userFullName: {
    fontWeight: 600,
    color: '#0f172a',
    fontSize: '1rem'
  },
  userUsername: {
    color: '#64748b',
    fontSize: '0.9rem'
  },
  userEmail: {
    color: '#64748b',
    fontSize: '0.85rem',
    marginTop: '4px'
  },
  logoutButton: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: '#dc3545',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: '0 0 12px 12px'
  }
};