// src/contexts/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const hasCheckedRef = useRef(false);

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

      if (window.electronAPI) {
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
      } else {
        console.error('❌ electronAPI not available');
        setUser(null);
        setIsAuthenticated(false);
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

      if (window.electronAPI) {
        const result = await window.electronAPI.loginUser({ username, password });
        console.log('📊 Login result:', result);

        if (result && result.success) {
          setUser(result.data);
          setIsAuthenticated(true);
          return { success: true, data: result.data };
        } else {
          return { success: false, error: result?.error || 'Login failed' };
        }
      } else {
        return { success: false, error: 'Electron API not available' };
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

      if (window.electronAPI) {
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

      if (window.electronAPI) {
        const result = await window.electronAPI.createUser(userData);
        console.log('📊 Register result:', result);

        if (result && result.success) {
          return { success: true, data: result.data };
        } else {
          return { success: false, error: result?.error || 'Registration failed' };
        }
      } else {
        return { success: false, error: 'Electron API not available' };
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