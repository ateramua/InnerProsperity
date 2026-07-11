const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QueueService = require('./queueService.cjs');
const SnapshotService = require('./snapshotService.cjs');
const RestoreValidator = require('./restoreValidator.cjs');

class BackupEngine {
  constructor({
    runtimeDirectory,
    fileEncryption,
    getDatabasePath,
    getAppVersion,
    createDbSnapshot,
    restoreFromEncrypted
  }) {
    this.runtimeDirectory = runtimeDirectory;
    this.fileEncryption = fileEncryption;
    this.getDatabasePath = getDatabasePath;
    this.getAppVersion = getAppVersion;
    this.createDbSnapshot = createDbSnapshot;
    this.restoreFromEncrypted = restoreFromEncrypted;

    this.historyFilePath = path.join(runtimeDirectory, 'history.json');
    this.queueService = new QueueService(path.join(runtimeDirectory, 'queue.json'));
    this.snapshotService = new SnapshotService();
    this.restoreValidator = new RestoreValidator();
  }

  ensureRuntimeDirectory() {
    if (!fs.existsSync(this.runtimeDirectory)) {
      fs.mkdirSync(this.runtimeDirectory, { recursive: true });
    }
    if (!fs.existsSync(this.historyFilePath)) {
      fs.writeFileSync(this.historyFilePath, JSON.stringify({ versions: [] }, null, 2), 'utf8');
    }
  }

  readHistory() {
    this.ensureRuntimeDirectory();
    try {
      const data = JSON.parse(fs.readFileSync(this.historyFilePath, 'utf8'));
      if (!data || !Array.isArray(data.versions)) {
        return { versions: [] };
      }
      return data;
    } catch (error) {
      return { versions: [] };
    }
  }

  writeHistory(payload) {
    this.ensureRuntimeDirectory();
    fs.writeFileSync(this.historyFilePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  listVersions() {
    return this.readHistory().versions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  appendVersion(version) {
    const history = this.readHistory();
    history.versions.push(version);
    this.writeHistory(history);
  }

  async backup({ password, options = {} }) {
    const dbPath = this.getDatabasePath();
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'No database found to backup' };
    }
    const sourceStats = fs.statSync(dbPath);
    if (sourceStats.size <= 0) {
      return { success: false, error: 'Database is empty and cannot be backed up' };
    }

    let snapshotPath;
    try {
      snapshotPath = await this.createDbSnapshot();
    } catch (error) {
      console.error('❌ Database snapshot failed:', error);
      return { success: false, error: error.message || 'Database snapshot failed' };
    }

    try {
      const snapshotStats = fs.statSync(snapshotPath);
      if (snapshotStats.size <= 0) {
        return {
          success: false,
          error:
            'Database snapshot is empty. Export was aborted before writing a backup file.',
        };
      }

      const metadata = this.snapshotService.createSnapshotMetadata({
        dbPath: snapshotPath,
        sourceDeviceId: options.sourceDeviceId || 'desktop',
        appVersion: this.getAppVersion()
      });

      const result = await this.fileEncryption.backupDatabase(
        password,
        snapshotPath,
        null,
        {
          mode: options.mode,
          target: options.target,
          sourceDeviceId: options.sourceDeviceId,
        }
      );
      if (!result.success) {
        return result;
      }

      try {
        const container = this.fileEncryption.readBackupContainer(result.filePath);
        const containerCheck = this.restoreValidator.validateBackupContainer(container);
        if (!containerCheck.ok) {
          try {
            fs.unlinkSync(result.filePath);
          } catch (_) {}
          return { success: false, error: containerCheck.reason };
        }
      } catch (verifyError) {
        try {
          if (result.filePath && fs.existsSync(result.filePath)) {
            fs.unlinkSync(result.filePath);
          }
        } catch (_) {}
        return { success: false, error: verifyError.message || 'Backup verification failed' };
      }

      const version = {
        id: crypto.randomUUID(),
        type: 'full',
        mode: options.mode || 'manual',
        target: options.target || 'local',
        createdAt: new Date().toISOString(),
        backupFilePath: result.filePath,
        snapshot: metadata
      };
      this.appendVersion(version);
      return {
        success: true,
        message: result.message || 'Backup completed',
        version
      };
    } finally {
      if (snapshotPath && fs.existsSync(snapshotPath)) {
        try { fs.unlinkSync(snapshotPath); } catch (_) {}
      }
    }
  }

  async simulateRestore({ password, backupFilePath }) {
    const dbPath = this.getDatabasePath();
    const preflight = this.restoreValidator.validatePreflight({ backupFilePath, dbPath });
    if (!preflight.ok) {
      return { success: false, error: preflight.reason };
    }

    const tmpPath = path.join(this.runtimeDirectory, `simulate-${Date.now()}.db`);
    const result = await this.fileEncryption.decryptFile(backupFilePath, password, tmpPath);
    if (!result.success) {
      return result;
    }

    const post = this.restoreValidator.validatePostRestore({ restoredDbPath: tmpPath });
    try { fs.unlinkSync(tmpPath); } catch (_) {}

    if (!post.ok) {
      return { success: false, error: post.reason };
    }

    return {
      success: true,
      message: 'Simulation completed. No data changed.',
      details: {
        backupFilePath,
        estimatedRestoredSizeBytes: post.fileSizeBytes
      }
    };
  }

  compareVersions(firstVersionId, secondVersionId) {
    const versions = this.listVersions();
    const left = versions.find((item) => item.id === firstVersionId);
    const right = versions.find((item) => item.id === secondVersionId);
    if (!left || !right) {
      return { success: false, error: 'Could not find one or both versions to compare' };
    }

    const diff = {
      createdAtChanged: left.createdAt !== right.createdAt,
      targetChanged: left.target !== right.target,
      sizeChanged: left.snapshot?.fileSizeBytes !== right.snapshot?.fileSizeBytes,
      digestChanged: left.snapshot?.digestSha256 !== right.snapshot?.digestSha256
    };

    return {
      success: true,
      message: 'Comparison completed',
      data: {
        left,
        right,
        diff
      }
    };
  }

  enqueueOperation(type, payload = {}) {
    const queued = this.queueService.enqueue({ type, payload, maxRetries: payload.maxRetries });
    return { success: true, operation: queued };
  }

  listQueue() {
    return { success: true, operations: this.queueService.list() };
  }

  async processQueue(executor) {
    const operations = this.queueService.list();
    for (const op of operations) {
      if (op.status === 'completed' || op.status === 'cancelled') continue;
      const nextAttemptMs = new Date(op.nextAttemptAt || 0).getTime();
      if (nextAttemptMs > Date.now()) continue;

      this.queueService.update(op.id, { status: 'running', lastError: null });
      try {
        await executor(op);
        this.queueService.update(op.id, { status: 'completed' });
      } catch (error) {
        const retries = Number(op.retries || 0) + 1;
        const retryable = retries <= Number(op.maxRetries || 5);
        const delayMs = Math.min(60000, Math.pow(2, retries) * 1000 + Math.floor(Math.random() * 400));
        this.queueService.update(op.id, {
          status: retryable ? 'queued' : 'failed',
          retries,
          lastError: error.message,
          nextAttemptAt: new Date(Date.now() + delayMs).toISOString()
        });
      }
    }
    return this.listQueue();
  }

  async restore({ password, backupFilePath, mode = 'in-place' }) {
    const dbPath = this.getDatabasePath();
    const preflight = this.restoreValidator.validatePreflight({ backupFilePath, dbPath });
    if (!preflight.ok) {
      return { success: false, error: preflight.reason };
    }
    if (mode !== 'in-place' && mode !== 'side-by-side') {
      return { success: false, error: 'Unsupported restore mode' };
    }
    try {
      const container = this.fileEncryption.readBackupContainer(backupFilePath);
      const containerCheck = this.restoreValidator.validateBackupContainer(container);
      if (!containerCheck.ok) {
        return { success: false, error: containerCheck.reason };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Invalid backup file' };
    }
    return this.restoreFromEncrypted({ password, backupFilePath, mode });
  }

  async rewind({ password, versionId }) {
    const version = this.listVersions().find((item) => item.id === versionId);
    if (!version) {
      return { success: false, error: 'Backup version not found for rewind' };
    }
    return this.restore({
      password,
      backupFilePath: version.backupFilePath,
      mode: 'in-place'
    });
  }
}

module.exports = BackupEngine;
