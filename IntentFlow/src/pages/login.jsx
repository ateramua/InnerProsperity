// src/pages/login.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [electronReady, setElectronReady] = useState(false);
  const redirectAttempted = useRef(false);

  const { login, register, isAuthenticated } = useAuth(); // ✅ Make sure isAuthenticated is here!
  const router = useRouter();

  // Check if electronAPI is available
  useEffect(() => {
    const checkElectron = () => {
      if (window.electronAPI) {
        console.log('✅ electronAPI is available');
        setElectronReady(true);
        
        // Check if already logged in
        window.electronAPI.getCurrentUser().then(result => {
          console.log('Current user check:', result);
          if (result && result.success && result.data) {
            redirectAttempted.current = true;
            router.replace('/');
          }
        }).catch(err => {
          console.error('Failed to check current user:', err);
        });
      } else {
        console.log('❌ electronAPI not available, retrying in 1 second...');
        setTimeout(checkElectron, 1000);
      }
    };
    
    checkElectron();
  }, [router]);

  // Redirect to home if already logged in
  useEffect(() => {
    console.log('🔄 Login page - checking authentication status');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('loading:', loading);
    
    if (!loading && isAuthenticated && !redirectAttempted.current) {
      console.log('✅ User is authenticated, redirecting to home');
      redirectAttempted.current = true;
      router.replace('/');
    }
  }, [isAuthenticated, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      if (isRegistering) {
        // Register new user
        console.log('📝 Registering user:', { username, fullName, email });
        const result = await register({ 
          username, 
          password, 
          fullName: fullName || username, 
          email: email || null 
        });
        
        console.log('📝 Register result:', result);
        
        if (result && result.success) {
          setSuccess('Account created successfully! You can now login.');
          setIsRegistering(false);
          setUsername('');
          setPassword('');
          setFullName('');
          setEmail('');
        } else {
          setError(result?.error || 'Registration failed');
        }
      } else {
        // Login existing user
        console.log('🔐 Logging in:', username);
        const result = await login(username, password);
        console.log('🔐 Login result:', result);
        
        if (result && result.success) {
          setSuccess(`Welcome back, ${result.data?.fullName || result.data?.username || username}!`);
          // Redirect will happen via the useEffect above
          setTimeout(() => {
            if (!redirectAttempted.current) {
              redirectAttempted.current = true;
              router.replace('/');
            }
          }, 1500);
        } else {
          setError(result?.error || 'Invalid username or password');
        }
      }
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setSuccess('');
  };

  if (!electronReady) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconContainer}>
            <i className="fas fa-spinner fa-spin" style={styles.icon}></i>
          </div>
          <h1 style={styles.title}>Loading...</h1>
          <p style={styles.subtitle}>Initializing application...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.gradientOverlay} />
      
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <i className="fas fa-wallet" style={styles.icon}></i>
        </div>
        
        <h1 style={styles.title}>
          {isRegistering ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p style={styles.subtitle}>
          {isRegistering 
            ? 'Sign up to start managing your money' 
            : 'Login to access your prosperity map'}
        </p>

        {error && (
          <div style={styles.errorBox}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        {success && (
          <div style={styles.successBox}>
            <i className="fas fa-check-circle"></i> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegistering && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name (Optional)</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={styles.input}
                  placeholder="Enter your full name"
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  placeholder="Enter your email"
                />
              </div>
            </>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              placeholder="Enter username"
              required
              autoFocus={!isRegistering}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'wait' : 'pointer'
            }}
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin"></i> Processing...</>
            ) : (
              <><i className={`fas ${isRegistering ? 'fa-user-plus' : 'fa-sign-in-alt'}`}></i> 
                {isRegistering ? 'Create Account' : 'Login'}
              </>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <button onClick={toggleMode} style={styles.toggleButton}>
            {isRegistering 
              ? 'Already have an account? Login' 
              : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #1e5f4b 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    position: 'relative',
    fontFamily: "'Inter', sans-serif"
  },
  gradientOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 20% 80%, rgba(64, 224, 208, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(72, 202, 228, 0.15) 0%, transparent 50%)',
    pointerEvents: 'none',
    zIndex: 0
  },
  card: {
    background: 'white',
    borderRadius: '48px',
    padding: '48px',
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4)',
    width: '100%',
    maxWidth: '500px',
    position: 'relative',
    zIndex: 1
  },
  iconContainer: {
    background: 'linear-gradient(135deg, #2a5298, #1e5f4b)',
    borderRadius: '32px',
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px'
  },
  icon: {
    fontSize: '40px',
    color: 'white'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 600,
    textAlign: 'center',
    margin: '0 0 8px',
    color: '#0f172a'
  },
  subtitle: {
    fontSize: '1rem',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: '32px'
  },
  errorBox: {
    background: '#fee2e2',
    border: '1px solid #ef4444',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '20px',
    color: '#b91c1c',
    fontSize: '0.95rem',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  successBox: {
    background: '#d1fae5',
    border: '1px solid #10b981',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '20px',
    color: '#065f46',
    fontSize: '0.95rem',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#334155'
  },
  input: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    fontSize: '1rem',
    transition: 'all 0.2s ease'
  },
  submitButton: {
    background: 'linear-gradient(135deg, #2a5298, #1e3c72)',
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: '40px',
    fontSize: '1rem',
    fontWeight: 600,
    marginTop: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center'
  },
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#2a5298',
    fontSize: '0.95rem',
    cursor: 'pointer',
    fontWeight: 500,
    textDecoration: 'underline'
  }
};