const fs = require('fs');
const path = require('path');

const MIN_SQLITE_DB_BYTES = 100;
const SQLITE_FILE_HEADER = 'SQLite format 3';

class RestoreValidator {
  validatePreflight({ backupFilePath, dbPath }) {
    if (!backupFilePath || !fs.existsSync(backupFilePath)) {
      return { ok: false, reason: 'Backup file not found' };
    }
    const backupStats = fs.statSync(backupFilePath);
    if (!backupStats.size) {
      return {
        ok: false,
        reason:
          'Backup file is empty. Export a new backup to a disk with free space, then try again.',
      };
    }
    const dbDir = dbPath ? path.dirname(dbPath) : null;
    if (dbDir && !fs.existsSync(dbDir)) {
      return { ok: false, reason: 'Database directory does not exist' };
    }
    return { ok: true, fileSizeBytes: backupStats.size };
  }

  validateBackupContainer(container) {
    if (!container || typeof container !== 'object') {
      return { ok: false, reason: 'Invalid backup file format' };
    }
    if (
      typeof container.encryptedPayload !== 'string' ||
      container.encryptedPayload.trim().length === 0
    ) {
      return {
        ok: false,
        reason:
          'Backup file has an empty encrypted payload (no database data). This file cannot be restored. Export a new backup to a disk with free space, then try again.',
      };
    }
    return { ok: true };
  }

  validatePostRestore({ restoredDbPath }) {
    if (!restoredDbPath || !fs.existsSync(restoredDbPath)) {
      return { ok: false, reason: 'Restored database does not exist' };
    }
    const stats = fs.statSync(restoredDbPath);
    if (stats.size <= 0) {
      return { ok: false, reason: 'Restored database is empty' };
    }
    if (stats.size < MIN_SQLITE_DB_BYTES) {
      return { ok: false, reason: 'Restored database is too small to be valid SQLite data' };
    }
    const header = fs.readFileSync(restoredDbPath, { start: 0, end: 15 }).toString('utf8');
    if (!header.startsWith(SQLITE_FILE_HEADER)) {
      return { ok: false, reason: 'Restored database does not contain a valid SQLite header' };
    }
    return { ok: true, fileSizeBytes: stats.size };
  }
}

module.exports = RestoreValidator;
