const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');
const BackupEngine = require('../../services/backup/backupEngine.cjs');

function ensureRuntimeDir() {
  const dir = path.join(app.getPath('userData'), 'backup-runtime');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSenderWindow(event) {
  if (!event?.sender || event.sender.isDestroyed()) {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  }
  return BrowserWindow.fromWebContents(event.sender);
}

function focusWindow(win) {
  if (!win || win.isDestroyed()) {
    return null;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
  return win;
}

async function confirmRestore(parentWindow) {
  const parent = focusWindow(parentWindow);
  const options = {
    type: 'warning',
    buttons: ['Cancel', 'Continue Restore'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Restore Backup',
    message: 'Replace all current IntentFlow data with this backup?',
    detail: 'A rollback snapshot of your current database will be created automatically.',
  };

  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);

  return result.response === 1;
}

function registerBackupIpcHandlers(ipcMain, deps) {
  const runtimeDir = ensureRuntimeDir();
  const recoveryKitPath = path.join(runtimeDir, 'recovery-kit.json');

  const engine = new BackupEngine({
    runtimeDirectory: runtimeDir,
    fileEncryption: deps.fileEncryption,
    getDatabasePath: deps.getDatabasePath,
    getAppVersion: () => app.getVersion(),
    createDbSnapshot: deps.createDbSnapshot,
    restoreFromEncrypted: deps.restoreFromEncrypted,
  });

  ipcMain.handle('backup-get-status', async () => {
    return {
      success: true,
      data: {
        fileEncryptionAvailable: Boolean(deps.fileEncryption),
        historyCount: engine.listVersions().length,
      },
    };
  });

  ipcMain.handle('backup-database', async (event, password, options = {}) => {
    try {
      if (!deps.fileEncryption) {
        return { success: false, error: 'Backup service is unavailable' };
      }
      const parentWindow = getSenderWindow(event);
      focusWindow(parentWindow);
      return await engine.backup({
        password,
        options: {
          ...options,
          parentWindow,
        },
      });
    } catch (error) {
      console.error('backup-database error:', error);
      return { success: false, error: error.message || 'Backup export failed' };
    }
  });

  ipcMain.handle('restore-database', async (event, password, mode = 'in-place') => {
    if (!deps.fileEncryption) {
      return { success: false, error: 'Backup service is unavailable' };
    }

    const parentWindow = getSenderWindow(event);
    focusWindow(parentWindow);

    const confirmed = await confirmRestore(parentWindow);
    if (!confirmed) {
      return { success: false, canceled: true, message: 'Restore canceled.' };
    }

    const selected = await deps.fileEncryption.openEncryptedBackupDialog(parentWindow);
    if (!selected.success) return selected;

    return engine.restore({
      password,
      backupFilePath: selected.filePath,
      mode,
    });
  });

  ipcMain.handle('backup-get-history', async () => {
    return { success: true, versions: engine.listVersions() };
  });

  ipcMain.handle('backup-compare-versions', async (_event, firstVersionId, secondVersionId) => {
    return engine.compareVersions(firstVersionId, secondVersionId);
  });

  ipcMain.handle('backup-simulate-restore', async (event, password, backupVersionId = null) => {
    if (!deps.fileEncryption) {
      return { success: false, error: 'Backup service is unavailable' };
    }

    const parentWindow = getSenderWindow(event);
    focusWindow(parentWindow);

    if (backupVersionId) {
      const version = engine.listVersions().find((item) => item.id === backupVersionId);
      if (!version) return { success: false, error: 'Backup version not found' };
      return engine.simulateRestore({ password, backupFilePath: version.backupFilePath });
    }

    const selected = await deps.fileEncryption.openEncryptedBackupDialog(parentWindow);
    if (!selected.success) return selected;
    return engine.simulateRestore({ password, backupFilePath: selected.filePath });
  });

  ipcMain.handle('backup-queue-operation', async (_event, type, payload = {}) => {
    return engine.enqueueOperation(type, payload);
  });

  ipcMain.handle('backup-get-queue', async () => {
    return engine.listQueue();
  });

  ipcMain.handle('backup-process-queue', async (event, password) => {
    const parentWindow = getSenderWindow(event);
    focusWindow(parentWindow);
    return engine.processQueue(async (op) => {
      if (op.type === 'backup') {
        const result = await engine.backup({
          password,
          options: { ...(op.payload || {}), parentWindow },
        });
        if (!result.success) throw new Error(result.error || 'Backup operation failed');
        return;
      }
      if (op.type === 'restore') {
        const result = await engine.restore({
          password,
          backupFilePath: op.payload.backupFilePath,
          mode: op.payload.mode || 'in-place',
        });
        if (!result.success) throw new Error(result.error || 'Restore operation failed');
        return;
      }
      throw new Error(`Unsupported queue operation type: ${op.type}`);
    });
  });

  ipcMain.handle('backup-rewind-version', async (event, password, versionId) => {
    const parentWindow = getSenderWindow(event);
    focusWindow(parentWindow);

    const confirmed = await confirmRestore(parentWindow);
    if (!confirmed) {
      return { success: false, canceled: true, message: 'Restore canceled.' };
    }

    return engine.rewind({ password, versionId });
  });

  ipcMain.handle('backup-generate-recovery-kit', async () => {
    const versions = engine.listVersions();
    const latest = versions[0] || null;
    const kit = {
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      latestVersionId: latest ? latest.id : null,
      latestVersionDigest: latest?.snapshot?.digestSha256 || null,
      guidance: [
        'Store this recovery kit securely and separately from backup files.',
        'You need your backup password to decrypt backup archives.',
        'Run simulation before in-place restore.',
      ],
    };
    fs.writeFileSync(recoveryKitPath, JSON.stringify(kit, null, 2), 'utf8');
    return { success: true, kit };
  });

  ipcMain.handle('backup-get-recovery-kit-status', async () => {
    const exists = fs.existsSync(recoveryKitPath);
    if (!exists) return { success: true, exists: false, kit: null };
    try {
      const kit = JSON.parse(fs.readFileSync(recoveryKitPath, 'utf8'));
      return { success: true, exists: true, kit };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerBackupIpcHandlers };
