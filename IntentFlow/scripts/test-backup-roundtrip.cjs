#!/usr/bin/env node
'use strict';

/**
 * Verifies encrypted backup export → import round-trip without Electron UI dialogs.
 * Run: npm run test:backup
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

function mockElectron() {
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(request) {
    if (request === 'electron') {
      return {
        app: {
          getVersion: () => 'test-backup-roundtrip',
          getPath: () => os.tmpdir(),
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
}

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    fail(`Source database not found at ${SOURCE_DB}`);
  }

  const sourceSize = fs.statSync(SOURCE_DB).size;
  assert(sourceSize > 0, 'Source database must not be empty');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intentflow-backup-test-'));
  const snapshotPath = path.join(workDir, 'snapshot.db');
  const encPath = path.join(workDir, 'backup.enc');
  const restoredPath = path.join(workDir, 'restored.db');
  const password = `test-backup-${crypto.randomBytes(8).toString('hex')}`;

  try {
    await createSnapshot(SOURCE_DB, snapshotPath);
    const snapshotSize = fs.statSync(snapshotPath).size;
    assert(snapshotSize > 0, 'Snapshot must not be empty');
    assert(snapshotSize === sourceSize, `Snapshot size mismatch (${snapshotSize} vs ${sourceSize})`);

    mockElectron();
    const fileEncryption = require(path.join(ROOT, 'src/services/fileEncryption.cjs'));
    const RestoreValidator = require(path.join(ROOT, 'src/services/backup/restoreValidator.cjs'));
    const validator = new RestoreValidator();

    const exportResult = await fileEncryption.encryptFile(snapshotPath, password, encPath);
    assert(exportResult.success, exportResult.error || 'Export failed');
    assert(fs.statSync(encPath).size > 0, 'Backup file must not be empty');

    const container = fileEncryption.readBackupContainer(encPath);
    const containerCheck = validator.validateBackupContainer(container);
    assert(containerCheck.ok, containerCheck.reason || 'Container validation failed');
    assert(container.encryptedPayload.length > 0, 'encryptedPayload must not be empty');

    const importResult = await fileEncryption.decryptFile(encPath, password, restoredPath);
    assert(importResult.success, importResult.error || 'Import failed');

    const restoredSize = fs.statSync(restoredPath).size;
    assert(restoredSize > 0, 'Restored database must not be empty');
    assert(restoredSize === sourceSize, `Restored size mismatch (${restoredSize} vs ${sourceSize})`);

    const postRestore = validator.validatePostRestore({ restoredDbPath: restoredPath });
    assert(postRestore.ok, postRestore.reason || 'Post-restore validation failed');

    const snapshotDigest = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
    const restoredDigest = crypto.createHash('sha256').update(fs.readFileSync(restoredPath)).digest('hex');
    assert(snapshotDigest === restoredDigest, 'Restored database content must match encrypted snapshot');

    console.log('PASS: backup round-trip verified');
    console.log(`  source:   ${sourceSize} bytes`);
    console.log(`  snapshot: ${snapshotSize} bytes`);
    console.log(`  backup:   ${fs.statSync(encPath).size} bytes`);
    console.log(`  restored: ${restoredSize} bytes`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('FAIL:', error);
  process.exit(1);
});
