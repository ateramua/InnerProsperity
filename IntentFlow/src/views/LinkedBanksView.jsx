import React, { useState, useEffect } from 'react';
import { showAppToast } from '../components/AppToast';
import AccountMergeWizard from '../components/accounts/AccountMergeWizard';
import TransactionImportModal from '../components/TransactionImportModal';
import {
  notifyAccountsChanged,
  subscribeAccountsChanged,
} from '../utils/accountRefreshEvents.jsx';

const PLAID_LINK_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
let plaidLinkScriptPromise = null;

function ensurePlaidLinkScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Plaid Link is only available in the app window'));
  }
  if (window.Plaid) return Promise.resolve();
  if (plaidLinkScriptPromise) return plaidLinkScriptPromise;

  plaidLinkScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAID_LINK_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Plaid Link')),
        { once: true }
      );
      if (window.Plaid) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = PLAID_LINK_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Plaid Link. Check your internet connection.'));
    document.body.appendChild(script);
  });

  return plaidLinkScriptPromise;
}

function waitForPlaidLink(maxWaitMs = 15000) {
  return ensurePlaidLinkScript().then(
    () =>
      new Promise((resolve, reject) => {
        if (window.Plaid) {
          resolve(window.Plaid);
          return;
        }
        const started = Date.now();
        const tick = () => {
          if (window.Plaid) {
            resolve(window.Plaid);
            return;
          }
          if (Date.now() - started > maxWaitMs) {
            reject(new Error('Plaid Link timed out while loading. Please try again.'));
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
  );
}

function openPlaidLinkSession({ token, onSuccess, receivedRedirectUri }) {
  return waitForPlaidLink().then(
    (Plaid) =>
      new Promise((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        const linkOptions = {
          token,
          onSuccess: async (publicToken, metadata) => {
            try {
              await onSuccess(publicToken, metadata);
            } finally {
              handler.destroy();
              finish();
            }
          },
          onExit: (err) => {
            if (err) console.error('Plaid Link exit with error:', err);
            handler.destroy();
            finish();
          },
        };

        if (receivedRedirectUri) {
          linkOptions.receivedRedirectUri = receivedRedirectUri;
        }

        const handler = Plaid.create(linkOptions);
        handler.open();
      })
  );
}

function deepLinkToReceivedRedirectUri(deepLinkUrl, redirectUriBase) {
  if (!deepLinkUrl || !redirectUriBase) return null;
  try {
    const deep = new URL(String(deepLinkUrl));
    if (!deep.searchParams.has('oauth_state_id')) return null;
    const base = new URL(String(redirectUriBase));
    base.search = deep.search;
    return base.toString();
  } catch {
    return null;
  }
}

/** Pending link token for OAuth resume after bank redirect (intentflow:// deep link). */
let pendingPlaidLinkToken = null;
let pendingPlaidLinkMode = null;
let pendingPlaidLinkItemId = null;

function clearPendingPlaidLinkSession() {
  pendingPlaidLinkToken = null;
  pendingPlaidLinkMode = null;
  pendingPlaidLinkItemId = null;
}

function formatLinkedAccountBalance(acc) {
  if (acc?.balance == null || acc.balance === '') return null;
  const amount = Number(acc.balance);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

function linkedAccountBalanceLabel(acc) {
  const formatted = formatLinkedAccountBalance(acc);
  if (!formatted) return 'Balance unavailable';
  return `Balance: ${formatted}`;
}

function isConsentExpiringSoon(item) {
  if (!item) return false;
  if (item.status === 'consent_expiring') return true;
  if (!item.consent_expires_at) return false;
  const exp = new Date(item.consent_expires_at);
  const days = (exp.getTime() - Date.now()) / 86400000;
  return days > 0 && days <= 30;
}

function formatConsentExpiry(item) {
  if (!item?.consent_expires_at) return null;
  return new Date(item.consent_expires_at).toLocaleDateString();
}

const LinkedBanksView = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [isConnectingBank, setIsConnectingBank] = useState(false);
  const [connectedItems, setConnectedItems] = useState([]);
  const [error, setError] = useState(null);
  const [syncingItemId, setSyncingItemId] = useState(null);
  const [syncStatuses, setSyncStatuses] = useState({}); // { itemId: message }
  const [needsReconnect, setNeedsReconnect] = useState(null);
  const [categories, setCategories] = useState([]);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [unmappedCategories, setUnmappedCategories] = useState([]);
  const [categoryMappings, setCategoryMappings] = useState({});
  const [saving, setSaving] = useState(false);
  const [plaidConfigured, setPlaidConfigured] = useState(false);
  const [plaidConfigReady, setPlaidConfigReady] = useState(false);
  const [plaidRedirectUri, setPlaidRedirectUri] = useState(null);
  const [itemAccounts, setItemAccounts] = useState({});
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [savedMappings, setSavedMappings] = useState([]);
  const [allCategoryMappings, setAllCategoryMappings] = useState({});
  const [mergeOffers, setMergeOffers] = useState([]);
  const [mergingId, setMergingId] = useState(null);
  const [disconnectItemId, setDisconnectItemId] = useState(null);
  const [disconnectOptions, setDisconnectOptions] = useState({
    deleteImportedTransactions: false,
    deactivateAccounts: true,
  });
  const [importAccounts, setImportAccounts] = useState([]);
  const [showTransactionImport, setShowTransactionImport] = useState(false);
  const [syncHistory, setSyncHistory] = useState([]);

  // Load linked items
  const loadLinkedItems = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await window.electronAPI.getLinkedItems();
      if (result.success) {
        setConnectedItems(result.data);
        setError(null);
        const accountsMap = {};
        if (window.electronAPI?.getPlaidItemAccounts) {
          await Promise.all(
            (result.data || []).map(async (item) => {
              const accRes = await window.electronAPI.getPlaidItemAccounts(item.id);
              if (accRes?.success) accountsMap[item.id] = accRes.data || [];
            })
          );
          setItemAccounts(accountsMap);
        }
        const loginRequired = (result.data || []).find((i) => i.status === 'login_required');
        if (loginRequired) setNeedsReconnect(loginRequired.id);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // Fetch categories for mapping modal
  useEffect(() => {
    if (showMappingModal) {
      const fetchCategories = async () => {
        const userResult = await window.electronAPI.getCurrentUser();
        const userId = userResult?.data?.id;
        if (!userId) return;
        const catResult = await window.electronAPI.getCategories(userId);
        if (catResult.success) {
          setCategories(catResult.data);
        } else {
          console.error('Failed to fetch categories', catResult.error);
        }
      };
      fetchCategories();
    }
  }, [showMappingModal]);

  const loadPlaidSettings = async () => {
    if (window.electronAPI?.getAutoSyncSetting) {
      const res = await window.electronAPI.getAutoSyncSetting();
      if (res?.success) setAutoSyncEnabled(res.enabled !== false);
    }
    if (window.electronAPI?.getPlaidCategoryMappings) {
      const mapRes = await window.electronAPI.getPlaidCategoryMappings();
      if (mapRes?.success) {
        setSavedMappings(mapRes.data || []);
        const map = {};
        (mapRes.data || []).forEach((row) => {
          map[row.plaid_category] = row.category_id;
        });
        setAllCategoryMappings(map);
      }
    }
    if (window.electronAPI?.getPlaidSyncHistory) {
      const hist = await window.electronAPI.getPlaidSyncHistory(10);
      if (hist?.success) setSyncHistory(hist.data || []);
    }
  };

  const handleAutoSyncToggle = async (enabled) => {
    setAutoSyncEnabled(enabled);
    if (window.electronAPI?.setAutoSyncSetting) {
      await window.electronAPI.setAutoSyncSetting(enabled);
    }
  };

  const openCategorySettings = async () => {
    const userResult = await window.electronAPI.getCurrentUser();
    const userId = userResult?.data?.id;
    if (!userId) return;
    const catResult = await window.electronAPI.getCategories(userId);
    if (catResult.success) setCategories(catResult.data);
    let rows = savedMappings;
    if (window.electronAPI?.getPlaidCategoryMappings) {
      const mapRes = await window.electronAPI.getPlaidCategoryMappings();
      if (mapRes?.success) {
        rows = mapRes.data || [];
        setSavedMappings(rows);
        const map = {};
        rows.forEach((row) => {
          map[row.plaid_category] = row.category_id;
        });
        setAllCategoryMappings(map);
        setCategoryMappings(map);
      }
    }
    setUnmappedCategories(rows.map((m) => m.plaid_category));
    setShowMappingModal(true);
  };

  const loadImportAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      const userId = userResult?.data?.id;
      if (!userId) return;
      const res = await window.electronAPI.getAccountsSummary(userId);
      if (res?.success) {
        setImportAccounts(
          (res.data || []).filter((a) => a.is_active !== false && a.is_active !== 0)
        );
      }
    } catch (e) {
      console.warn('loadImportAccounts:', e);
    }
  };

  useEffect(() => {
    loadLinkedItems();
    loadPlaidSettings();
    loadImportAccounts();
    (async () => {
      try {
        if (window.electronAPI?.getPlaidConfigStatus) {
          const cfg = await window.electronAPI.getPlaidConfigStatus();
          if (cfg?.success) setPlaidConfigured(Boolean(cfg.data?.configured));
          if (cfg?.success && cfg.data?.redirectUri) setPlaidRedirectUri(cfg.data.redirectUri);
        }
      } finally {
        setPlaidConfigReady(true);
      }
    })();
    const refreshFromAccountChange = () => {
      loadLinkedItems({ quiet: true });
      loadImportAccounts();
    };
    return subscribeAccountsChanged(refreshFromAccountChange);
  }, []);

  // Resume Plaid Link after OAuth bank redirect (intentflow:// deep link from hosted callback page)
  useEffect(() => {
    if (!window.electronAPI?.onPlaidOAuthRedirect) return undefined;

    const resumeOAuth = async (deepLinkUrl) => {
      if (!pendingPlaidLinkToken) {
        showAppToast('Open Linked Banks and tap Connect again to finish bank sign-in.', 'info');
        return;
      }
      const receivedRedirectUri = deepLinkToReceivedRedirectUri(deepLinkUrl, plaidRedirectUri);
      if (!receivedRedirectUri) {
        showAppToast('OAuth redirect could not be completed. Check PLAID_REDIRECT_URI.', 'error');
        return;
      }

      const mode = pendingPlaidLinkMode;
      const itemId = pendingPlaidLinkItemId;
      const token = pendingPlaidLinkToken;

      setIsConnectingBank(true);
      try {
        await openPlaidLinkSession({
          token,
          receivedRedirectUri,
          onSuccess: async (publicToken) => {
            const exchangeResult = await window.electronAPI.exchangePublicToken(publicToken);
            if (exchangeResult?.success) {
              await loadLinkedItems({ quiet: true });
              if (mode === 'reconnect' && itemId) {
                setNeedsReconnect(null);
                setSyncStatuses((prev) => ({
                  ...prev,
                  [itemId]: '✅ Bank reconnected successfully!',
                }));
                showAppToast('Bank reconnected successfully');
                await window.electronAPI.syncItem(itemId);
                await loadLinkedItems({ quiet: true });
              } else if (exchangeResult.mergeOffers?.length) {
                setMergeOffers(exchangeResult.mergeOffers);
              } else {
                showAppToast('Bank connected successfully');
              }
              notifyAccountsChanged({ reason: 'plaid-connected' });
            } else {
              showAppToast(
                (mode === 'reconnect' ? 'Failed to reconnect: ' : 'Failed to connect bank: ') +
                  (exchangeResult?.error || 'Unknown error'),
                'error'
              );
            }
          },
        });
      } catch (err) {
        showAppToast(err.message || 'OAuth resume failed', 'error');
      } finally {
        clearPendingPlaidLinkSession();
        setIsConnectingBank(false);
      }
    };

    const unsub = window.electronAPI.onPlaidOAuthRedirect(({ url }) => {
      if (url) resumeOAuth(url);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [plaidRedirectUri]);

  // Load Plaid Link script early
  useEffect(() => {
    ensurePlaidLinkScript().catch((err) => {
      console.error('❌ Failed to load Plaid Link script:', err);
      setError(err.message);
    });
  }, []);

  // Connect new bank
  const handleConnectBank = async () => {
    if (isConnectingBank || !plaidConfigured) return;
    if (!window.electronAPI?.createLinkToken || !window.electronAPI?.exchangePublicToken) {
      setError('Plaid is not available. Restart the IntentFlow desktop app.');
      showAppToast('Plaid is not available in this window', 'error');
      return;
    }

    setIsConnectingBank(true);
    setError(null);
    try {
      const tokenResult = await window.electronAPI.createLinkToken();
      if (!tokenResult?.success) {
        throw new Error(tokenResult?.error || 'Failed to create Plaid link token');
      }
      if (!tokenResult.link_token) {
        throw new Error('Plaid did not return a link token');
      }

      pendingPlaidLinkToken = tokenResult.link_token;
      pendingPlaidLinkMode = 'connect';
      pendingPlaidLinkItemId = null;

      await openPlaidLinkSession({
        token: tokenResult.link_token,
        onSuccess: async (publicToken) => {
          clearPendingPlaidLinkSession();
          const exchangeResult = await window.electronAPI.exchangePublicToken(publicToken);
          if (exchangeResult?.success) {
            await loadLinkedItems({ quiet: true });
            if (exchangeResult.mergeOffers?.length) {
              setMergeOffers(exchangeResult.mergeOffers);
            } else {
              showAppToast('Bank connected successfully');
            }
            notifyAccountsChanged({ reason: 'plaid-sync' });
          } else {
            showAppToast(
              'Failed to connect bank: ' + (exchangeResult?.error || 'Unknown error'),
              'error'
            );
          }
        },
      });
    } catch (err) {
      console.error('Error connecting bank:', err);
      clearPendingPlaidLinkSession();
      setError(err.message);
      showAppToast(err.message, 'error');
    } finally {
      setIsConnectingBank(false);
    }
  };

  // Sync a single bank (accounts + transactions)
  const handleSyncItem = async (itemId) => {
    if (syncingItemId === itemId) return; // already syncing
    setSyncingItemId(itemId);
    setSyncStatuses(prev => ({ ...prev, [itemId]: 'Syncing accounts...' }));
    try {
      // 1. Sync accounts
      const accountResult = await window.electronAPI.syncItem(itemId);
      if (!accountResult.success) throw new Error(accountResult.error);
      if (accountResult.mergeOffers?.length) {
        setMergeOffers((prev) => {
          const ids = new Set(prev.map((o) => o.plaidAccountId));
          const added = accountResult.mergeOffers.filter((o) => !ids.has(o.plaidAccountId));
          return [...prev, ...added];
        });
      }

      setSyncStatuses(prev => ({ ...prev, [itemId]: 'Fetching transactions...' }));

      // 2. Sync transactions
      const txResult = await window.electronAPI.syncTransactions(itemId);
      if (txResult.success) {
        const msg = `✅ Completed: ${txResult.transactionsAdded} new, ${txResult.transactionsModified} updated, ${txResult.transactionsRemoved} removed.`;
        setSyncStatuses(prev => ({ ...prev, [itemId]: msg }));
        // Clear message after 5 seconds
        setTimeout(() => {
          setSyncStatuses(prev => {
            const newStatus = { ...prev };
            delete newStatus[itemId];
            return newStatus;
          });
        }, 5000);

        await loadLinkedItems();
        await loadPlaidSettings();

        // Show mapping modal if new categories found
        if (txResult.unmappedCategories?.length) {
          const initialMappings = {};
          txResult.unmappedCategories.forEach(cat => { initialMappings[cat] = ''; });
          setUnmappedCategories(txResult.unmappedCategories);
          setCategoryMappings(initialMappings);
          setShowMappingModal(true);
        }
      } else {
        if (txResult.error === 'ITEM_LOGIN_REQUIRED') {
          setNeedsReconnect(itemId);
          setSyncStatuses(prev => ({ ...prev, [itemId]: '⚠️ Connection expired. Please reconnect.' }));
        } else {
          throw new Error(txResult.error);
        }
      }
    } catch (err) {
      console.error('Error syncing item:', err);
      setSyncStatuses(prev => ({ ...prev, [itemId]: '❌ Sync failed: ' + err.message }));
      setTimeout(() => {
        setSyncStatuses(prev => {
          const newStatus = { ...prev };
          delete newStatus[itemId];
          return newStatus;
        });
      }, 5000);
    } finally {
      setSyncingItemId(null);
    }
  };

  // Sync all banks
  const handleSyncAll = async () => {
    if (syncingItemId) {
      showAppToast('A sync is already in progress. Please wait.', 'info');
      return;
    }
    setLoading(true);
    for (const item of connectedItems) {
      await handleSyncItem(item.id);
    }
    setLoading(false);
  };

  const handleRemoveItem = (itemId) => {
    setDisconnectItemId(itemId);
    setDisconnectOptions({ deleteImportedTransactions: false, deactivateAccounts: true });
  };

  const handleConfirmDisconnect = async () => {
    const itemId = disconnectItemId;
    if (!itemId) return;
    setDisconnectItemId(null);
    setSyncingItemId(itemId);
    try {
      const result = await window.electronAPI.removeItem(itemId, disconnectOptions);
      if (result.success) {
        await loadLinkedItems();
        setSyncStatuses(prev => ({ ...prev, [itemId]: '✅ Bank disconnected.' }));
        setTimeout(() => {
          setSyncStatuses(prev => {
            const newStatus = { ...prev };
            delete newStatus[itemId];
            return newStatus;
          });
        }, 3000);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Error removing item:', err);
      setSyncStatuses(prev => ({ ...prev, [itemId]: '❌ Failed to disconnect: ' + err.message }));
      setTimeout(() => {
        setSyncStatuses(prev => {
          const newStatus = { ...prev };
          delete newStatus[itemId];
          return newStatus;
        });
      }, 3000);
    } finally {
      setSyncingItemId(null);
    }
  };

  // Reconnect bank (handles ITEM_LOGIN_REQUIRED)
  const handleReconnect = async (itemId) => {
    if (syncingItemId === itemId) return;
    setSyncingItemId(itemId);
    try {
      const tokenResult = await window.electronAPI.createUpdateLinkToken(itemId);
      if (!tokenResult?.success) throw new Error(tokenResult?.error || 'Failed to create update link token');
      if (!tokenResult.link_token) throw new Error('Plaid did not return a link token');

      pendingPlaidLinkToken = tokenResult.link_token;
      pendingPlaidLinkMode = 'reconnect';
      pendingPlaidLinkItemId = itemId;

      await openPlaidLinkSession({
        token: tokenResult.link_token,
        onSuccess: async (publicToken) => {
          clearPendingPlaidLinkSession();
          const exchangeResult = await window.electronAPI.exchangePublicToken(publicToken);
          if (exchangeResult?.success) {
            await loadLinkedItems({ quiet: true });
            setNeedsReconnect(null);
            setSyncStatuses(prev => ({ ...prev, [itemId]: '✅ Bank reconnected successfully!' }));
            setTimeout(() => {
              setSyncStatuses(prev => {
                const newStatus = { ...prev };
                delete newStatus[itemId];
                return newStatus;
              });
            }, 3000);
            handleSyncItem(itemId);
          } else {
            showAppToast('Failed to reconnect: ' + (exchangeResult?.error || 'Unknown error'), 'error');
          }
        },
      });
    } catch (err) {
      console.error('Error reconnecting bank:', err);
      clearPendingPlaidLinkSession();
      showAppToast('Reconnect failed: ' + err.message, 'error');
    } finally {
      setSyncingItemId(null);
    }
  };

  // Category mapping modal handlers
  const handleMappingChange = (plaidCategory, categoryId) => {
    setCategoryMappings(prev => ({ ...prev, [plaidCategory]: categoryId }));
  };

  const handleMergeWizardClosed = () => {
    setMergeOffers([]);
    setMergingId(null);
  };

  const handleMergeCompleted = async (plaidAccountId) => {
    setMergeOffers((prev) => prev.filter((o) => o.plaidAccountId !== plaidAccountId));
    await loadLinkedItems();
    notifyAccountsChanged({ reason: 'plaid-disconnect' });
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    try {
      let transactionsUpdated = 0;
      for (const [plaidCategory, categoryId] of Object.entries(categoryMappings)) {
        if (!categoryId) continue;
        const res = await window.electronAPI.saveCategoryMapping(plaidCategory, categoryId);
        if (res?.success) {
          transactionsUpdated += res.transactionsUpdated || 0;
        } else {
          throw new Error(res?.error || 'Failed to save mapping');
        }
      }
      showAppToast(
        transactionsUpdated > 0
          ? `Mappings saved — updated ${transactionsUpdated} transaction(s)`
          : 'Category mappings saved'
      );
      setShowMappingModal(false);
      await loadPlaidSettings();
    } catch (error) {
      console.error('Error saving mappings:', error);
      showAppToast('Failed to save mappings: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkAccount = async (accountId, accountName) => {
    if (!window.electronAPI?.unlinkPlaidAccount) return;
    const ok = window.confirm(
      `Unlink "${accountName}" from Plaid? The bank connection stays active for your other accounts.`
    );
    if (!ok) return;
    try {
      const res = await window.electronAPI.unlinkPlaidAccount(accountId);
      if (res?.success) {
        showAppToast('Account unlinked from Plaid');
        await loadLinkedItems();
        notifyAccountsChanged({ reason: 'plaid-disconnect' });
      } else {
        showAppToast(res?.error || 'Unlink failed', 'error');
      }
    } catch (err) {
      showAppToast(err.message, 'error');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Linked Banks</h2>
        <div style={styles.buttonGroup}>
          <button
            onClick={handleSyncAll}
            style={styles.syncAllButton}
            disabled={loading || syncingItemId !== null || isConnectingBank}
          >
            Sync All
          </button>
          <button
            type="button"
            onClick={handleConnectBank}
            style={{
              ...styles.connectButton,
              ...((!plaidConfigReady || isConnectingBank || !plaidConfigured) && styles.connectButtonDisabled),
            }}
            disabled={!plaidConfigReady || isConnectingBank || !plaidConfigured}
            title={
              !plaidConfigReady
                ? 'Checking Plaid configuration…'
                : !plaidConfigured
                  ? 'Plaid is not configured — check .env and restart the app'
                  : 'Connect a bank via Plaid'
            }
          >
            {!plaidConfigReady
              ? 'Loading…'
              : isConnectingBank
                ? 'Connecting...'
                : '+ Connect New Bank'}
          </button>
        </div>
      </div>

      {!plaidConfigReady && (
        <div style={styles.infoBanner}>Checking Plaid configuration…</div>
      )}

      {plaidConfigReady && !plaidConfigured && (
        <div style={styles.error}>
          Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV
          (sandbox, development, or production) in .env, then restart the IntentFlow desktop app.
        </div>
      )}

      {error && <div style={styles.error}>⚠️ {error}</div>}

      <p style={styles.complianceNote}>
        By connecting your account, you authorize IntentFlow to securely access your financial data via
        Plaid. IntentFlow uses linked account balances, account details, liabilities, and transactions for
        budgeting and account sync only. You can disconnect anytime in Linked Banks. See the{' '}
        <a href="/privacy" style={styles.complianceLink}>Privacy Policy</a> and{' '}
        <a href="/terms" style={styles.complianceLink}>Terms of Service</a>.
      </p>

      <div style={styles.settingsCard}>
        <button
          type="button"
          onClick={() => setShowSettingsPanel((v) => !v)}
          style={styles.settingsToggle}
        >
          {showSettingsPanel ? '▼' : '▶'} Plaid settings
        </button>
        {showSettingsPanel && (
          <div style={styles.settingsBody}>
            <label style={styles.settingRow}>
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => handleAutoSyncToggle(e.target.checked)}
              />
              <span>Automatically sync linked banks every hour (and on app focus)</span>
            </label>
            <p style={styles.settingHint}>
              Sandbox tip: use the institution&apos;s test phone (often ending in 1111). Phone prompts are
              controlled by Plaid/your bank, not IntentFlow.
            </p>
            <button type="button" onClick={openCategorySettings} style={styles.settingsLinkButton}>
              Manage category mappings ({savedMappings.length})
            </button>
            <button
              type="button"
              onClick={() => setShowTransactionImport(true)}
              style={styles.settingsLinkButton}
            >
              Import transactions (CSV)…
            </button>
            {syncHistory.length > 0 && (
              <div style={styles.syncHistoryBox}>
                <div style={styles.syncHistoryTitle}>Recent sync activity</div>
                <ul style={styles.syncHistoryList}>
                  {syncHistory.slice(0, 5).map((run) => (
                    <li key={run.id} style={styles.syncHistoryItem}>
                      <span>{run.institution_name || run.item_id || 'Bank'}</span>
                      <span style={styles.syncHistoryMeta}>
                        {run.sync_type} · {run.status}
                        {run.transactions_added > 0 ? ` · +${run.transactions_added} txn` : ''}
                        {' · '}
                        {new Date(run.started_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && !connectedItems.length && (
        <div style={styles.loading}>Loading your linked banks...</div>
      )}

      {!loading && connectedItems.length === 0 && (
        <div style={styles.empty}>
          <p>No banks connected yet.</p>
          <p>Click "Connect New Bank" to link your financial accounts.</p>
        </div>
      )}

      {connectedItems.some(isConsentExpiringSoon) && (
        <div style={styles.consentBanner}>
          <strong>Consent renewal needed</strong>
          <p style={styles.consentBannerText}>
            One or more bank connections expire soon. Reconnect before access ends.
          </p>
          <ul style={styles.consentList}>
            {connectedItems.filter(isConsentExpiringSoon).map((item) => (
              <li key={`consent-${item.id}`} style={styles.consentListItem}>
                <span>
                  {item.institution_name || item.id}
                  {formatConsentExpiry(item) ? ` — by ${formatConsentExpiry(item)}` : ''}
                </span>
                <button
                  type="button"
                  style={styles.consentReconnectBtn}
                  onClick={() => handleReconnect(item.id)}
                >
                  Reconnect
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {connectedItems.map((item) => (
        <div key={item.id} style={styles.bankCard}>
          <div style={styles.bankHeader}>
            <h3 style={styles.bankName}>
              {item.institution_name || item.id}
            </h3>
            <span style={styles.bankStatus}>
              {item.status === 'login_required'
                ? 'Needs reconnect'
                : item.status === 'consent_expiring'
                  ? `Consent expires${formatConsentExpiry(item) ? ` ${formatConsentExpiry(item)}` : ' soon'}`
                  : item.last_sync
                    ? `Last synced: ${new Date(item.last_sync).toLocaleString()}`
                    : 'Never synced'}
            </span>
          </div>
          {syncingItemId === item.id && (
            <div style={styles.syncProgressTrack}>
              <div style={styles.syncProgressBar} />
            </div>
          )}
          {itemAccounts[item.id]?.length > 0 && (
            <ul style={styles.accountList}>
              {itemAccounts[item.id].map((acc) => (
                <li key={acc.plaid_account_id} style={styles.accountListItem}>
                  <div style={styles.accountListRow}>
                    {acc.account_id && onNavigate ? (
                      <button
                        type="button"
                        style={styles.accountLinkBtn}
                        onClick={() => onNavigate(`account-${acc.account_id}`)}
                      >
                        {acc.account_name || acc.name}
                        {acc.mask ? ` •••• ${acc.mask}` : ''}
                        {acc.source === 'plaid' ? ' 🔗' : ''}
                      </button>
                    ) : (
                      <span>
                        {acc.account_name || acc.name}
                        {acc.mask ? ` •••• ${acc.mask}` : ''}
                        {acc.source === 'plaid' ? ' 🔗' : ''}
                      </span>
                    )}
                    {acc.account_id && (
                      <button
                        type="button"
                        style={styles.unlinkAccountBtn}
                        onClick={() =>
                          handleUnlinkAccount(acc.account_id, acc.account_name || acc.name)
                        }
                        title="Stop syncing this account only"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                  {acc.account_id && (
                    <div style={styles.accountBalanceMeta}>
                      {linkedAccountBalanceLabel(acc)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={styles.bankActions}>
            <button
              onClick={() => handleSyncItem(item.id)}
              style={styles.syncButton}
              disabled={syncingItemId === item.id}
            >
              {syncingItemId === item.id ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => handleRemoveItem(item.id)}
              style={styles.removeButton}
              disabled={syncingItemId === item.id}
            >
              Remove
            </button>
            {(needsReconnect === item.id || item.status === 'login_required') && (
              <button
                onClick={() => handleReconnect(item.id)}
                style={styles.reconnectButton}
                disabled={syncingItemId === item.id}
              >
                Reconnect
              </button>
            )}
          </div>
          {syncStatuses[item.id] && (
            <div style={styles.syncStatus}>{syncStatuses[item.id]}</div>
          )}
        </div>
      ))}

      {disconnectItemId && (
        <div style={styles.mergeModalOverlay}>
          <div style={styles.mergeModalContent}>
            <h3 style={styles.modalTitle}>Disconnect bank?</h3>
            <p style={styles.mergeIntro}>
              This disconnects Plaid only — your account rows stay in the app unless you hide them.
              Imported transactions can be soft-deleted; manual entries are kept.
            </p>
            <label style={styles.settingRow}>
              <input
                type="checkbox"
                checked={disconnectOptions.deactivateAccounts}
                onChange={(e) =>
                  setDisconnectOptions((o) => ({ ...o, deactivateAccounts: e.target.checked }))
                }
              />
              <span>Hide linked accounts in the app (recommended)</span>
            </label>
            <label style={styles.settingRow}>
              <input
                type="checkbox"
                checked={disconnectOptions.deleteImportedTransactions}
                onChange={(e) =>
                  setDisconnectOptions((o) => ({
                    ...o,
                    deleteImportedTransactions: e.target.checked,
                  }))
                }
              />
              <span>Soft-delete imported bank transactions (keeps manual entries)</span>
            </label>
            <div style={styles.modalActions}>
              <button type="button" onClick={handleConfirmDisconnect} style={styles.saveButton}>
                Disconnect
              </button>
              <button
                type="button"
                onClick={() => setDisconnectItemId(null)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeOffers.length > 0 && (
        <AccountMergeWizard
          offers={mergeOffers}
          onClose={handleMergeWizardClosed}
          onMerged={handleMergeCompleted}
          onKeptSeparate={handleMergeCompleted}
        />
      )}

      <TransactionImportModal
        isOpen={showTransactionImport}
        onClose={() => setShowTransactionImport(false)}
        accounts={importAccounts}
        title="Import transactions from CSV"
        onComplete={() => {
          loadLinkedItems();
          notifyAccountsChanged({ reason: 'plaid-disconnect' });
        }}
      />

      {/* Category Mapping Modal */}
      {showMappingModal && (
        <div style={styles.modalOverlay} onClick={() => setShowMappingModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Map Plaid Categories</h3>
            <p>Please map the following Plaid categories to your budget categories:</p>
            {unmappedCategories.map(plaidCat => (
              <div key={plaidCat} style={styles.mappingRow}>
                <label style={styles.mappingLabel}>{plaidCat}:</label>
                <select
                  value={categoryMappings[plaidCat] || ''}
                  onChange={(e) => handleMappingChange(plaidCat, e.target.value)}
                  style={styles.select}
                >
                  <option value="">-- Select a category --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <div style={styles.modalActions}>
              <button onClick={handleSaveMappings} disabled={saving} style={styles.saveButton}>
                {saving ? 'Saving...' : 'Save Mappings'}
              </button>
              <button onClick={() => setShowMappingModal(false)} style={styles.cancelButton}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    color: 'white',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    margin: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: '1rem',
  },
  connectButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  connectButtonDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
    transform: 'none',
    boxShadow: 'none',
  },
  syncAllButton: {
    padding: '0.75rem 1.5rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  error: {
    background: '#7F1A1A',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    color: '#FECACA',
  },
  infoBanner: {
    background: '#1E3A5F',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    color: '#BFDBFE',
    fontSize: '0.9rem',
  },
  complianceNote: {
    fontSize: '0.8rem',
    color: '#9CA3AF',
    lineHeight: 1.5,
    margin: '0 0 1rem',
    maxWidth: '720px',
  },
  complianceLink: {
    color: '#93C5FD',
    textDecoration: 'underline',
  },
  settingsCard: {
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: '0.75rem',
    marginBottom: '1.5rem',
    overflow: 'hidden',
  },
  settingsToggle: {
    width: '100%',
    textAlign: 'left',
    padding: '1rem 1.25rem',
    background: 'transparent',
    border: 'none',
    color: '#E5E7EB',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  settingsBody: {
    padding: '0 1.25rem 1.25rem',
    borderTop: '1px solid #374151',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    color: '#D1D5DB',
    fontSize: '0.9rem',
    marginTop: '1rem',
    cursor: 'pointer',
  },
  settingHint: {
    margin: '0.75rem 0 0',
    fontSize: '0.8rem',
    color: '#9CA3AF',
    lineHeight: 1.45,
  },
  settingsLinkButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#374151',
    color: '#F9FAFB',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  mergeModalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '1rem',
  },
  mergeModalContent: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    maxWidth: '520px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid #374151',
  },
  mergeIntro: {
    color: '#9CA3AF',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  mergeOfferCard: {
    background: '#111827',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '1rem',
    border: '1px solid #374151',
  },
  mergePlaidName: {
    marginBottom: '0.5rem',
    color: '#F3F4F6',
  },
  mergeHint: {
    fontSize: '0.8rem',
    color: '#9CA3AF',
    margin: '0.5rem 0',
  },
  mergeCandidateList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  mergeCandidateItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151',
    color: '#E5E7EB',
    fontSize: '0.875rem',
  },
  mergeLinkButton: {
    padding: '0.35rem 0.75rem',
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
  },
  mergeSkipButton: {
    marginTop: '0.5rem',
    padding: '0.35rem 0.75rem',
    background: 'transparent',
    color: '#9CA3AF',
    border: '1px solid #4B5563',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  syncHistoryBox: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #374151',
  },
  syncHistoryTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#D1D5DB',
    marginBottom: '0.5rem',
  },
  syncHistoryList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  syncHistoryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    padding: '0.35rem 0',
    borderBottom: '1px solid #374151',
  },
  syncHistoryMeta: {
    fontSize: '0.7rem',
    color: '#6B7280',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#9CA3AF',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    color: '#9CA3AF',
  },
  bankCard: {
    background: '#1F2937',
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '1rem',
    transition: 'background 0.2s',
  },
  bankHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  bankName: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
  },
  bankStatus: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    background: '#111827',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  accountList: {
    listStyle: 'none',
    margin: '0 0 0.75rem 0',
    padding: '0 0 0 0.5rem',
    fontSize: '0.85rem',
    color: '#D1D5DB',
  },
  accountListItem: {
    marginBottom: '0.35rem',
  },
  accountListRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  accountBalanceMeta: {
    marginTop: '0.35rem',
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.75)',
    paddingLeft: '0.15rem',
  },
  unlinkAccountBtn: {
    padding: '0.2rem 0.5rem',
    fontSize: '0.7rem',
    background: 'transparent',
    border: '1px solid rgba(248, 113, 113, 0.45)',
    borderRadius: '0.25rem',
    color: '#FCA5A5',
    cursor: 'pointer',
    flexShrink: 0,
  },
  consentBanner: {
    marginBottom: '1rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    background: 'rgba(180, 83, 9, 0.2)',
    border: '1px solid rgba(251, 191, 36, 0.45)',
    color: '#FDE68A',
  },
  consentBannerText: {
    margin: '0.5rem 0',
    fontSize: '0.85rem',
    color: '#FCD34D',
  },
  consentList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  consentListItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginTop: '0.35rem',
    fontSize: '0.85rem',
  },
  consentReconnectBtn: {
    padding: '0.25rem 0.6rem',
    fontSize: '0.75rem',
    background: '#D97706',
    color: '#fff',
    border: 'none',
    borderRadius: '0.25rem',
    cursor: 'pointer',
  },
  bankActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    alignItems: 'center',
  },
  syncButton: {
    padding: '0.5rem 1rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '90px',
  },
  removeButton: {
    padding: '0.5rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  reconnectButton: {
    padding: '0.5rem 1rem',
    background: '#F59E0B',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    marginLeft: '0.5rem',
  },
  syncStatus: {
    marginTop: '0.5rem',
    fontSize: '0.8rem',
    color: '#9CA3AF',
    textAlign: 'right',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    color: 'white',
  },
  mappingRow: {
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  mappingLabel: {
    width: '150px',
    color: '#9CA3AF',
  },
  select: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '1rem',
    marginTop: '2rem',
  },
  saveButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
};

export default LinkedBanksView;