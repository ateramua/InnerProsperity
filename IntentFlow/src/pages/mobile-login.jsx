// src/pages/mobile-login.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { Preferences } from '@capacitor/preferences';
import MobileDatabase from '../services/mobileDatabase.mjs';
import { defaultCategoryGroups, defaultCategories } from '../services/seedData.mjs';
import DatabaseProxy from '../services/databaseProxy.mjs';

// At the VERY TOP of mobile-login.jsx, right after imports
console.log('🔥 DEBUG - mobile-login.jsx loaded');
console.log('🔥 DEBUG - DatabaseProxy exists:', !!DatabaseProxy);
console.log('🔥 DEBUG - DatabaseProxy methods available:',
  typeof DatabaseProxy.loginUser === 'function' ? '✅ loginUser' : '❌ missing',
  typeof DatabaseProxy.getAccounts === 'function' ? '✅ getAccounts' : '❌ missing',
  typeof DatabaseProxy.getCategories === 'function' ? '✅ getCategories' : '❌ missing'
);

export default function MobileLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  // Initialize database on component mount
  useEffect(() => {
    const env = DatabaseProxy.getEnvironment();
    console.log('🔍 Current environment:', env);

    // TEMPORARY: Skip database initialization entirely
    // We're using hardcoded users, so no database needed
    console.log('🔍 Skipping database initialization - using hardcoded users');
    setIsDatabaseReady(true);
  }, []);

  // const initializeDatabase = async () => {
  //   try {
  //     await MobileDatabase.initialize();
  //     setIsDatabaseReady(true);
  //     console.log('✅ Mobile database ready');
  //   } catch (err) {
  //     console.error('Failed to initialize database:', err);
  //     setError('Failed to initialize database. Please restart the app.');
  //   }
  // };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      console.log('🔍 1. Login attempt with:', { username, password });

      const result = await DatabaseProxy.loginUser(username, password);

      console.log('🔍 2. Login result:', result);

      if (result?.success) {
        // Store session in Capacitor Preferences
        await Preferences.set({
          key: 'userSession',
          value: JSON.stringify(result.data)
        });

        // Update auth context
        await login(result.data);

        // Navigate to home
        router.push('/mobile-home');
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      console.error('🔍 3. Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  // Add this TEMPORARY login handler RIGHT BEFORE your existing handleLogin function
  const tempHandleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      console.log('🔥 TEMP LOGIN - Attempt with:', username);

      // Hardcoded check right here
      if (username === 'teramua' && password === 'test1234') {
        console.log('🔥 TEMP LOGIN - Success!');

        const userData = { id: 1, username: 'teramua', full_name: 'Test User' };

        await Preferences.set({
          key: 'userSession',
          value: JSON.stringify(userData)
        });

        await login(userData);
        router.push('/mobile-home');
        return;
      }

      if (username === 'demo' && password === 'demo123') {
        console.log('🔥 TEMP LOGIN - Success!');

        const userData = { id: 2, username: 'demo', full_name: 'Demo User' };

        await Preferences.set({
          key: 'userSession',
          value: JSON.stringify(userData)
        });

        await login(userData);
        router.push('/mobile-home');
        return;
      }

      setError('Invalid username or password');
    } catch (err) {
      console.error('🔥 TEMP LOGIN - Error:', err);
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };
  // For testing/development: create a demo user
  const createDemoUser = async () => {
    setIsLoading(true);
    setError('');

    try {
      console.log('🔍 Creating test user...');
      const result = await DatabaseProxy.createUser({
        username: 'testuser',
        email: 'test@example.com',
        fullName: 'Test User'
      });
      console.log('🔍 Test user creation result:', result);

      if (result?.success) {
        alert('Demo user created! Try logging in with username: testuser');
      }
    } catch (err) {
      console.error('Error creating test user:', err);
      setError('Failed to create demo user');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isDatabaseReady) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* App Header */}
      <div style={styles.header}>
        <h1 style={styles.appName}>IntentFlow</h1>
        <p style={styles.tagline}>Take control of your finances</p>
      </div>

      {/* Login Form */}
      <form onSubmit={tempHandleLogin} style={styles.form}>
        {error && (
          <div style={styles.errorMessage}>
            {error}
          </div>
        )}

        <div style={styles.inputGroup}>
          <label style={styles.label}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            placeholder="Enter your username"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            ...styles.loginButton,
            ...(isLoading ? styles.loginButtonDisabled : {})
          }}
        >
          {isLoading ? 'Logging in...' : 'Log In'}
        </button>

        {/* Demo User Button (for testing) */}
        <button
          type="button"
          style={styles.demoButton}
          onClick={createDemoUser}
          disabled={isLoading}
        >
          <span style={styles.demoIcon}>🧪</span>
          Create Demo User
        </button>

        {/* Biometric Login Option (for supported devices) */}
        <button
          type="button"
          style={styles.biometricButton}
          onClick={() => console.log('Biometric login - to be implemented')}
        >
          <span style={styles.biometricIcon}>👆</span>
          Use Face ID / Touch ID
        </button>
      </form>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.footerText}>
          Need help? <a href="#" style={styles.footerLink}>Contact Support</a>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB 0%, #0A2472 100%)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    color: 'white',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  loadingContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.7)',
  },
  header: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: '40px',
    marginTop: '60px',
  },
  appName: {
    fontSize: '42px',
    fontWeight: 'bold',
    margin: 0,
    marginBottom: '8px',
    background: 'linear-gradient(135deg, #FFFFFF, #E0E7FF)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  tagline: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.7)',
    margin: 0,
  },
  form: {
    flex: 2,
    width: '100%',
    maxWidth: '400px',
    margin: '0 auto',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  input: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    color: 'white',
    outline: 'none',
    transition: 'all 0.2s',
    WebkitAppearance: 'none',
  },
  loginButton: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '600',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    marginTop: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
  },
  loginButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  demoButton: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    background: '#10B981',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    marginTop: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: '500',
  },
  demoIcon: {
    fontSize: '20px',
  },
  biometricButton: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    color: 'white',
    marginTop: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  biometricIcon: {
    fontSize: '20px',
  },
  errorMessage: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid #EF4444',
    color: '#EF4444',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center',
    fontSize: '14px',
  },
  footer: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: '20px',
  },
  footerText: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
  },
  footerLink: {
    color: '#3B82F6',
    textDecoration: 'none',
  },
};

// Add keyframe animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}