import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/Button';

const defaultGroups = [
  {
    id: 1,
    name: 'Living',
    categories: [{ id: 11, name: 'Rent' }, { id: 12, name: 'Utilities' }],
  },
  {
    id: 2,
    name: 'Lifestyle',
    categories: [{ id: 21, name: 'Food' }, { id: 22, name: 'Entertainment' }],
  },
];

const defaultEncryptionSettings = {
  kdf: 'Argon2id',
  memoryCost: 64,
  iterations: 3,
};

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('general');
  const [groups, setGroups] = useState(defaultGroups);
  const [newGroupName, setNewGroupName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState({});
  const [budget, setBudget] = useState(2400);
  const [currency, setCurrency] = useState('USD');
  const [theme, setTheme] = useState('light');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupStatus, setBackupStatus] = useState('Unavailable');
  const [lastBackup, setLastBackup] = useState(null);
  const [backupMessage, setBackupMessage] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [encryptionSettings, setEncryptionSettings] = useState(defaultEncryptionSettings);
  const [plaidStatus, setPlaidStatus] = useState({ configured: false, enabled: true, env: 'sandbox' });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);

  const tabItems = useMemo(
    () => [
      { key: 'general', label: 'General', description: 'Core preferences and appearance.' },
      { key: 'banking', label: 'Linked Banks', description: 'Plaid connection, sync, and privacy.' },
      { key: 'prosperity', label: 'Prosperity Map', description: 'Budget and outcome settings.' },
      { key: 'backup', label: 'Backup', description: 'Export or restore encrypted backups.' },
      { key: 'categories', label: 'Categories', description: 'Edit groups and categories.' },
    ],
    []
  );

  const isBusy = isBackingUp || isRestoring || isSaving;
  const canChangeTabs = !isBusy;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const settingsJson = window.localStorage.getItem('intentflowSettings');
    if (settingsJson) {
      try {
        const stored = JSON.parse(settingsJson);
        if (stored.currency) setCurrency(stored.currency);
        if (stored.theme) setTheme(stored.theme);
        if (typeof stored.budget === 'number') setBudget(stored.budget);
        if (Array.isArray(stored.groups)) setGroups(stored.groups);
      } catch (error) {
        console.warn('Failed to load stored settings:', error);
      }
    }

    const encryptionJson = window.localStorage.getItem('intentflowEncryptionSettings');
    if (encryptionJson) {
      try {
        const stored = JSON.parse(encryptionJson);
        setEncryptionSettings({ ...defaultEncryptionSettings, ...stored });
      } catch (error) {
        console.warn('Failed to load encryption settings:', error);
      }
    }

    const backupMeta = window.localStorage.getItem('intentflowBackupMeta');
    if (backupMeta) {
      try {
        const parsed = JSON.parse(backupMeta);
        if (parsed.lastBackup) {
          setLastBackup(parsed.lastBackup);
          setBackupStatus('Available');
        }
      } catch (error) {
        console.warn('Failed to parse backup metadata:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!user && activeTab === 'categories') {
      setActiveTab('general');
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    (async () => {
      if (window.electronAPI.getPlaidConfigStatus) {
        const cfg = await window.electronAPI.getPlaidConfigStatus();
        if (cfg?.success && cfg.data) setPlaidStatus(cfg.data);
      }
      if (window.electronAPI.getAutoSyncSetting) {
        const sync = await window.electronAPI.getAutoSyncSetting();
        if (sync?.success) setAutoSyncEnabled(sync.enabled !== false);
      }
    })();
  }, []);

  const persistBackupMeta = (lastBackupAt) => {
    const payload = { lastBackup: lastBackupAt };
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('intentflowBackupMeta', JSON.stringify(payload));
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setBackupMessage('Saving settings...');

    const settings = {
      currency,
      theme,
      budget,
      groups,
      encryptionSettings,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('intentflowSettings', JSON.stringify(settings));
      window.localStorage.setItem('intentflowEncryptionSettings', JSON.stringify(encryptionSettings));
    }

    try {
      if (window.electronAPI?.saveSettings) {
        await window.electronAPI.saveSettings(settings);
      }
      setBackupMessage('Settings saved successfully. Redirecting...');
      await router.push('/');
    } catch (error) {
      setBackupMessage(error?.message || 'Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupResult = (result) => {
    if (!result) {
      setBackupMessage('Unexpected backup response.');
      return;
    }

    if (result.success) {
      const now = new Date().toISOString();
      setBackupStatus('Available');
      setLastBackup(now);
      setBackupMessage(result.message || 'Backup complete.');
      persistBackupMeta(now);
      return;
    }

    if (result.canceled) {
      setBackupMessage('Backup cancelled.');
      return;
    }

    setBackupMessage(result.error || 'Backup failed.');
  };

  const handleExportBackup = async () => {
    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to export a backup.');
      return;
    }

    if (backupPassword.length < 8) {
      setBackupMessage('Use at least 8 characters for stronger backup encryption.');
      return;
    }

    setIsBackingUp(true);
    setBackupMessage('Preparing backup file...');

    try {
      if (!window.electronAPI?.backupDatabase) {
        setBackupMessage('Backup API is unavailable.');
        return;
      }
      const result = await window.electronAPI.backupDatabase(backupPassword, encryptionSettings);
      handleBackupResult(result);
    } catch (error) {
      setBackupMessage(error?.message || 'Backup export failed.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportBackup = async () => {
    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to restore a backup.');
      return;
    }

    const confirmed = window.confirm(
      'Restoring a backup will replace all current data. A rollback snapshot will be created automatically. Continue?'
    );
    if (!confirmed) {
      setBackupMessage('Restore canceled.');
      return;
    }

    setIsRestoring(true);
    setBackupMessage('Restoring backup...');

    try {
      if (!window.electronAPI?.restoreDatabase) {
        setBackupMessage('Restore API is unavailable.');
        return;
      }

      const result = await window.electronAPI.restoreDatabase(backupPassword);
      if (result?.success) {
        const now = new Date().toISOString();
        setBackupStatus('Available');
        setLastBackup(now);
        setBackupMessage(result.message || 'Restore completed successfully.');
        persistBackupMeta(now);
      } else if (result?.canceled) {
        setBackupMessage('Restore canceled.');
      } else {
        setBackupMessage(result?.error || 'Restore failed.');
      }
    } catch (error) {
      setBackupMessage(error?.message || 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleBackToPropertyMap = () => {
    if (isBusy || isNavigating) return;
    setIsNavigating(true);
    router.push('/').finally(() => setIsNavigating(false));
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const createGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setGroups((previous) => [
      ...previous,
      { id: Date.now(), name: trimmed, categories: [] },
    ]);
    setNewGroupName('');
  };

  const addCategory = (groupId) => {
    const name = (newCategoryName[groupId] || '').trim();
    if (!name) return;

    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? { ...group, categories: [...group.categories, { id: Date.now(), name }] }
          : group
      )
    );
    setNewCategoryName((current) => ({ ...current, [groupId]: '' }));
  };

  const updateGroupName = (groupId, value) => {
    setGroups((previous) =>
      previous.map((group) => (group.id === groupId ? { ...group, name: value } : group))
    );
  };

  const updateCategory = (groupId, categoryId, value) => {
    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              categories: group.categories.map((category) =>
                category.id === categoryId ? { ...category, name: value } : category
              ),
            }
          : group
      )
    );
  };

  const removeCategory = (groupId, categoryId) => {
    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? { ...group, categories: group.categories.filter((category) => category.id !== categoryId) }
          : group
      )
    );
  };

  const removeGroup = (groupId) => {
    setGroups((previous) => previous.filter((group) => group.id !== groupId));
  };

  return (
    <AppShell
      title="Settings"
      subtitle="A modern control center for budget, categories, backups, and app preferences."
      actions={(
        <>
          {user && (
            <Button variant="secondary" onClick={handleLogout} disabled={isBusy}>
              Logout
            </Button>
          )}
          <Button variant="secondary" onClick={handleBackToPropertyMap} disabled={isBusy || isNavigating}>
            Back to PropertyMap
          </Button>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Workspace tabs</h2>
          <p className="mt-2 text-sm text-slate-300">Quickly switch between settings sections and keep your workspace stable.</p>
          <div className="mt-6 space-y-2">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                disabled={!canChangeTabs}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${activeTab === tab.key ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:bg-slate-900'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{tab.label}</span>
                  <span className="text-xs text-slate-500">{tab.key === 'backup' && 'Safe'}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{tab.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">{tabItems.find((tab) => tab.key === activeTab)?.label}</h2>
                <p className="mt-2 text-sm text-slate-400">{tabItems.find((tab) => tab.key === activeTab)?.description}</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                {backupStatus} · {lastBackup ? new Date(lastBackup).toLocaleString() : 'No backups yet'}
              </div>
            </div>
          </div>

          {activeTab === 'backup' && (
            <div className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="backup-password" className="block text-sm font-semibold text-slate-200">Backup password</label>
                    <input
                      id="backup-password"
                      type="password"
                      value={backupPassword}
                      onChange={(event) => setBackupPassword(event.target.value)}
                      placeholder="Enter secure password"
                      className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      disabled={isBusy}
                    />
                    <p className="mt-2 text-sm text-slate-400">Your backup file is encrypted locally before it is saved.</p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button onClick={handleExportBackup} disabled={isBusy}>
                      {isBackingUp ? 'Exporting...' : 'Export Backup'}
                    </Button>
                    <Button variant="secondary" onClick={handleImportBackup} disabled={isBusy}>
                      {isRestoring ? 'Restoring...' : 'Import Backup'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-[2rem] border border-slate-800 bg-slate-950/80 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
                    <p className="mt-3 text-lg font-semibold text-white">{backupStatus === 'Available' ? 'Ready to restore' : 'Backup unavailable'}</p>
                  </div>
                  <div className="space-y-3 rounded-3xl bg-slate-900/70 p-4">
                    <p className="text-sm text-slate-400">Keep your password in a secure place. Lost passwords cannot be recovered.</p>
                    {backupMessage && <p className="text-sm text-slate-300">{backupMessage}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'banking' && (
            <div className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <p className="text-sm leading-6 text-slate-300">
                Bank connections use Plaid. Account credentials are encrypted on this device. IntentFlow does
                not sell your financial data.
              </p>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                <p>
                  <span className="font-semibold text-white">Status: </span>
                  {!plaidStatus.enabled
                    ? 'Disabled (PLAID_ENABLED=false)'
                    : plaidStatus.configured
                      ? `Configured (${plaidStatus.env || 'sandbox'})`
                      : 'Not configured — add keys to .env and restart'}
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setAutoSyncEnabled(enabled);
                    if (window.electronAPI?.setAutoSyncSetting) {
                      await window.electronAPI.setAutoSyncSetting(enabled);
                    }
                  }}
                />
                Automatically sync linked banks hourly and when the app regains focus
              </label>
              <p className="text-xs text-slate-500">
                Data use: balances and transactions are read for budgeting only, stored locally, and
                never sold. Disconnect anytime in Linked Banks.
              </p>
              <Button
                variant="secondary"
                onClick={() => router.push('/?view=linked-banks')}
                disabled={!plaidStatus.enabled}
              >
                Open Linked Banks
              </Button>
            </div>
          )}

          {activeTab === 'general' && (
            <form onSubmit={saveSettings} className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <label htmlFor="currency" className="block text-sm font-semibold text-slate-200">Home currency</label>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label htmlFor="theme" className="block text-sm font-semibold text-slate-200">Theme mode</label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                    className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="budget" className="block text-sm font-semibold text-slate-200">Monthly budget target</label>
                <input
                  id="budget"
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
                <p className="text-sm text-slate-400">This budget is used to guide your Prosperity Map and spending categories.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-400">Encryption settings are saved locally for backup workflows.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={isSaving || isBusy}>Save Settings</Button>
                  <Button variant="secondary" onClick={handleBackToPropertyMap} disabled={isBusy || isNavigating}>Cancel</Button>
                </div>
              </div>
            </form>
          )}

          {activeTab === 'prosperity' && (
            <div className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">Prosperity Map</h3>
                  <p className="mt-3 text-sm text-slate-400">Adjust how your income flows across categories and savings targets.</p>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-400">Monthly budget</span>
                    <span className="text-lg font-semibold text-white">{currency} {budget.toLocaleString()}</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: Math.min(100, (budget / 5000) * 100) + '%' }} />
                  </div>
                  <p className="mt-3 text-sm text-slate-400">A higher budget gives you more flexibility while preserving prosperity targets.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <div className="grid gap-6">
                {groups.map((group) => (
                  <section key={group.id} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-200">Group name</label>
                        <input
                          type="text"
                          value={group.name}
                          onChange={(event) => updateGroupName(group.id, event.target.value)}
                          className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <Button variant="danger" onClick={() => removeGroup(group.id)}>
                        Remove group
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {group.categories.map((category) => (
                        <div key={category.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <input
                            type="text"
                            value={category.name}
                            onChange={(event) => updateCategory(group.id, category.id, event.target.value)}
                            className="flex-1 rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                          />
                          <Button variant="secondary" onClick={() => removeCategory(group.id, category.id)}>
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        type="text"
                        value={newCategoryName[group.id] || ''}
                        placeholder="New category name"
                        onChange={(event) => setNewCategoryName((current) => ({ ...current, [group.id]: event.target.value }))}
                        className="rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      />
                      <Button onClick={() => addCategory(group.id)}>Add category</Button>
                    </div>
                  </section>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={newGroupName}
                  placeholder="New category group"
                  onChange={(event) => setNewGroupName(event.target.value)}
                  className="rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
                <Button onClick={createGroup}>Create group</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
