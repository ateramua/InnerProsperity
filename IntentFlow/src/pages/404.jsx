// src/pages/404.jsx
import Link from 'next/link';

export default function Custom404() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #1e5f4b 100%)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '48px',
        padding: '48px',
        textAlign: 'center',
        maxWidth: '400px'
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>404</h1>
        <h2 style={{ marginBottom: '20px' }}>Page Not Found</h2>
        <p style={{ marginBottom: '30px', color: '#64748b' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/" style={{
          background: '#2a5298',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '30px',
          textDecoration: 'none',
          display: 'inline-block'
        }}>
          Go Home
        </Link>
      </div>
    </div>
  );
}