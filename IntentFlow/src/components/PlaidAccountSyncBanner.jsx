import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { isPlaidLinkedAccount } from '../utils/plaidAccountUtils';

const PlaidAccountSyncBanner = ({ account, onSyncRequest }) => {
  const router = useRouter();
  const [linkStatus, setLinkStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const loadLinkStatus = useCallback(async () => {
    if (!account?.id || !window.electronAPI?.getAccountPlaidLinkStatus) return;
    const res = await window.electronAPI.getAccountPlaidLinkStatus(account.id);
    if (res?.success) setLinkStatus(res.data);
  }, [account?.id]);

  useEffect(() => {
    if (!isPlaidLinkedAccount(account)) return;
    loadLinkStatus();
    const unsub = window.electronAPI?.onAccountsUpdated?.(() => {
      loadLinkStatus();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [account, loadLinkStatus]);

  if (!isPlaidLinkedAccount(account)) return null;

  const needsReconnect = linkStatus?.item_status === 'login_required';
  const lastSync = linkStatus?.item_last_sync || account.last_balance_sync_at;
  const lastSyncLabel = lastSync ? new Date(lastSync).toLocaleString() : null;
  const institution = linkStatus?.institution_name || account.institution;

  const goLinkedBanks = () => {
    if (typeof onSyncRequest === 'function') {
      onSyncRequest();
      return;
    }
    router.push('/?view=linked-banks');
  };

  const goReconcile = () => {
    if (account?.id) {
      router.push(`/accounts/${account.id}/reconcile`);
    }
  };

  const handleSyncNow = async () => {
    if (!window.electronAPI?.syncPlaidAccount) {
      goLinkedBanks();
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await window.electronAPI.syncPlaidAccount(account.id);
      if (result?.success) {
        setSyncMessage('Sync complete');
        await loadLinkStatus();
      } else {
        setSyncMessage(result?.error || 'Sync failed');
      }
    } catch (err) {
      setSyncMessage(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const bannerStyle = needsReconnect ? styles.bannerWarning : styles.banner;
  const textStyle = needsReconnect ? { ...styles.text, ...styles.textWarning } : styles.text;

  return (
    <div style={bannerStyle}>
      <div style={styles.icon}>{needsReconnect ? '⚠️' : '🔗'}</div>
      <div style={styles.body}>
        <strong style={styles.title}>
          {needsReconnect ? 'Bank connection needs attention' : 'Bank-linked account'}
        </strong>
        <p style={textStyle}>
          {needsReconnect ? (
            <>
              {institution ? `${institution} requires ` : 'Your bank requires '}
              reconnection in Linked Banks to keep syncing.
            </>
          ) : (
            <>
              Balance and transactions sync from your bank via Plaid.
              {institution ? ` (${institution})` : ''}
              {lastSyncLabel ? (
                <>
                  {' '}
                  Last sync: <strong>{lastSyncLabel}</strong>.
                </>
              ) : (
                ' Run Sync Now to refresh.'
              )}
            </>
          )}
        </p>
        <div style={styles.actions}>
          {needsReconnect ? (
            <button type="button" style={styles.primaryBtn} onClick={goLinkedBanks}>
              Reconnect in Linked Banks
            </button>
          ) : (
            <button
              type="button"
              style={styles.primaryBtn}
              onClick={handleSyncNow}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
          <button type="button" style={styles.secondaryBtn} onClick={goReconcile}>
            Reconcile
          </button>
          {!needsReconnect && (
            <button type="button" style={styles.secondaryBtn} onClick={goLinkedBanks}>
              Linked Banks
            </button>
          )}
          {syncMessage && <span style={styles.syncHint}>{syncMessage}</span>}
        </div>
      </div>
    </div>
  );
};

const styles = {
  banner: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
    background: 'rgba(0, 71, 171, 0.2)',
    border: '1px solid rgba(147, 197, 253, 0.35)',
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
    marginBottom: '1.5rem',
    maxWidth: '1200px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  bannerWarning: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
    background: 'rgba(180, 83, 9, 0.2)',
    border: '1px solid rgba(251, 191, 36, 0.45)',
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
    marginBottom: '1.5rem',
    maxWidth: '1200px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  icon: { fontSize: '1.5rem', lineHeight: 1 },
  body: { flex: 1 },
  title: { color: '#F3F4F6', fontSize: '1rem' },
  text: {
    margin: '0.35rem 0 0.75rem',
    fontSize: '0.875rem',
    color: '#BFDBFE',
    lineHeight: 1.45,
  },
  textWarning: { color: '#FDE68A' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  primaryBtn: {
    padding: '0.4rem 0.9rem',
    background: '#0047AB',
    color: '#fff',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '0.4rem 0.9rem',
    background: 'transparent',
    color: '#93C5FD',
    border: '1px solid rgba(147, 197, 253, 0.5)',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  syncHint: { fontSize: '0.75rem', color: '#93C5FD', marginLeft: '0.25rem' },
};

export default PlaidAccountSyncBanner;
