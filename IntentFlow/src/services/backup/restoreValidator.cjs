const fs = require('fs');

class RestoreValidator {
  validatePreflight({ backupFilePath, dbPath }) {
    if (!backupFilePath || !fs.existsSync(backupFilePath)) {
      return { ok: false, reason: 'Backup file not found' };
    }
    const dbDir = dbPath ? require('path').dirname(dbPath) : null;
    if (dbDir && !fs.existsSync(dbDir)) {
      return { ok: false, reason: 'Database directory does not exist' };
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
    return { ok: true, fileSizeBytes: stats.size };
  }
}

module.exports = RestoreValidator;
