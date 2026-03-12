// src/components/ProtectedRoute.jsx
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const redirectAttempted = useRef(false);

  useEffect(() => {
    // Only redirect once, not on every render
    if (!loading && !isAuthenticated && !redirectAttempted.current) {
      console.log('🚫 Not authenticated, redirecting to login');
      redirectAttempted.current = true;
      router.replace('/login');
    }
    
    if (!loading && isAuthenticated) {
      console.log('✅ Authenticated, allowing access');
    }
  }, [loading, isAuthenticated, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #1e5f4b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '48px',
          padding: '48px',
          textAlign: 'center'
        }}>
          <h2 style={{ marginBottom: '20px' }}>Loading...</h2>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #2a5298',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }} />
        </div>
      </div>
    );
  }

  // If not authenticated and not loading, don't render children
  if (!isAuthenticated) {
    return null;
  }

  // If authenticated, render children
  return children;
}