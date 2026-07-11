'use strict';

/** Canonical PBKDF2 parameters for IntentFlow .enc database backups. */
const BACKUP_PBKDF2_ITERATIONS = 600000;
const BACKUP_PBKDF2_DIGEST = 'sha256';
const BACKUP_PBKDF2_KEY_LENGTH = 32;

/**
 * Older exports incorrectly passed UI "encryption settings" (Argon2id defaults)
 * into PBKDF2. Try these iteration counts when metadata does not match the key.
 */
const LEGACY_BACKUP_PBKDF2_ITERATIONS = Object.freeze([600000, 3, 100000, 310000]);

function normalizeBackupPassword(password) {
  return String(password ?? '').normalize('NFC');
}

function resolveBackupEncryptionOptions(options = {}) {
  const explicitIterations = Number(options.backupPbkdf2Iterations);
  const iterations =
    Number.isFinite(explicitIterations) && explicitIterations > 0
      ? explicitIterations
      : BACKUP_PBKDF2_ITERATIONS;

  return {
    iterations,
    kdf: 'PBKDF2',
    digest: BACKUP_PBKDF2_DIGEST,
    keyLength: BACKUP_PBKDF2_KEY_LENGTH,
  };
}

function collectBackupIterationCandidates(metadata = {}) {
  const seen = new Set();
  const candidates = [];

  const push = (value) => {
    const iterations = Number(value);
    if (!Number.isFinite(iterations) || iterations <= 0 || seen.has(iterations)) {
      return;
    }
    seen.add(iterations);
    candidates.push(iterations);
  };

  push(metadata.iterations);
  for (const legacy of LEGACY_BACKUP_PBKDF2_ITERATIONS) {
    push(legacy);
  }

  return candidates.length ? candidates : [BACKUP_PBKDF2_ITERATIONS];
}

function isAuthenticationFailure(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Unsupported state or unable to authenticate data') ||
    message.includes('unable to authenticate') ||
    message.includes('bad decrypt')
  );
}

module.exports = {
  BACKUP_PBKDF2_ITERATIONS,
  BACKUP_PBKDF2_DIGEST,
  BACKUP_PBKDF2_KEY_LENGTH,
  LEGACY_BACKUP_PBKDF2_ITERATIONS,
  normalizeBackupPassword,
  resolveBackupEncryptionOptions,
  collectBackupIterationCandidates,
  isAuthenticationFailure,
};
