const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const BackupEngine = require('../../services/backup/backupEngine.cjs');

function ensureRuntimeDir() {
  const dir = path.join(app.getPath('userData'), 'backup-runtime');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
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
    restoreFromEncrypted: deps.restoreFromEncrypted
  });

  ipcMain.handle('backup-database', async (_event, password, options = {}) => {
    try {
      if (!deps.fileEncryption) {
        return { success: false, error: 'Backup service is unavailable' };
      }
      return await engine.backup({ password, options });
    } catch (error) {
      console.error('backup-database error:', error);
      return { success: false, error: error.message || 'Backup export failed' };
    }
  });

  ipcMain.handle('restore-database', async (_event, password, mode = 'in-place') => {
    if (!deps.fileEncryption) {
      return { success: false, error: 'Backup service is unavailable' };
    }
    const selected = await deps.fileEncryption.openEncryptedBackupDialog();
    if (!selected.success) return selected;
    return engine.restore({
      password,
      backupFilePath: selected.filePath,
      mode
    });
  });

  ipcMain.handle('backup-get-history', async () => {
    return { success: true, versions: engine.listVersions() };
  });

  ipcMain.handle('backup-compare-versions', async (_event, firstVersionId, secondVersionId) => {
    return engine.compareVersions(firstVersionId, secondVersionId);
  });

  ipcMain.handle('backup-simulate-restore', async (_event, password, backupVersionId = null) => {
    if (!deps.fileEncryption) {
      return { success: false, error: 'Backup service is unavailable' };
    }

    if (backupVersionId) {
      const version = engine.listVersions().find((item) => item.id === backupVersionId);
      if (!version) return { success: false, error: 'Backup version not found' };
      return engine.simulateRestore({ password, backupFilePath: version.backupFilePath });
    }

    const selected = await deps.fileEncryption.openEncryptedBackupDialog();
    if (!selected.success) return selected;
    return engine.simulateRestore({ password, backupFilePath: selected.filePath });
  });

  ipcMain.handle('backup-queue-operation', async (_event, type, payload = {}) => {
    return engine.enqueueOperation(type, payload);
  });

  ipcMain.handle('backup-get-queue', async () => {
    return engine.listQueue();
  });

  ipcMain.handle('backup-process-queue', async (_event, password) => {
    return engine.processQueue(async (op) => {
      if (op.type === 'backup') {
        const result = await engine.backup({ password, options: op.payload || {} });
        if (!result.success) throw new Error(result.error || 'Backup operation failed');
        return;
      }
      if (op.type === 'restore') {
        const result = await engine.restore({
          password,
          backupFilePath: op.payload.backupFilePath,
          mode: op.payload.mode || 'in-place'
        });
        if (!result.success) throw new Error(result.error || 'Restore operation failed');
        return;
      }
      throw new Error(`Unsupported queue operation type: ${op.type}`);
    });
  });

  ipcMain.handle('backup-rewind-version', async (_event, password, versionId) => {
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
        'Run simulation before in-place restore.'
      ]
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
