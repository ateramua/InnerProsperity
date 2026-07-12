import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/Layout/AppShell';
import Button from '../components/ui/Button';
import { formatBudgetMonthKey } from '../utils/budgetMonthUtils';

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
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [encryptionSettings, setEncryptionSettings] = useState(defaultEncryptionSettings);
  const [plaidStatus, setPlaidStatus] = useState({ configured: false, enabled: true, env: 'sandbox' });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [backupHistory, setBackupHistory] = useState([]);
  const [backupQueue, setBackupQueue] = useState([]);
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [recoveryKitStatus, setRecoveryKitStatus] = useState({ exists: false, kit: null });
  const [restoreMode, setRestoreMode] = useState('in-place');
  const [backupDesktopReady, setBackupDesktopReady] = useState(null);
  const [prosperityMonthKey, setProsperityMonthKey] = useState(() => formatBudgetMonthKey(new Date()));
  const [prosperityMessage, setProsperityMessage] = useState('');
  const [prosperityPreview, setProsperityPreview] = useState(null);
  const [prosperityImportFile, setProsperityImportFile] = useState(null);
  const [prosperityCreateMissing, setProsperityCreateMissing] = useState(true);
  const [prosperityUpdateAssigned, setProsperityUpdateAssigned] = useState(true);
  const [prosperityUpdateGoals, setProsperityUpdateGoals] = useState(true);
  const [isProsperityExporting, setIsProsperityExporting] = useState(false);
  const [isProsperityImporting, setIsProsperityImporting] = useState(false);

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

  const isBackupBusy = isBackingUp || isRestoring || isSimulating;
  const isBusy =
    isBackupBusy ||
    isSaving ||
    isProsperityExporting ||
    isProsperityImporting;
  const canChangeTabs = !isBusy;

  const invokeIpcWithTimeout = (promise, timeoutMs, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`${label} timed out. Try closing other heavy tasks and retry.`)),
          timeoutMs,
        );
      }),
    ]);

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

  const refreshBackupRuntimeData = async () => {
    if (!window.electronAPI) return;
    if (window.electronAPI.getBackupHistory) {
      const history = await window.electronAPI.getBackupHistory();
      if (history?.success) {
        setBackupHistory(history.versions || []);
        const first = history.versions?.[0]?.id || '';
        const second = history.versions?.[1]?.id || '';
        if (!compareLeftId && first) setCompareLeftId(first);
        if (!compareRightId && second) setCompareRightId(second);
      }
    }
    if (window.electronAPI.getBackupQueue) {
      const queue = await window.electronAPI.getBackupQueue();
      if (queue?.success) {
        setBackupQueue(queue.operations || []);
      }
    }
    if (window.electronAPI.getRecoveryKitStatus) {
      const kit = await window.electronAPI.getRecoveryKitStatus();
      if (kit?.success) {
        setRecoveryKitStatus({ exists: !!kit.exists, kit: kit.kit || null });
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    refreshBackupRuntimeData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const checkBackupDesktopReady = async () => {
      const hasBackupApi =
        typeof window.electronAPI?.backupDatabase === 'function' &&
        typeof window.electronAPI?.restoreDatabase === 'function' &&
        !window.electronAPI?.__isBrowserMock;

      if (!hasBackupApi) {
        if (!cancelled) {
          setBackupDesktopReady(false);
        }
        return;
      }

      try {
        if (window.electronAPI.getBackupStatus) {
          const status = await window.electronAPI.getBackupStatus();
          if (!cancelled) {
            setBackupDesktopReady(Boolean(status?.success && status?.data?.fileEncryptionAvailable));
          }
          return;
        }
        const ping = await window.electronAPI.ping?.();
        if (!cancelled) {
          setBackupDesktopReady(Boolean(ping?.success));
        }
      } catch (error) {
        if (!cancelled) {
          setBackupDesktopReady(false);
        }
      }
    };

    void checkBackupDesktopReady();

    return () => {
      cancelled = true;
    };
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
      const savedPath = result.filePath || result.version?.backupFilePath;
      setBackupMessage(
        savedPath
          ? `${result.message || 'Backup complete.'} You can import this same file to restore.`
          : result.message || 'Backup complete.',
      );
      persistBackupMeta(now);
      return;
    }

    if (result.canceled) {
      setBackupMessage('Backup cancelled.');
      return;
    }

    setBackupMessage(result.error || 'Backup failed.');
  };

  const prosperityMonthInputValue =
    prosperityMonthKey && prosperityMonthKey.length >= 7
      ? prosperityMonthKey.slice(0, 7)
      : formatBudgetMonthKey(new Date()).slice(0, 7);

  const handleProsperityMonthChange = (event) => {
    const value = event.target.value;
    if (!value) return;
    setProsperityMonthKey(`${value}-01`);
    setProsperityPreview(null);
    setProsperityMessage('');
  };

  const handleExportProsperityTable = async (format) => {
    if (!user?.id) {
      setProsperityMessage('Sign in to export your Prosperity Map.');
      return;
    }
    if (!window.electronAPI?.exportProsperityTable) {
      setProsperityMessage('Export is available in the Electron app.');
      return;
    }
    setIsProsperityExporting(true);
    setProsperityMessage('');
    try {
      const result = await window.electronAPI.exportProsperityTable({
        userId: user.id,
        monthKey: prosperityMonthKey,
        format,
      });
      if (result?.canceled) {
        setProsperityMessage('Export canceled.');
      } else if (result?.success) {
        setProsperityMessage(
          `Exported ${result.rowCount ?? 0} categories for ${result.monthKey || prosperityMonthKey}.`
        );
      } else {
        setProsperityMessage(result?.error || 'Export failed.');
      }
    } catch (error) {
      setProsperityMessage(error?.message || 'Export failed.');
    } finally {
      setIsProsperityExporting(false);
    }
  };

  const handlePickProsperityImport = async () => {
    if (!user?.id) {
      setProsperityMessage('Sign in to import budget data.');
      return;
    }
    if (!window.electronAPI?.pickProsperityImportFile || !window.electronAPI?.previewProsperityImport) {
      setProsperityMessage('Import is available in the Electron app.');
      return;
    }
    setIsProsperityImporting(true);
    setProsperityMessage('');
    setProsperityPreview(null);
    try {
      const picked = await window.electronAPI.pickProsperityImportFile();
      if (picked?.canceled) {
        setProsperityMessage('Import canceled.');
        return;
      }
      if (!picked?.success) {
        setProsperityMessage(picked?.error || 'Could not read file.');
        return;
      }
      setProsperityImportFile({ fileName: picked.fileName, format: picked.format });
      const preview = await window.electronAPI.previewProsperityImport({
        userId: user.id,
        monthKey: prosperityMonthKey,
        filePath: picked.filePath,
        fileName: picked.fileName,
        format: picked.format,
      });
      if (!preview?.success) {
        setProsperityMessage(preview?.error || 'Could not preview import.');
        return;
      }
      setProsperityPreview(preview.data);
      const s = preview.data?.summary;
      if ((s?.total ?? 0) === 0) {
        setProsperityMessage(
          'No rows were parsed. Keep the header row, put monthly amounts in Assigned, and use prosperity-import-template.csv or .xlsx from the project folder.'
        );
      } else if ((s?.unchanged ?? 0) === s?.total) {
        setProsperityMessage(
          `Preview: all ${s.total} rows already match your database (unchanged). Change Assigned values or delete existing categories, then import again. Unchanged rows are skipped on Apply.`
        );
      } else {
        setProsperityMessage(
          `Preview: ${s?.total ?? 0} rows — ${s?.update ?? 0} updates, ${s?.unmatched ?? 0} new, ${s?.unchanged ?? 0} unchanged (unchanged rows are skipped on Apply).`
        );
      }
    } catch (error) {
      setProsperityMessage(error?.message || 'Import preview failed.');
    } finally {
      setIsProsperityImporting(false);
    }
  };

  const handleApplyProsperityImport = async () => {
    if (!user?.id || !prosperityPreview?.items?.length) {
      setProsperityMessage('Choose a file and preview import first.');
      return;
    }
    if (!window.electronAPI?.applyProsperityImport) {
      setProsperityMessage('Import is available in the Electron app.');
      return;
    }
    setIsProsperityImporting(true);
    setProsperityMessage('');
    try {
      const result = await window.electronAPI.applyProsperityImport({
        userId: user.id,
        monthKey: prosperityMonthKey,
        items: prosperityPreview.items,
        options: {
          createMissing: prosperityCreateMissing,
          updateAssigned: prosperityUpdateAssigned,
          updateGoals: prosperityUpdateGoals,
        },
      });
      if (!result?.success) {
        setProsperityMessage(result?.error || 'Import failed.');
        return;
      }
      const d = result.data || {};
      const errCount = (d.errors || []).length;
      const unchanged = d.unchanged ?? 0;
      if ((d.applied ?? 0) === 0 && (d.created ?? 0) === 0 && unchanged > 0) {
        setProsperityMessage(
          `Import finished with no changes: ${unchanged} row(s) already matched your database. Edit Assigned amounts in the sheet (column C), set Budget month to match Month, preview again, then Apply.`
        );
      } else {
        setProsperityMessage(
          `Import complete: ${d.applied ?? 0} applied, ${d.created ?? 0} created, ${unchanged} unchanged${errCount ? `, ${errCount} errors` : ''}.`
        );
      }
      setProsperityPreview(null);
      setProsperityImportFile(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      }
    } catch (error) {
      setProsperityMessage(error?.message || 'Import failed.');
    } finally {
      setIsProsperityImporting(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupMessage('Starting backup export...');

    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to export a backup.');
      return;
    }

    if (backupPassword.length < 8) {
      setBackupMessage('Use at least 8 characters for stronger backup encryption.');
      return;
    }

    if (backupDesktopReady === false || !window.electronAPI?.backupDatabase) {
      setBackupMessage(
        'Backup is only available in the IntentFlow desktop app. Fully quit and reopen IntentFlow, then try again.',
      );
      return;
    }

    setIsBackingUp(true);
    setBackupMessage('Choose where to save your backup file…');

    try {
      const result = await invokeIpcWithTimeout(
        window.electronAPI.backupDatabase(backupPassword),
        180000,
        'Backup export',
      );
      handleBackupResult(result);
      await refreshBackupRuntimeData();
    } catch (error) {
      setBackupMessage(error?.message || 'Backup export failed.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportBackup = async () => {
    setBackupMessage('Starting backup restore...');

    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to restore a backup.');
      return;
    }

    if (backupDesktopReady === false || !window.electronAPI?.restoreDatabase) {
      setBackupMessage(
        'Restore is only available in the IntentFlow desktop app. Fully quit and reopen IntentFlow, then try again.',
      );
      return;
    }

    setIsRestoring(true);
    setBackupMessage('Confirm restore, then choose your backup file…');

    try {
      const result = await invokeIpcWithTimeout(
        window.electronAPI.restoreDatabase(backupPassword, restoreMode),
        180000,
        'Backup restore',
      );
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

  const handleSimulateRestore = async () => {
    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to simulate restore.');
      return;
    }
    setIsSimulating(true);
    setBackupMessage('Running restore simulation... This may take up to a minute.');
    try {
      const result = await invokeIpcWithTimeout(
        window.electronAPI.simulateRestore(backupPassword),
        180000,
        'Restore simulation',
      );
      if (result?.success) {
        setBackupMessage(result.message || 'Simulation complete. No data changed.');
      } else {
        setBackupMessage(result?.error || 'Simulation failed.');
      }
    } catch (error) {
      setBackupMessage(error?.message || 'Simulation failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCompareVersions = async () => {
    if (!compareLeftId || !compareRightId) {
      setBackupMessage('Select two backup versions to compare.');
      return;
    }
    const result = await window.electronAPI.compareBackupVersions(compareLeftId, compareRightId);
    if (result?.success) {
      setCompareResult(result.data);
      setBackupMessage('Comparison complete.');
    } else {
      setBackupMessage(result?.error || 'Comparison failed.');
    }
  };

  const handleQueueBackup = async () => {
    const result = await window.electronAPI.queueBackupOperation('backup', { target: 'local', mode: 'queued' });
    if (result?.success) {
      setBackupMessage('Backup queued.');
      await refreshBackupRuntimeData();
    } else {
      setBackupMessage(result?.error || 'Failed to queue backup.');
    }
  };

  const handleProcessQueue = async () => {
    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to process backup queue.');
      return;
    }
    const result = await window.electronAPI.processBackupQueue(backupPassword);
    if (result?.success) {
      setBackupMessage('Queue processing finished.');
      setBackupQueue(result.operations || []);
    } else {
      setBackupMessage(result?.error || 'Failed to process queue.');
    }
  };

  const handleRewindToVersion = async (versionId) => {
    if (!backupPassword.trim()) {
      setBackupMessage('Password is required to rewind to a version.');
      return;
    }
    setBackupMessage('Starting rewind restore...');
    const result = await invokeIpcWithTimeout(
      window.electronAPI.rewindBackupVersion(backupPassword, versionId),
      180000,
      'Backup rewind',
    );
    if (result?.success) {
      setBackupMessage(result.message || 'Rewind started.');
    } else if (result?.canceled) {
      setBackupMessage('Restore canceled.');
    } else {
      setBackupMessage(result?.error || 'Rewind failed.');
    }
  };

  const handleGenerateRecoveryKit = async () => {
    const result = await window.electronAPI.generateRecoveryKit();
    if (result?.success) {
      setRecoveryKitStatus({ exists: true, kit: result.kit });
      setBackupMessage('Recovery kit generated successfully.');
    } else {
      setBackupMessage(result?.error || 'Failed to generate recovery kit.');
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
              {backupDesktopReady === false && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Backup controls require the IntentFlow desktop app. If you are already in the app, fully quit and reopen it, then return here.
                </div>
              )}
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
                      disabled={isBackupBusy}
                    />
                    <p className="mt-2 text-sm text-slate-400">Your backup file is encrypted locally before it is saved.</p>
                  </div>
                  <div>
                    <label htmlFor="restore-mode" className="block text-sm font-semibold text-slate-200">Restore mode</label>
                    <select
                      id="restore-mode"
                      value={restoreMode}
                      onChange={(event) => setRestoreMode(event.target.value)}
                      className="mt-3 w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      disabled={isBackupBusy}
                    >
                      <option value="in-place">In-place (replace active data)</option>
                      <option value="side-by-side">Side-by-side (safe validation copy)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button onClick={() => void handleExportBackup()} disabled={isBackupBusy}>
                      {isBackingUp ? 'Exporting...' : 'Export Backup'}
                    </Button>
                    <Button variant="secondary" onClick={() => void handleImportBackup()} disabled={isBackupBusy}>
                      {isRestoring ? 'Restoring...' : 'Import Backup'}
                    </Button>
                    <Button variant="secondary" onClick={() => void handleSimulateRestore()} disabled={isBackupBusy}>
                      {isSimulating ? 'Simulating...' : 'Simulate Restore'}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button variant="secondary" onClick={() => void handleQueueBackup()} disabled={isBackupBusy}>Queue Backup</Button>
                    <Button variant="secondary" onClick={() => void handleProcessQueue()} disabled={isBackupBusy}>Process Queue</Button>
                    <Button variant="secondary" onClick={() => void handleGenerateRecoveryKit()} disabled={isBackupBusy}>Generate Recovery Kit</Button>
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

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-base font-semibold text-white">Backup Versions</h3>
                  <p className="mt-2 text-sm text-slate-400">Compare or rewind from existing versions.</p>
                  <div className="mt-4 space-y-3">
                    <select
                      value={compareLeftId}
                      onChange={(event) => setCompareLeftId(event.target.value)}
                      className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Select first version</option>
                      {backupHistory.map((version) => (
                        <option key={`left-${version.id}`} value={version.id}>
                          {new Date(version.createdAt).toLocaleString()} · {version.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={compareRightId}
                      onChange={(event) => setCompareRightId(event.target.value)}
                      className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Select second version</option>
                      {backupHistory.map((version) => (
                        <option key={`right-${version.id}`} value={version.id}>
                          {new Date(version.createdAt).toLocaleString()} · {version.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3">
                      <Button variant="secondary" onClick={handleCompareVersions} disabled={isBackupBusy}>Compare</Button>
                    </div>
                    {compareResult?.diff && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
                        <p>Created at changed: {String(compareResult.diff.createdAtChanged)}</p>
                        <p>Target changed: {String(compareResult.diff.targetChanged)}</p>
                        <p>Size changed: {String(compareResult.diff.sizeChanged)}</p>
                        <p>Digest changed: {String(compareResult.diff.digestChanged)}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-base font-semibold text-white">Queue + Recovery Kit</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>Pending queue operations: {backupQueue.filter((op) => op.status !== 'completed').length}</p>
                    <p>Recovery kit: {recoveryKitStatus.exists ? 'Available' : 'Missing'}</p>
                    {recoveryKitStatus.kit?.createdAt && (
                      <p>Recovery kit updated: {new Date(recoveryKitStatus.kit.createdAt).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="mt-4 max-h-56 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                    {backupHistory.length === 0 && (
                      <p className="text-sm text-slate-400">No backup versions yet.</p>
                    )}
                    {backupHistory.map((version) => (
                      <div key={version.id} className="mb-3 rounded-xl border border-slate-800 p-3 text-sm text-slate-300">
                        <p className="text-slate-200">{new Date(version.createdAt).toLocaleString()}</p>
                        <p className="truncate text-xs text-slate-500">{version.id}</p>
                        <Button variant="secondary" onClick={() => handleRewindToVersion(version.id)} disabled={isBackupBusy}>
                          Rewind To This Version
                        </Button>
                      </div>
                    ))}
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
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <h3 className="text-sm font-semibold text-white">Data deletion and Plaid access</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                  <li>Disconnect a bank in Linked Banks to revoke Plaid access for that institution.</li>
                  <li>Use each account&apos;s delete action to remove local account data from IntentFlow.</li>
                  <li>Use encrypted backups if you want an export before deleting local data.</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/?view=linked-banks')}
                    disabled={!plaidStatus.enabled}
                  >
                    Disconnect or revoke bank access
                  </Button>
                  <Button variant="secondary" onClick={() => router.push('/accounts')}>
                    Manage account deletion
                  </Button>
                  <Button variant="secondary" onClick={() => router.push('/privacy')}>
                    Privacy Policy
                  </Button>
                  <Button variant="secondary" onClick={() => router.push('/terms')}>
                    Terms of Service
                  </Button>
                </div>
              </div>
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
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Prosperity Map import &amp; export</h3>
                <p className="text-sm text-slate-400">
                  Export or import budget table data using the same columns as the Prosperity Map: Group, Category,
                  Assigned, Activity, Available, Progress, Goal Target, and Goal Type.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-5 rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <div>
                    <label htmlFor="prosperity-month" className="block text-sm font-semibold text-slate-200">
                      Budget month
                    </label>
                    <input
                      id="prosperity-month"
                      type="month"
                      value={prosperityMonthInputValue}
                      onChange={handleProsperityMonthChange}
                      className="mt-3 w-full max-w-xs rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      disabled={isBusy}
                    />
                    <p className="mt-2 text-sm text-slate-500">
                      Assigned amounts apply to this month. Activity and Available are included on export; import
                      updates Assigned and goal fields only.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-200">Export</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button onClick={() => handleExportProsperityTable('csv')} disabled={isBusy}>
                        {isProsperityExporting ? 'Working...' : 'Export CSV'}
                      </Button>
                      <Button variant="secondary" onClick={() => handleExportProsperityTable('json')} disabled={isBusy}>
                        Export JSON
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-200">Import</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={handlePickProsperityImport} disabled={isBusy}>
                        {isProsperityImporting ? 'Working...' : 'Choose file & preview'}
                      </Button>
                      <Button
                        onClick={handleApplyProsperityImport}
                        disabled={isBusy || !prosperityPreview?.items?.length}
                      >
                        Apply import
                      </Button>
                    </div>
                    {prosperityImportFile?.fileName && (
                      <p className="mt-2 text-sm text-slate-500">File: {prosperityImportFile.fileName}</p>
                    )}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm font-semibold text-slate-200">Import options</p>
                    <label className="flex items-center gap-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={prosperityCreateMissing}
                        onChange={(e) => setProsperityCreateMissing(e.target.checked)}
                        disabled={isBusy}
                        className="rounded border-slate-600"
                      />
                      Create missing groups and categories
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={prosperityUpdateAssigned}
                        onChange={(e) => setProsperityUpdateAssigned(e.target.checked)}
                        disabled={isBusy}
                        className="rounded border-slate-600"
                      />
                      Update Assigned amounts
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={prosperityUpdateGoals}
                        onChange={(e) => setProsperityUpdateGoals(e.target.checked)}
                        disabled={isBusy}
                        className="rounded border-slate-600"
                      />
                      Update Goal Target and Goal Type
                    </label>
                  </div>

                  {prosperityPreview?.items?.length > 0 && (
                    <div className="max-h-64 overflow-auto rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-sm font-semibold text-slate-200">Preview</p>
                      <ul className="mt-3 space-y-2 text-xs text-slate-400">
                        {prosperityPreview.items.slice(0, 12).map((item, idx) => (
                          <li key={`${item.normalized?.category}-${idx}`}>
                            <span className="text-slate-300">{item.normalized?.category || '—'}</span>
                            {' · '}
                            {item.status}
                            {item.changes?.length ? ` (${item.changes.join(', ')})` : ''}
                          </li>
                        ))}
                        {prosperityPreview.items.length > 12 && (
                          <li>…and {prosperityPreview.items.length - 12} more rows</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Reference budget</p>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">Monthly budget (local)</span>
                      <span className="text-lg font-semibold text-white">
                        {currency} {budget.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: Math.min(100, (budget / 5000) * 100) + '%' }}
                      />
                    </div>
                  </div>
                  <div className="rounded-3xl bg-slate-900/70 p-4">
                    <p className="text-sm text-slate-400">
                      CSV columns match the Prosperity Map table. Re-importing updates existing categories by group and
                      name.
                    </p>
                    {prosperityMessage && <p className="mt-3 text-sm text-slate-200">{prosperityMessage}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
              <div className="grid gap-6">
                {groups.map((group) => (
                  <section key={group.id} className="space-y-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
                    <div
                      className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                      style={{ backgroundColor: '#FFF8E7', color: '#0c2340' }}
                    >
                      <div className="space-y-2">
                        <label className="text-sm font-semibold" style={{ color: '#0c2340' }}>
                          Group name
                        </label>
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

                    <div className="space-y-4 p-5">
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
