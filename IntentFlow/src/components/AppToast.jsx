import React, { useState, useEffect } from 'react';

const TOAST_EVENT = 'app-toast';

export function showAppToast(message, type = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, type } })
  );
}

export default function AppToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const onToast = (e) => {
      const { message, type = 'success' } = e.detail || {};
      setToast({ message, type });
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const bg =
    toast.type === 'error'
      ? 'rgba(185, 28, 28, 0.95)'
      : toast.type === 'info'
        ? 'rgba(0, 71, 171, 0.95)'
        : 'rgba(6, 95, 70, 0.95)';

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 10000,
        maxWidth: '420px',
        padding: '0.75rem 1.25rem',
        borderRadius: '0.5rem',
        color: '#fff',
        fontSize: '0.875rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        background: bg,
      }}
    >
      {toast.message}
    </div>
  );
}
