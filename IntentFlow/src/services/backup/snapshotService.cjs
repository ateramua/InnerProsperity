const fs = require('fs');
const crypto = require('crypto');

class SnapshotService {
  calculateFileDigest(filePath) {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  createSnapshotMetadata({ dbPath, sourceDeviceId, appVersion }) {
    const stats = fs.statSync(dbPath);
    return {
      snapshotId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      schemaVersion: '1',
      appVersion: appVersion || 'unknown',
      sourceDeviceId: sourceDeviceId || 'desktop',
      fileSizeBytes: stats.size,
      digestSha256: this.calculateFileDigest(dbPath)
    };
  }
}

module.exports = SnapshotService;
