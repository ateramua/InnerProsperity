// src/contexts/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const hasCheckedRef = useRef(false);

  const isElectronRenderer = () => {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
      return true;
    }
    return typeof window.electronAPI !== 'undefined' && !window.electronAPI.__isBrowserMock;
  };

  const hasElectronAPI = () => {
    if (typeof window === 'undefined' || !window.electronAPI) return false;
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
      return !window.electronAPI.__isBrowserMock;
    }
    return !window.electronAPI.__isBrowserMock;
  };

  const waitForElectronAPI = async (timeoutMs = 5000) => {
    if (!isElectronRenderer()) {
      return false;
    }

    const start = Date.now();
    while (!hasElectronAPI() && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return hasElectronAPI();
  };

  useEffect(() => {
    // Only check auth status once on mount
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkAuthStatus();
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      console.log('🔍 Checking auth status...');

      if (!isElectronRenderer()) {
        console.log('ℹ️ Running outside Electron; skipping electronAPI auth check');
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      const isAvailable = await waitForElectronAPI();
      if (!isAvailable) {
        console.error('❌ electronAPI not available after waiting');
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      const result = await window.electronAPI.getCurrentUser();
      console.log('📊 Auth status result:', result);

      if (result && result.success && result.data) {
        setUser(result.data);
        setIsAuthenticated(true);
        console.log('✅ User authenticated:', result.data.username);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        console.log('❌ No user authenticated');
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      setLoading(true);
      console.log('🔐 Login attempt for:', username);

      const isAvailable = await waitForElectronAPI();
      if (!isAvailable) {
        return { success: false, error: 'Electron API not available' };
      }

      const result = await window.electronAPI.loginUser({ username, password });
      console.log('📊 Login result:', result);

      if (result && result.success) {
        setUser(result.data);
        setIsAuthenticated(true);
        return { success: true, data: result.data };
      } else {
        return { success: false, error: result?.error || 'Login failed' };
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    try {
      setLoading(true);
      console.log('👋 Logging out...');

      await waitForElectronAPI();
      if (hasElectronAPI()) {
        await window.electronAPI.logoutUser();
      }

      setUser(null);
      setIsAuthenticated(false);
      console.log('✅ Logout complete - isAuthenticated set to false');

      return { success: true };
    } catch (error) {
      console.error('❌ Logout error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      console.log('📝 Registering user:', userData);

      const isAvailable = await waitForElectronAPI();
      if (!isAvailable) {
        return { success: false, error: 'Electron API not available' };
      }

      const result = await window.electronAPI.createUser(userData);
      console.log('📊 Register result:', result);

      if (result && result.success) {
        return { success: true, data: result.data };
      } else {
        return { success: false, error: result?.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('❌ Registration error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      login,
      logout,
      register,
      checkAuthStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}