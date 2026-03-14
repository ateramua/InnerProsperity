// src/pages/mobile-settings.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import { Preferences } from '@capacitor/preferences';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileSettings() {
  const [activeSection, setActiveSection] = useState('profile');
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [preferences, setPreferences] = useState({
    currency: 'USD',
    theme: 'dark',
    notifications: true,
    biometricLogin: false,
    autoBackup: true,
    monthlyReset: false,
    defaultAccount: '',
    defaultCategory: ''
  });
  
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    loadSettingsData();
    loadStoredPreferences();
  }, []);

  const loadSettingsData = async () => {
    setIsLoading(true);
    try {
      // Load accounts
      const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      if (accountsResult?.success) {
        setAccounts(accountsResult.data || []);
      }

      // Load categories
     const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
      }
    } catch (error) {
      console.error('Error loading settings data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStoredPreferences = async () => {
    try {
      const { value } = await Preferences.get({ key: 'userPreferences' });
      if (value) {
        setPreferences(JSON.parse(value));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const savePreferences = async (newPrefs) => {
    try {
      await Preferences.set({
        key: 'userPreferences',
        value: JSON.stringify(newPrefs)
      });
      setPreferences(newPrefs);
      // Show success message
      alert('Preferences saved successfully!');
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const handlePreferenceChange = async (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    await savePreferences(newPrefs);
  };

  const handleExportData = async () => {
    try {
      // Get all data
      const transactions = await window.electronAPI?.getTransactions();
      const accountsData = await window.electronAPI?.getAccountsSummary(user?.id);
      const categoriesData = await window.electronAPI?.getCategories(user?.id);
      
      // Create export object
      const exportData = {
        user: { id: user?.id, username: user?.username },
        accounts: accountsData?.data || [],
        categories: categoriesData?.data || [],
        transactions: transactions?.data || [],
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      // Convert to JSON and download
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intentflow-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      alert('Data exported successfully!');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data');
    }
  };

  const handleImportData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importData = JSON.parse(e.target.result);
          
          // Validate import data
          if (!importData.version || !importData.transactions) {
            alert('Invalid backup file format');
            return;
          }
          
          // Confirm import
          if (!confirm('This will replace all your current data. Are you sure?')) return;
          
          // Import transactions (simplified - would need proper API calls)
          alert('Import functionality - would call API to import data');
          
        } catch (error) {
          console.error('Error parsing import file:', error);
          alert('Invalid backup file');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error importing data:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('This action is permanent and cannot be undone. Continue?')) return;
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = async () => {
    try {
      // Delete user account (would call API)
      alert('Account deletion - would call API to delete user data');
      await logout();
      router.push('/mobile-login');
    } catch (error) {
      console.error('Error deleting account:', error);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleAddTransaction = async (transactionData) => {
    try {
     const result = await DatabaseProxy.addTransaction(transactionData);
      if (result?.success) {
        // Refresh data if needed
        alert('Transaction added!');
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/mobile-login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.back()} style={styles.backButton}>
          ←
        </button>
        <h1 style={styles.title}>Settings</h1>
        <button style={styles.menuButton}>⋮</button>
      </div>

      {/* Profile Section */}
      <div style={styles.profileCard}>
        <div style={styles.profileAvatar}>
          {user?.username?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div style={styles.profileInfo}>
          <h2 style={styles.profileName}>{user?.username || 'User'}</h2>
          <p style={styles.profileEmail}>{user?.email || 'user@example.com'}</p>
        </div>
        <button style={styles.editProfileButton}>✏️</button>
      </div>

      {/* Settings Navigation Tabs */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeSection === 'profile' ? styles.activeTab : {})
          }}
          onClick={() => setActiveSection('profile')}
        >
          Profile
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeSection === 'preferences' ? styles.activeTab : {})
          }}
          onClick={() => setActiveSection('preferences')}
        >
          Preferences
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeSection === 'data' ? styles.activeTab : {})
          }}
          onClick={() => setActiveSection('data')}
        >
          Data
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeSection === 'about' ? styles.activeTab : {})
          }}
          onClick={() => setActiveSection('about')}
        >
          About
        </button>
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div>
            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Account Information</h3>
              
              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>👤</span>
                  <div>
                    <p style={styles.settingLabel}>Username</p>
                    <p style={styles.settingValue}>{user?.username || 'User'}</p>
                  </div>
                </div>
                <button style={styles.settingAction}>Edit</button>
              </div>

              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>📧</span>
                  <div>
                    <p style={styles.settingLabel}>Email</p>
                    <p style={styles.settingValue}>{user?.email || 'user@example.com'}</p>
                  </div>
                </div>
                <button style={styles.settingAction}>Edit</button>
              </div>

              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>🔒</span>
                  <div>
                    <p style={styles.settingLabel}>Password</p>
                    <p style={styles.settingValue}>••••••••</p>
                  </div>
                </div>
                <button style={styles.settingAction}>Change</button>
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Default Settings</h3>
              
              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>🏦</span>
                  <div>
                    <p style={styles.settingLabel}>Default Account</p>
                    <p style={styles.settingValue}>
                      {accounts.find(a => a.id === preferences.defaultAccount)?.name || 'None selected'}
                    </p>
                  </div>
                </div>
                <select 
                  style={styles.settingSelect}
                  value={preferences.defaultAccount}
                  onChange={(e) => handlePreferenceChange('defaultAccount', e.target.value)}
                >
                  <option value="">Select default account</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>📂</span>
                  <div>
                    <p style={styles.settingLabel}>Default Category</p>
                    <p style={styles.settingValue}>
                      {categories.find(c => c.id === preferences.defaultCategory)?.name || 'None selected'}
                    </p>
                  </div>
                </div>
                <select 
                  style={styles.settingSelect}
                  value={preferences.defaultCategory}
                  onChange={(e) => handlePreferenceChange('defaultCategory', e.target.value)}
                >
                  <option value="">Select default category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button style={styles.dangerButton} onClick={handleLogout}>
              <span style={styles.dangerIcon}>🚪</span>
              Log Out
            </button>
          </div>
        )}

        {/* Preferences Section */}
        {activeSection === 'preferences' && (
          <div>
            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Appearance</h3>
              
              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>🎨</span>
                  <div>
                    <p style={styles.settingLabel}>Theme</p>
                    <p style={styles.settingValue}>
                      {preferences.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                    </p>
                  </div>
                </div>
                <div style={styles.toggleContainer}>
                  <button
                    style={{
                      ...styles.toggleOption,
                      ...(preferences.theme === 'dark' ? styles.toggleActive : {})
                    }}
                    onClick={() => handlePreferenceChange('theme', 'dark')}
                  >
                    Dark
                  </button>
                  <button
                    style={{
                      ...styles.toggleOption,
                      ...(preferences.theme === 'light' ? styles.toggleActive : {})
                    }}
                    onClick={() => handlePreferenceChange('theme', 'light')}
                  >
                    Light
                  </button>
                </div>
              </div>

              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>💵</span>
                  <div>
                    <p style={styles.settingLabel}>Currency</p>
                    <p style={styles.settingValue}>{preferences.currency}</p>
                  </div>
                </div>
                <select 
                  style={styles.settingSelect}
                  value={preferences.currency}
                  onChange={(e) => handlePreferenceChange('currency', e.target.value)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Notifications</h3>
              
              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>🔔</span>
                  <div>
                    <p style={styles.settingLabel}>Push Notifications</p>
                    <p style={styles.settingValue}>
                      {preferences.notifications ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <label style={styles.switch}>
                  <input
                    type="checkbox"
                    checked={preferences.notifications}
                    onChange={(e) => handlePreferenceChange('notifications', e.target.checked)}
                  />
                  <span style={styles.slider}></span>
                </label>
              </div>

              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>📅</span>
                  <div>
                    <p style={styles.settingLabel}>Monthly Budget Reset</p>
                    <p style={styles.settingValue}>
                      {preferences.monthlyReset ? 'Auto-reset on 1st' : 'Manual'}
                    </p>
                  </div>
                </div>
                <label style={styles.switch}>
                  <input
                    type="checkbox"
                    checked={preferences.monthlyReset}
                    onChange={(e) => handlePreferenceChange('monthlyReset', e.target.checked)}
                  />
                  <span style={styles.slider}></span>
                </label>
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Security</h3>
              
              <div style={styles.settingItem}>
                <div style={styles.settingLeft}>
                  <span style={styles.settingIcon}>👆</span>
                  <div>
                    <p style={styles.settingLabel}>Biometric Login</p>
                    <p style={styles.settingValue}>
                      {preferences.biometricLogin ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <label style={styles.switch}>
                  <input
                    type="checkbox"
                    checked={preferences.biometricLogin}
                    onChange={(e) => handlePreferenceChange('biometricLogin', e.target.checked)}
                  />
                  <span style={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Data Section */}
        {activeSection === 'data' && (
          <div>
            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Backup & Restore</h3>
              
              <button style={styles.dataButton} onClick={handleExportData}>
                <span style={styles.dataIcon}>📤</span>
                Export Data
              </button>

              <div style={styles.fileInputContainer}>
                <input
                  type="file"
                  id="import-file"
                  accept=".json"
                  onChange={handleImportData}
                  style={styles.fileInput}
                />
                <label htmlFor="import-file" style={styles.dataButton}>
                  <span style={styles.dataIcon}>📥</span>
                  Import Data
                </label>
              </div>

              <button style={styles.dataButton}>
                <span style={styles.dataIcon}>🔄</span>
                Sync with Cloud
              </button>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Data Management</h3>
              
              <button style={styles.dataButton}>
                <span style={styles.dataIcon}>🗑️</span>
                Clear All Transactions
              </button>

              <button style={styles.dataButton}>
                <span style={styles.dataIcon}>📊</span>
                Export Reports (PDF)
              </button>

              <button style={styles.dataButton}>
                <span style={styles.dataIcon}>📋</span>
                Export to CSV
              </button>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Danger Zone</h3>
              
              <button style={styles.dangerDataButton} onClick={handleDeleteAccount}>
                <span style={styles.dangerIcon}>⚠️</span>
                Delete Account & All Data
              </button>
              <p style={styles.dangerNote}>
                This action cannot be undone. All your data will be permanently deleted.
              </p>
            </div>
          </div>
        )}

        {/* About Section */}
        {activeSection === 'about' && (
          <div>
            <div style={styles.aboutCard}>
              <h2 style={styles.appName}>IntentFlow</h2>
              <p style={styles.appVersion}>Version 1.0.0</p>
              <p style={styles.appDescription}>
                Take control of your finances with intelligent budgeting and forecasting.
              </p>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Legal</h3>
              
              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>📜</span>
                Terms of Service
              </button>

              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>🔒</span>
                Privacy Policy
              </button>

              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>📝</span>
                Licenses
              </button>
            </div>

            <div style={styles.settingsGroup}>
              <h3 style={styles.groupTitle}>Support</h3>
              
              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>❓</span>
                Help Center
              </button>

              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>💬</span>
                Contact Support
              </button>

              <button style={styles.aboutButton}>
                <span style={styles.aboutIcon}>🐛</span>
                Report a Bug
              </button>
            </div>

            <div style={styles.footerNote}>
              <p>Made with ❤️ for financial freedom</p>
              <p>© 2024 IntentFlow. All rights reserved.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={styles.navItem} onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>Budget</span>
        </button>
        <button style={styles.navItem} onClick={() => setShowAddModal(true)}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-reports')}>
          <span style={styles.navIcon}>📈</span>
          <span style={styles.navLabel}>Reports</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isVisible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddTransaction}
        accounts={accounts}
        categories={categories}
      />

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={styles.modalOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Delete Account</h3>
            <p style={styles.modalText}>
              Are you absolutely sure? This will permanently delete all your data and cannot be undone.
            </p>
            <div style={styles.modalActions}>
              <button 
                style={styles.modalCancelButton}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                style={styles.modalConfirmButton}
                onClick={confirmDeleteAccount}
              >
                Yes, Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f2e1c',
    color: 'white',
    paddingBottom: '80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f2e1c',
    color: 'white',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: '#9CA3AF',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    paddingTop: '60px',
    background: '#0047AB',
  },
  backButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  menuButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    margin: '20px',
    background: '#1F2937',
    borderRadius: '16px',
  },
  profileAvatar: {
    width: '60px',
    height: '60px',
    borderRadius: '30px',
    background: '#3B82F6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '4px',
  },
  profileEmail: {
    fontSize: '14px',
    color: '#9CA3AF',
    margin: 0,
  },
  editProfileButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    margin: '0 20px',
    background: '#1F2937',
    borderRadius: '30px',
    padding: '4px',
    marginBottom: '20px',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    padding: '12px 4px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '13px',
    fontWeight: '500',
    borderRadius: '26px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  activeTab: {
    background: '#3B82F6',
    color: 'white',
  },
  tabContent: {
    padding: '0 20px',
  },
  settingsGroup: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '20px',
  },
  groupTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 16px 0',
    color: '#9CA3AF',
  },
  settingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #374151',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  settingLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  settingIcon: {
    fontSize: '20px',
    width: '32px',
  },
  settingLabel: {
    fontSize: '14px',
    margin: 0,
    marginBottom: '2px',
  },
  settingValue: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  settingAction: {
    padding: '6px 12px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
  },
  settingSelect: {
    padding: '6px 12px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
    maxWidth: '120px',
  },
  toggleContainer: {
    display: 'flex',
    background: '#374151',
    borderRadius: '20px',
    padding: '2px',
  },
  toggleOption: {
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    borderRadius: '18px',
    color: '#9CA3AF',
    fontSize: '12px',
    cursor: 'pointer',
  },
  toggleActive: {
    background: '#3B82F6',
    color: 'white',
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: '50px',
    height: '24px',
  },
  slider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#374151',
    borderRadius: '24px',
    transition: '0.2s',
    '&:before': {
      position: 'absolute',
      content: '""',
      height: '20px',
      width: '20px',
      left: '2px',
      bottom: '2px',
      backgroundColor: 'white',
      borderRadius: '50%',
      transition: '0.2s',
    },
  },
  dataButton: {
    width: '100%',
    padding: '14px',
    background: '#374151',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
    cursor: 'pointer',
  },
  dangerDataButton: {
    width: '100%',
    padding: '14px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '12px',
    color: '#EF4444',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  dataIcon: {
    fontSize: '16px',
  },
  dangerIcon: {
    fontSize: '16px',
  },
  dangerNote: {
    fontSize: '11px',
    color: '#9CA3AF',
    margin: '8px 0 0 0',
    textAlign: 'center',
  },
  fileInputContainer: {
    position: 'relative',
    marginBottom: '8px',
  },
  fileInput: {
    position: 'absolute',
    width: '0.1px',
    height: '0.1px',
    opacity: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  aboutCard: {
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    padding: '24px',
    borderRadius: '16px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  appName: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 0 8px 0',
  },
  appVersion: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.7)',
    margin: '0 0 12px 0',
  },
  appDescription: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.9)',
    margin: 0,
  },
  aboutButton: {
    width: '100%',
    padding: '14px',
    background: '#374151',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
    cursor: 'pointer',
  },
  aboutIcon: {
    fontSize: '16px',
    width: '24px',
  },
  footerNote: {
    textAlign: 'center',
    padding: '20px',
    color: '#6B7280',
    fontSize: '11px',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 0',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
  },
  navItem: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '300px',
    width: '90%',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: '#EF4444',
  },
  modalText: {
    fontSize: '14px',
    color: '#9CA3AF',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  modalCancelButton: {
    flex: 1,
    padding: '12px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalConfirmButton: {
    flex: 1,
    padding: '12px',
    background: '#EF4444',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
};