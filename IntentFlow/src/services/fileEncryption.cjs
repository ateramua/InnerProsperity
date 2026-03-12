const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');
const { dialog } = require('electron');

class FileEncryption {
  constructor() {
    this.currentFile = null;
    this.currentPassword = null;
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
            { name: 'Money Manager Files', extensions: ['mny'] },
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
        appName: 'Money Manager',
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
            { name: 'Money Manager Files', extensions: ['mny'] },
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
