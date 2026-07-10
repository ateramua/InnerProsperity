const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const { app, dialog } = require('electron');

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
    const iterations = Number(options.iterations) || 600000;
    const digest = 'sha256';
    const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'base64');
    return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), saltBuffer, iterations, 32, digest);
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
    const kdf = 'PBKDF2';
    const iterations = Number(options.iterations) || 600000;

    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      appVersion: this.getAppVersion(),
      encryptionMetadata: {
        algorithm: 'AES-256-GCM',
        kdf,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        iterations,
        hash: 'SHA256'
      },
      checksum,
      encryptedPayload: encryptedPayloadBase64
    };
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

  readBackupContainer(encryptedPath) {
    const fileContent = fs.readFileSync(encryptedPath, 'utf8');
    if (!fileContent || fileContent.trim().length === 0) {
      throw new Error('Backup file is empty');
    }
    let container;
    try {
      container = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error('Backup file is not valid JSON');
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

  async openEncryptedBackupDialog() {
    const result = await dialog.showOpenDialog({
      title: 'Open Encrypted Backup',
      filters: [
        { name: 'IntentFlow Backup', extensions: ['enc'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePaths[0] };
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
        const result = await dialog.showSaveDialog({
          title: 'Save Encrypted Backup',
          defaultPath: this.getBackupDestinationPath(),
          filters: [
            { name: 'IntentFlow Backup', extensions: ['enc'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (result.canceled) {
          return { success: false, canceled: true };
        }
        filePath = result.filePath;
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
      const key = this.deriveKey(password, salt, options);
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

      const backupContainer = this.createBackupContainer(encryptedBuffer, salt, iv, authTag, options);
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
    let key = null;

    try {
      if (!fs.existsSync(encryptedPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      const container = this.readBackupContainer(encryptedPath);

      const backupVersion = container.appVersion || 'unknown';
      const currentVersion = this.getAppVersion();
      if (backupVersion !== currentVersion) {
        const message = `This backup was created with a different version of IntentFlow (v${backupVersion}). Current version is v${currentVersion}. Restoration may not work correctly. Continue anyway?`;
        const choice = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Cancel', 'Continue'],
          defaultId: 1,
          cancelId: 0,
          title: 'Version mismatch',
          message
        });

        if (choice.response !== 1) {
          return { success: false, canceled: true, error: 'Restore canceled due to version mismatch' };
        }
      }

      const encryptedPayload = Buffer.from(container.encryptedPayload, 'base64');
      const checksum = crypto.createHash('sha256').update(container.encryptedPayload).digest('hex');
      if (checksum !== container.checksum) {
        return { success: false, error: 'Backup file is corrupted or has been tampered with (checksum mismatch). Restoration aborted.' };
      }

      const kdf = container.encryptionMetadata.kdf || 'PBKDF2';
      const salt = Buffer.from(container.encryptionMetadata.salt, 'base64');
      const iv = Buffer.from(container.encryptionMetadata.iv, 'base64');
      const authTag = Buffer.from(container.encryptionMetadata.authTag, 'base64');
      const iterations = Number(container.encryptionMetadata.iterations) || 600000;
      key = this.deriveKey(password, salt, { iterations, kdf });

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      decryptedBuffer = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]);

      if (!decryptedBuffer.length) {
        return { success: false, error: EMPTY_ENCRYPTED_PAYLOAD_ERROR };
      }
      if (!this.hasSqliteHeader(decryptedBuffer)) {
        return {
          success: false,
          error: 'Decrypted backup does not contain a valid SQLite database. The backup file may be corrupted.',
        };
      }

      if (!destinationPath) {
        return { success: false, error: 'Destination path is required' };
      }

      const destinationDir = path.dirname(destinationPath);
      tempDestination = path.join(destinationDir, `${path.basename(destinationPath)}.restore-${Date.now()}`);
      fs.writeFileSync(tempDestination, decryptedBuffer);
      fs.copyFileSync(tempDestination, destinationPath);
      fs.unlinkSync(tempDestination);

      if (Buffer.isBuffer(key)) {
        key.fill(0);
      }
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
      if (key && Buffer.isBuffer(key)) {
        key.fill(0);
      }
      if (error.message && error.message.includes('Unsupported state or unable to authenticate data')) {
        return { success: false, error: 'Invalid password. Please try again.' };
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
