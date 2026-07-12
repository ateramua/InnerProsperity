#!/usr/bin/env node
'use strict';

/**
 * Verifies BackupEngine export → import round-trip (same path as Settings → Backup).
 * Run: npm run test:backup:engine
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'src/db/data/app.db');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function mockElectron(workDir) {
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(request) {
    if (request === 'electron') {
      return {
        app: {
          getVersion: () => 'test-backup-engine',
          getPath: () => workDir,
        },
        dialog: {},
      };
    }
    return originalRequire.apply(this, arguments);
  };
}

async function createSnapshot(dbPath, snapshotPath) {
  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
  }

  await new Promise((resolve, reject) => {
    const source = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      const backup = source.backup(snapshotPath);
      backup.step(-1, (stepErr) => {
        if (stepErr) {
          source.close(() => reject(stepErr));
          return;
        }
        if (backup.failed) {
          source.close(() => reject(new Error('sqlite backup failed')));
          return;
        }
        backup.finish((finishErr) => {
          source.close(() => {
            if (finishErr) reject(finishErr);
            else resolve();
          });
        });
      });
    });
  });

  return snapshotPath;
}

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    fail(`Source database not found at ${SOURCE_DB}`);
  }

  const sourceSize = fs.statSync(SOURCE_DB).size;
  assert(sourceSize > 0, 'Source database must not be empty');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intentflow-backup-engine-'));
  const runtimeDir = path.join(workDir, 'backup-runtime');
  const liveDbPath = path.join(workDir, 'money-manager.db');
  const encPath = path.join(workDir, 'export.enc');
  const restoredDbPath = path.join(workDir, 'restored.db');
  const password = `engine-test-${crypto.randomBytes(8).toString('hex')}`;

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(SOURCE_DB, liveDbPath);

  mockElectron(workDir);

  const BackupEngine = require(path.join(ROOT, 'src/services/backup/backupEngine.cjs'));
  const fileEncryption = require(path.join(ROOT, 'src/services/fileEncryption.cjs'));
  const RestoreValidator = require(path.join(ROOT, 'src/services/backup/restoreValidator.cjs'));
  const validator = new RestoreValidator();

  const engine = new BackupEngine({
    runtimeDirectory: runtimeDir,
    fileEncryption,
    getDatabasePath: () => liveDbPath,
    getAppVersion: () => 'test-backup-engine',
    createDbSnapshot: async () => {
      const snapshotPath = path.join(workDir, `snapshot-${Date.now()}.db`);
      return createSnapshot(liveDbPath, snapshotPath);
    },
    restoreFromEncrypted: async ({ password: restorePassword, backupFilePath, mode = 'side-by-side' }) => {
      const destinationPath =
        mode === 'side-by-side'
          ? restoredDbPath
          : liveDbPath;
      return fileEncryption.decryptFile(backupFilePath, restorePassword, destinationPath);
    },
  });

  try {
    const exportResult = await engine.backup({
      password,
      options: { backupFilePath: encPath },
    });
    assert(exportResult.success, exportResult.error || 'BackupEngine export failed');
    assert(fs.existsSync(encPath), 'Export file was not created');

    const encStats = fs.statSync(encPath);
    assert(encStats.size > 0, 'Export file must not be empty');

    const rawHead = fs.readFileSync(encPath).subarray(0, 1).toString('utf8');
    assert(rawHead === '{', `Export file must be JSON text, got first char "${rawHead}"`);

    const container = fileEncryption.readBackupContainer(encPath);
    const containerCheck = validator.validateBackupContainer(container);
    assert(containerCheck.ok, containerCheck.reason || 'Container validation failed');
    assert(container.encryptedPayload.length > 0, 'encryptedPayload must not be empty');
    assert(
      container.encryptionMetadata.iterations === 600000,
      `Expected canonical PBKDF2 iterations (600000), got ${container.encryptionMetadata.iterations}`
    );
    assert(
      exportResult.version?.snapshot?.fileSizeBytes > 0,
      'Backup version metadata must record non-zero snapshot size'
    );

    const simulateResult = await engine.simulateRestore({ password, backupFilePath: encPath });
    assert(simulateResult.success, simulateResult.error || 'Simulate restore failed');

    const importResult = await engine.restore({
      password,
      backupFilePath: encPath,
      mode: 'side-by-side',
    });
    assert(importResult.success, importResult.error || 'BackupEngine import failed');

    const restoredSize = fs.statSync(restoredDbPath).size;
    assert(restoredSize > 0, 'Restored database must not be empty');
    assert(
      restoredSize === exportResult.version.snapshot.fileSizeBytes,
      `Restored size mismatch (${restoredSize} vs snapshot ${exportResult.version.snapshot.fileSizeBytes})`
    );

    const postRestore = validator.validatePostRestore({ restoredDbPath: restoredDbPath });
    assert(postRestore.ok, postRestore.reason || 'Post-restore validation failed');

    const versions = engine.listVersions();
    assert(versions.length === 1, 'Backup history should contain one version');
    assert(versions[0].backupFilePath === encPath, 'Backup history should reference export file');

    let sqliteMisreadError = null;
    try {
      fileEncryption.readBackupContainer(liveDbPath);
    } catch (error) {
      sqliteMisreadError = error.message;
    }
    assert(
      sqliteMisreadError && sqliteMisreadError.includes('SQLite database'),
      'Import should reject raw SQLite files with a clear message'
    );

    console.log('PASS: BackupEngine export/import round-trip verified');
    console.log(`  source db:  ${sourceSize} bytes`);
    console.log(`  export enc: ${encStats.size} bytes (JSON container)`);
    console.log(`  restored:   ${restoredSize} bytes`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('FAIL:', error);
  process.exit(1);
});
