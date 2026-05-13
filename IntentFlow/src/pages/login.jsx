import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import Button from '../components/ui/Button';

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

  const { login, register, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const checkElectron = () => {
      if (window?.electronAPI) {
        setElectronReady(true);
        window.electronAPI.getCurrentUser()
          .then((result) => {
            if (result?.success && result.data && !redirectAttempted.current) {
              redirectAttempted.current = true;
              router.replace('/');
            }
          })
          .catch((err) => console.error('Failed to check current user:', err));
      } else {
        setTimeout(checkElectron, 800);
      }
    };

    checkElectron();
  }, [router]);

  useEffect(() => {
    if (!loading && isAuthenticated && !redirectAttempted.current) {
      redirectAttempted.current = true;
      router.replace('/');
    }
  }, [isAuthenticated, loading, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!window?.electronAPI) {
        throw new Error('Electron API is unavailable');
      }

      if (isRegistering) {
        const result = await register({
          username,
          password,
          fullName: fullName || username,
          email: email || null,
        });

        if (result?.success) {
          setSuccess('Account created. Please login to continue.');
          setIsRegistering(false);
          setUsername('');
          setPassword('');
          setFullName('');
          setEmail('');
        } else {
          setError(result?.error || 'Registration failed.');
        }
      } else {
        const result = await login(username, password);
        if (result?.success) {
          setSuccess(`Welcome back, ${result.data?.fullName || result.data?.username || username}!`);
          setTimeout(() => {
            if (!redirectAttempted.current) {
              redirectAttempted.current = true;
              router.replace('/');
            }
          }, 400);
        } else {
          setError(result?.error || 'Invalid username or password');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering((current) => !current);
    setError('');
    setSuccess('');
  };

  if (!electronReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/95 p-10 text-center shadow-2xl shadow-slate-950/40">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-3xl shadow-lg shadow-cyan-500/20">
            <span className="animate-spin">⏳</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Loading IntentFlow</h1>
          <p className="mt-3 text-sm text-slate-400">Preparing your secure desktop experience...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_32%)]" />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/95 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
        <div className="mb-8 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">IntentFlow</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">{isRegistering ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {isRegistering
                ? 'Sign up to keep your financial goals organized, protected, and ready for action.'
                : 'Login to access your Prosperity Map, budget dashboard, and secure backups.'}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
            Secure desktop finance, encrypted local backup support.
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-3xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {isRegistering && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-300">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-300">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
                className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? 'Working…' : isRegistering ? 'Create account' : 'Login'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push('/settings')} disabled={loading} className="w-full sm:w-auto">
              Backup & Restore
            </Button>
          </div>
        </form>

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-800 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={toggleMode} className="text-sky-300 hover:text-white underline-offset-4 transition">
            {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
          </button>
          <span className="text-slate-500">{isRegistering ? 'Secure local backups powered by Electron.' : 'Enter credentials to unlock your Prosperity Map.'}</span>
        </div>
      </div>
    </div>
  );
}
