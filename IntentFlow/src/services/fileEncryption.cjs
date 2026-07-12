const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const { app, dialog, BrowserWindow } = require('electron');
const {
  BACKUP_PBKDF2_ITERATIONS,
  normalizeBackupPassword,
  resolveBackupEncryptionOptions,
  collectBackupIterationCandidates,
  isAuthenticationFailure,
} = require('./backup/backupCrypto.cjs');

const MIN_SQLITE_DB_BYTES = 100;
const SQLITE_FILE_HEADER = 'SQLite format 3';
const EMPTY_ENCRYPTED_PAYLOAD_ERROR =
  'Backup file has an empty encrypted payload (no database data). This file cannot be restored. Export a new backup to a disk with free space, then try again.';

class FileEncryption {
  constructor() {
    this.currentFile = null;
    this.currentPassword = null;
  }

  hasSqliteHeader(buffer) {
    if (!buffer || buffer.length < MIN_SQLITE_DB_BYTES) {
      return false;
    }
    return buffer.slice(0, 15).toString('utf8').startsWith(SQLITE_FILE_HEADER);
  }

  generateRandomBytes(length = 16) {
    return crypto.randomBytes(length);
  }

  deriveKey(password, salt, options = {}) {
    const normalizedPassword = normalizeBackupPassword(password);
    const resolved = resolveBackupEncryptionOptions(options);
    const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'base64');
    return crypto.pbkdf2Sync(
      Buffer.from(normalizedPassword, 'utf8'),
      saltBuffer,
      resolved.iterations,
      resolved.keyLength,
      resolved.digest
    );
  }

  getAppVersion() {
    return (app && typeof app.getVersion === 'function') ? app.getVersion() : 'unknown';
  }

  getBackupFileName() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `intentflow-backup-${timestamp}.enc`;
  }

  createBackupContainer(encryptedPayloadBuffer, salt, iv, authTag, options = {}) {
    const encryptedPayloadBase64 = encryptedPayloadBuffer.toString('base64');
    const checksum = crypto.createHash('sha256').update(encryptedPayloadBase64).digest('hex');
    const resolved = resolveBackupEncryptionOptions(options);

    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      appVersion: this.getAppVersion(),
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        kdf: resolved.kdf,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        iterations: resolved.iterations,
        hash: 'SHA256'
      },
      checksum,
      encryptedPayload: encryptedPayloadBase64
    };
  }

  decryptBackupPayload({ password, container, encryptedPayload, authTag, iv, salt }) {
    const iterationCandidates = collectBackupIterationCandidates(container.encryptionMetadata);
    let lastError = null;

    for (const iterations of iterationCandidates) {
      let key = null;
      try {
        key = this.deriveKey(password, salt, { iterations });
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decryptedBuffer = Buffer.concat([
          decipher.update(encryptedPayload),
          decipher.final(),
        ]);

        if (!decryptedBuffer.length) {
          lastError = new Error(EMPTY_ENCRYPTED_PAYLOAD_ERROR);
          continue;
        }
        if (!this.hasSqliteHeader(decryptedBuffer)) {
          lastError = new Error('Decrypted payload is not a valid SQLite database');
          continue;
        }

        return { decryptedBuffer, iterationsUsed: iterations };
      } catch (error) {
        lastError = error;
        if (!isAuthenticationFailure(error)) {
          throw error;
        }
      } finally {
        if (key && Buffer.isBuffer(key)) {
          key.fill(0);
        }
      }
    }

    throw lastError || new Error('Invalid password or corrupted backup file');
  }

  validateBackupContainer(container) {
    if (!container || typeof container !== 'object') {
      throw new Error('Invalid backup file format');
    }
    if (!container.encryptionMetadata || !container.checksum) {
      throw new Error('Missing backup metadata');
    }
    if (
      typeof container.encryptedPayload !== 'string' ||
      container.encryptedPayload.trim().length === 0
    ) {
      throw new Error(EMPTY_ENCRYPTED_PAYLOAD_ERROR);
    }
    if (container.encryptionMetadata.algorithm !== 'AES-256-GCM') {
      throw new Error('Unsupported encryption algorithm');
    }
    if (!container.encryptionMetadata.salt || !container.encryptionMetadata.iv || !container.encryptionMetadata.authTag) {
      throw new Error('Incomplete backup encryption metadata');
    }
  }

  describeInvalidBackupFileContent(rawContent) {
    const trimmed = String(rawContent || '').trim();
    if (!trimmed.length) {
      return 'Backup file is empty';
    }
    if (trimmed.startsWith(SQLITE_FILE_HEADER)) {
      return (
        'This file looks like an unencrypted SQLite database, not an IntentFlow .enc backup. ' +
        'Use Export Backup in Settings to create a valid encrypted backup file.'
      );
    }
    if (trimmed.startsWith('U2FsdGVkX1')) {
      return (
        'This file uses an older budget encryption format, not an IntentFlow database backup. ' +
        'Use Export Backup in Settings to create a valid .enc database backup.'
      );
    }
    if (!trimmed.startsWith('{')) {
      return (
        'Backup file is not a valid IntentFlow .enc backup (expected JSON starting with "{"). ' +
        'Export a new backup from Settings and import that file.'
      );
    }
    return (
      'Backup file is not valid JSON. Export a new backup from Settings and import that .enc file.'
    );
  }

  readBackupContainer(encryptedPath) {
    const rawBuffer = fs.readFileSync(encryptedPath);
    if (!rawBuffer.length) {
      throw new Error('Backup file is empty');
    }

    let fileContent = rawBuffer.toString('utf8');
    if (fileContent.charCodeAt(0) === 0xfeff) {
      fileContent = fileContent.slice(1);
    }
    if (!fileContent.trim().length) {
      throw new Error('Backup file is empty');
    }

    let container;
    try {
      container = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(this.describeInvalidBackupFileContent(fileContent));
    }
    this.validateBackupContainer(container);
    return container;
  }

  verifyWrittenBackupFile(filePath, expectedChecksum) {
    const container = this.readBackupContainer(filePath);
    if (expectedChecksum && container.checksum !== expectedChecksum) {
      throw new Error('Backup file verification failed after write (checksum mismatch)');
    }
    return container;
  }

  resolveDialogParent(parentWindow = null) {
    if (parentWindow && !parentWindow.isDestroyed()) {
      return parentWindow;
    }
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  }

  focusDialogParent(parentWindow = null) {
    const parent = this.resolveDialogParent(parentWindow);
    if (parent && !parent.isDestroyed()) {
      if (parent.isMinimized()) {
        parent.restore();
      }
      parent.show();
      parent.focus();
    }
    return parent;
  }

  ensureBackupFileExtension(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return filePath;
    }
    const normalized = filePath.trim();
    if (!normalized.length) {
      return filePath;
    }
    if (normalized.toLowerCase().endsWith('.enc')) {
      return normalized;
    }
    return `${normalized}.enc`;
  }

  async pickBackupSavePath(defaultPath = null, parentWindow = null) {
    const parent = this.focusDialogParent(parentWindow);
    const dialogOptions = {
      title: 'Save Encrypted Backup',
      defaultPath: defaultPath || this.getBackupDestinationPath(),
      filters: [
        { name: 'IntentFlow Backup', extensions: ['enc'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };

    const result = parent
      ? await dialog.showSaveDialog(parent, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    return {
      success: true,
      filePath: this.ensureBackupFileExtension(result.filePath),
    };
  }

  async openEncryptedBackupDialog(parentWindow = null) {
    const parent = this.focusDialogParent(parentWindow);
    const dialogOptions = {
      title: 'Open Encrypted Backup',
      filters: [
        { name: 'IntentFlow Backup', extensions: ['enc'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    };

    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      this.readBackupContainer(filePath);
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Selected file is not a valid IntentFlow backup',
      };
    }

    return { success: true, filePath };
  }

  getBackupDestinationPath(defaultPath = null) {
    return defaultPath || path.join(require('os').homedir(), 'Desktop', this.getBackupFileName());
  }

  // Encrypt data with password
  encrypt(data, password) {
    const jsonString = JSON.stringify(data, null, 2);
    const encrypted = CryptoJS.AES.encrypt(jsonString, password).toString();
    return encrypted;
  }

  // Decrypt data with password
  decrypt(encryptedData, password) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, password);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decryptedString);
    } catch (error) {
      throw new Error('Invalid password or corrupted file');
    }
  }

  // Save budget to encrypted file
  async saveBudgetToFile(budgetData, password, filePath = null) {
    try {
      // If no file path, ask user where to save
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: 'Save Budget As',
          defaultPath: path.join(require('os').homedir(), 'Desktop', 'my-budget.mny'),
          filters: [
            { name: 'IntentFlow Files', extensions: ['mny'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        if (result.canceled) {
          return { success: false, canceled: true };
        }
        filePath = result.filePath;
      }

      // Add metadata
      const dataToSave = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        appName: 'IntentFlow',
        data: budgetData
      };

      // Encrypt the data
      const encrypted = this.encrypt(dataToSave, password);

      // Save to file
      fs.writeFileSync(filePath, encrypted, 'utf8');

      this.currentFile = filePath;
      this.currentPassword = password;

      return {
        success: true,
        filePath,
        message: `Budget saved to ${path.basename(filePath)}`
      };
    } catch (error) {
      console.error('Error saving budget:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Load budget from encrypted file
  async loadBudgetFromFile(password, filePath = null) {
    try {
      // If no file path, ask user to select file
      if (!filePath) {
        const result = await dialog.showOpenDialog({
          title: 'Open Budget',
          filters: [
            { name: 'IntentFlow Files', extensions: ['mny'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        
        if (result.canceled) {
          return { success: false, canceled: true };
        }
        filePath = result.filePaths[0];
      }

      // Read encrypted file
      const encrypted = fs.readFileSync(filePath, 'utf8');

      // Decrypt the data
      const decrypted = this.decrypt(encrypted, password);

      // Verify it's a valid budget file
      if (!decrypted.version || !decrypted.data) {
        throw new Error('Invalid budget file format');
      }

      this.currentFile = filePath;
      this.currentPassword = password;

      return {
        success: true,
        filePath,
        data: decrypted.data,
        metadata: {
          version: decrypted.version,
          createdAt: decrypted.createdAt
        },
        message: `Budget loaded from ${path.basename(filePath)}`
      };
    } catch (error) {
      console.error('Error loading budget:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Export as unencrypted JSON (for backup/external use)
  async exportAsJSON(budgetData, filePath = null) {
    try {
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: 'Export as JSON',
          defaultPath: path.join(require('os').homedir(), 'Desktop', 'budget-export.json'),
          filters: [
            { name: 'JSON Files', extensions: ['json'] }
          ]
        });
        
        if (result.canceled) {
          return { success: false, canceled: true };
        }
        filePath = result.filePath;
      }

      const jsonString = JSON.stringify(budgetData, null, 2);
      fs.writeFileSync(filePath, jsonString, 'utf8');

      return {
        success: true,
        filePath,
        message: `Budget exported to ${path.basename(filePath)}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  bufferToWordArray(buffer) {
    return CryptoJS.lib.WordArray.create(buffer);
  }

  wordArrayToBuffer(wordArray) {
    const base64 = wordArray.toString(CryptoJS.enc.Base64);
    return Buffer.from(base64, 'base64');
  }

  async encryptFile(sourcePath, password, filePath = null, options = {}) {
    try {
      if (!password) {
        return { success: false, error: 'Password is required' };
      }

      if (!sourcePath) {
        return { success: false, error: 'Source database path is required' };
      }

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source database not found' };
      }

      if (!filePath) {
        const picked = await this.pickBackupSavePath();
        if (!picked.success) {
          return picked;
        }
        filePath = picked.filePath;
      } else {
        filePath = this.ensureBackupFileExtension(filePath);
      }

      const sourceStats = fs.statSync(sourcePath);
      if (sourceStats.size <= 0) {
        return {
          success: false,
          error: 'Source database is empty. Cannot create a backup without database data.',
        };
      }

      const fileBuffer = fs.readFileSync(sourcePath);
      if (!fileBuffer.length) {
        return {
          success: false,
          error: 'Source database could not be read. Export was aborted before writing a backup file.',
        };
      }
      if (!this.hasSqliteHeader(fileBuffer)) {
        return {
          success: false,
          error: 'Source database does not contain a valid SQLite header. Export was aborted.',
        };
      }

      const salt = this.generateRandomBytes(16);
      const iv = this.generateRandomBytes(12);
      const backupCryptoOptions = resolveBackupEncryptionOptions(options);
      const key = this.deriveKey(password, salt, backupCryptoOptions);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encryptedBuffer = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      if (!encryptedBuffer.length) {
        if (Buffer.isBuffer(key)) {
          key.fill(0);
        }
        fileBuffer.fill(0);
        return {
          success: false,
          error: 'Encryption produced an empty payload. Export was aborted before writing a backup file.',
        };
      }

      const backupContainer = this.createBackupContainer(encryptedBuffer, salt, iv, authTag, backupCryptoOptions);
      if (!backupContainer.encryptedPayload || backupContainer.encryptedPayload.trim().length === 0) {
        if (Buffer.isBuffer(key)) {
          key.fill(0);
        }
        fileBuffer.fill(0);
        return {
          success: false,
          error: 'Backup container is missing encrypted database data. Export was aborted.',
        };
      }

      const serialized = JSON.stringify(backupContainer, null, 2);
      if (!serialized.startsWith('{')) {
        return {
          success: false,
          error: 'Backup serialization failed before writing the .enc file.',
        };
      }
      fs.writeFileSync(filePath, serialized, 'utf8');
      this.verifyWrittenBackupFile(filePath, backupContainer.checksum);

      const writtenStats = fs.statSync(filePath);
      if (!writtenStats.size) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
        return {
          success: false,
          error: 'Backup file write failed (0 bytes written). Check disk space and permissions, then try again.',
        };
      }

      console.log(
        `🔐 Encrypted backup written (${writtenStats.size} bytes, source ${sourceStats.size} bytes): ${filePath}`
      );

      if (Buffer.isBuffer(key)) {
        key.fill(0);
      }
      if (Buffer.isBuffer(fileBuffer)) {
        fileBuffer.fill(0);
      }

      return {
        success: true,
        filePath,
        message: `Encrypted backup created at ${path.basename(filePath)}`
      };
    } catch (error) {
      console.error('Error encrypting file:', error);
      if (error.code === 'ENOSPC') {
        return { success: false, error: 'Not enough disk space to create backup. Please free up space and try again.' };
      }
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        return { success: false, error: 'Cannot write to selected location. Please choose a different folder.' };
      }
      return { success: false, error: error.message };
    }
  }

  async decryptFile(encryptedPath, password, destinationPath = null) {
    let tempDestination = null;
    let decryptedBuffer = null;

    try {
      if (!fs.existsSync(encryptedPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      const container = this.readBackupContainer(encryptedPath);

      const backupVersion = container.appVersion || 'unknown';
      const currentVersion = this.getAppVersion();
      if (backupVersion !== currentVersion) {
        console.warn(
          `⚠️ Backup version mismatch (backup v${backupVersion}, app v${currentVersion}). ` +
            'Proceeding with restore — database format is portable across machines.'
        );
      }

      const encryptedPayload = Buffer.from(container.encryptedPayload, 'base64');
      const checksum = crypto.createHash('sha256').update(container.encryptedPayload).digest('hex');
      if (checksum !== container.checksum) {
        return { success: false, error: 'Backup file is corrupted or has been tampered with (checksum mismatch). Restoration aborted.' };
      }

      const salt = Buffer.from(container.encryptionMetadata.salt, 'base64');
      const iv = Buffer.from(container.encryptionMetadata.iv, 'base64');
      const authTag = Buffer.from(container.encryptionMetadata.authTag, 'base64');

      const { decryptedBuffer, iterationsUsed } = this.decryptBackupPayload({
        password,
        container,
        encryptedPayload,
        authTag,
        iv,
        salt,
      });

      if (iterationsUsed !== Number(container.encryptionMetadata.iterations)) {
        console.warn(
          `⚠️ Backup decrypted using legacy PBKDF2 iterations (${iterationsUsed}); ` +
            `metadata listed ${container.encryptionMetadata.iterations}.`
        );
      }

      if (!destinationPath) {
        return { success: false, error: 'Destination path is required' };
      }

      const destinationDir = path.dirname(destinationPath);
      tempDestination = path.join(destinationDir, `${path.basename(destinationPath)}.restore-${Date.now()}`);
      fs.writeFileSync(tempDestination, decryptedBuffer);
      fs.copyFileSync(tempDestination, destinationPath);
      fs.unlinkSync(tempDestination);

      if (Buffer.isBuffer(decryptedBuffer)) {
        decryptedBuffer.fill(0);
      }

      return {
        success: true,
        filePath: destinationPath,
        message: `Backup restored to ${destinationPath}`
      };
    } catch (error) {
      console.error('Error decrypting file:', error);
      if (tempDestination && fs.existsSync(tempDestination)) {
        try { fs.unlinkSync(tempDestination); } catch (_) {}
      }
      if (isAuthenticationFailure(error)) {
        return { success: false, error: 'Invalid password. Please try again.' };
      }
      if (error.message === EMPTY_ENCRYPTED_PAYLOAD_ERROR) {
        return { success: false, error: EMPTY_ENCRYPTED_PAYLOAD_ERROR };
      }
      return {
        success: false,
        error: error.message.includes('Invalid password') || error.message.includes('authenticated')
          ? 'Invalid password or corrupted backup file'
          : error.message
      };
    }
  }

  async backupDatabase(password, sourcePath = null, filePath = null, options = {}) {
    if (!password) {
      return { success: false, error: 'Password is required' };
    }

    if (!sourcePath) {
      return { success: false, error: 'Source database path is required' };
    }

    return await this.encryptFile(sourcePath, password, filePath, options);
  }

  async restoreDatabase(password, encryptedPath = null, destinationPath = null) {
    if (!password) {
      return { success: false, error: 'Password is required' };
    }

    if (!destinationPath) {
      return { success: false, error: 'Destination database path is required' };
    }

    if (!encryptedPath) {
      const openResult = await this.openEncryptedBackupDialog();
      if (!openResult.success) {
        return openResult;
      }
      encryptedPath = openResult.filePath;
    }

    return await this.decryptFile(encryptedPath, password, destinationPath);
  }

  // Change password of existing file
  async changePassword(newPassword, filePath = null) {
    if (!this.currentFile && !filePath) {
      return {
        success: false,
        error: 'No file is currently open'
      };
    }

    const targetFile = filePath || this.currentFile;

    try {
      // Read current file
      const encrypted = fs.readFileSync(targetFile, 'utf8');
      
      // Decrypt with current password
      const decrypted = this.decrypt(encrypted, this.currentPassword);

      // Re-encrypt with new password
      const newEncrypted = this.encrypt(decrypted, newPassword);

      // Save back to file
      fs.writeFileSync(targetFile, newEncrypted, 'utf8');

      this.currentPassword = newPassword;

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get current file info
  getCurrentFile() {
    if (!this.currentFile) {
      return null;
    }

    return {
      path: this.currentFile,
      name: path.basename(this.currentFile),
      directory: path.dirname(this.currentFile)
    };
  }
}

module.exports = new FileEncryption();
