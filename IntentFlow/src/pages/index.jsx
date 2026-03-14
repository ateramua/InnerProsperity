// src/pages/index.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { Preferences } from '@capacitor/preferences';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const checkAuthAndOnboarding = async () => {
      if (!isLoading) {
        // Check if user is authenticated
        if (user) {
          // Check if onboarding completed using Capacitor Preferences
          try {
            const { value } = await Preferences.get({ key: 'onboardingCompleted' });
            if (value === 'true') {
              router.replace('/mobile-home');
            } else {
              router.replace('/mobile-onboarding');
            }
          } catch (error) {
            console.error('Error checking onboarding status:', error);
            // If error, default to onboarding to be safe
            router.replace('/mobile-onboarding');
          }
        } else {
          router.replace('/mobile-login');
        }
      }
    };

    checkAuthAndOnboarding();
  }, [user, isLoading, router]);

  // Loading splash screen while checking auth
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0047AB, #0A2472)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          fontSize: '80px', 
          marginBottom: '20px',
          animation: 'float 3s ease-in-out infinite'
        }}>
          💰
        </div>
        <div style={{ 
          fontSize: '32px', 
          fontWeight: 'bold',
          marginBottom: '10px',
          background: 'linear-gradient(135deg, #FFFFFF, #E0E7FF)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          IntentFlow
        </div>
        <div style={{ 
          fontSize: '16px', 
          color: 'rgba(255,255,255,0.7)',
          marginBottom: '30px'
        }}>
          Take control of your finances
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTopColor: '#3B82F6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '20px auto 0'
        }} />
      </div>

      {/* Add keyframe animations */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
    </div>
  );
}