import React, { useState, useEffect } from 'react';

const PLAID_LINK_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

const LinkedBanksView = () => {
  const [loading, setLoading] = useState(false);
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

  // Load linked items
  const loadLinkedItems = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getLinkedItems();
      if (result.success) {
        setConnectedItems(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch categories for mapping modal
  useEffect(() => {
    if (showMappingModal) {
      const fetchCategories = async () => {
        const userResult = await window.electronAPI.getCurrentUser();
        const userId = userResult?.data?.id || 2;
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

  useEffect(() => {
    loadLinkedItems();
  }, []);

  // Load Plaid Link script
  useEffect(() => {
    if (window.Plaid) return;
    const script = document.createElement('script');
    script.src = PLAID_LINK_SCRIPT_URL;
    script.async = true;
    script.onload = () => console.log('✅ Plaid Link script loaded');
    script.onerror = () => {
      console.error('❌ Failed to load Plaid Link script');
      setError('Failed to load Plaid Link. Please check your internet connection.');
    };
    document.body.appendChild(script);
  }, []);

  // Connect new bank
  const handleConnectBank = async () => {
    setLoading(true);
    try {
      const tokenResult = await window.electronAPI.createLinkToken();
      if (!tokenResult.success) throw new Error(tokenResult.error);

      const handler = Plaid.create({
        token: tokenResult.link_token,
        onSuccess: async (public_token, metadata) => {
          const exchangeResult = await window.electronAPI.exchangePublicToken(public_token);
          if (exchangeResult.success) {
            await loadLinkedItems();
            alert('✅ Bank connected successfully!');
          } else {
            alert('❌ Failed to connect bank: ' + exchangeResult.error);
          }
          handler.destroy();
        },
        onExit: (err, metadata) => {
          if (err) console.error('Plaid Link exit with error:', err);
          handler.destroy();
          setLoading(false);
        },
      });
      handler.open();
    } catch (err) {
      console.error('Error connecting bank:', err);
      setError(err.message);
      setLoading(false);
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

        await loadLinkedItems(); // refresh last_sync date

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
      alert('A sync is already in progress. Please wait.');
      return;
    }
    setLoading(true);
    for (const item of connectedItems) {
      await handleSyncItem(item.id);
    }
    setLoading(false);
  };

  // Remove bank
  const handleRemoveItem = async (itemId) => {
    if (!confirm('Are you sure you want to disconnect this bank? All associated data will be removed.')) return;

    setSyncingItemId(itemId);
    try {
      const result = await window.electronAPI.removeItem(itemId);
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
    setSyncingItemId(itemId);
    try {
      const tokenResult = await window.electronAPI.createUpdateLinkToken(itemId);
      if (!tokenResult.success) throw new Error(tokenResult.error);

      const handler = Plaid.create({
        token: tokenResult.link_token,
        onSuccess: async (public_token, metadata) => {
          const exchangeResult = await window.electronAPI.exchangePublicToken(public_token);
          if (exchangeResult.success) {
            await loadLinkedItems();
            setNeedsReconnect(null);
            setSyncStatuses(prev => ({ ...prev, [itemId]: '✅ Bank reconnected successfully!' }));
            setTimeout(() => {
              setSyncStatuses(prev => {
                const newStatus = { ...prev };
                delete newStatus[itemId];
                return newStatus;
              });
            }, 3000);
            // Optionally sync again
            handleSyncItem(itemId);
          } else {
            alert('❌ Failed to reconnect: ' + exchangeResult.error);
          }
          handler.destroy();
        },
        onExit: (err, metadata) => {
          if (err) console.error('Plaid Link exit with error:', err);
          handler.destroy();
          setSyncingItemId(null);
        },
      });
      handler.open();
    } catch (err) {
      console.error('Error reconnecting bank:', err);
      alert('Reconnect failed: ' + err.message);
    } finally {
      setSyncingItemId(null);
    }
  };

  // Category mapping modal handlers
  const handleMappingChange = (plaidCategory, categoryId) => {
    setCategoryMappings(prev => ({ ...prev, [plaidCategory]: categoryId }));
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    try {
      const promises = [];
      for (const [plaidCategory, categoryId] of Object.entries(categoryMappings)) {
        if (categoryId) {
          promises.push(window.electronAPI.saveCategoryMapping(plaidCategory, categoryId));
        }
      }
      await Promise.all(promises);
      alert('✅ Category mappings saved!');
      setShowMappingModal(false);
      // Optionally re‑sync affected banks to apply categories immediately
      for (const item of connectedItems) {
        await handleSyncItem(item.id);
      }
    } catch (error) {
      console.error('Error saving mappings:', error);
      alert('Failed to save some mappings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    
    <div style={styles.container}>
    <div className="spinner w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      <div style={styles.header}>
        <h2 style={styles.title}>Linked Banks</h2>
        <div style={styles.buttonGroup}>
          <button
            onClick={handleSyncAll}
            style={styles.syncAllButton}
            disabled={loading || syncingItemId !== null}
          >
            Sync All
          </button>
          <button
            onClick={handleConnectBank}
            style={styles.connectButton}
            disabled={loading}
          >
            {loading ? 'Connecting...' : '+ Connect New Bank'}
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>⚠️ {error}</div>}

      {loading && !connectedItems.length && (
        <div style={styles.loading}>Loading your linked banks...</div>
      )}

      {!loading && connectedItems.length === 0 && (
        <div style={styles.empty}>
          <p>No banks connected yet.</p>
          <p>Click "Connect New Bank" to link your financial accounts.</p>
        </div>
      )}

      {connectedItems.map((item) => (
        <div key={item.id} style={styles.bankCard}>
          <div style={styles.bankHeader}>
            <h3 style={styles.bankName}>
              {item.institution_name || item.id}
            </h3>
            <span style={styles.bankStatus}>
              {item.last_sync ? `Last synced: ${new Date(item.last_sync).toLocaleString()}` : 'Never synced'}
            </span>
          </div>
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
            {needsReconnect === item.id && (
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
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
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