const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class LocalAuth {
  constructor() {
    this.db = null;
    this.currentUser = null;
    this.init();
  }

  init() {
    const appName = 'money-manager';
    let userDataPath;

    if (process.platform === 'darwin') {
      userDataPath = path.join(os.homedir(), 'Library', 'Application Support', appName);
    } else if (process.platform === 'win32') {
      userDataPath = path.join(process.env.APPDATA, appName);
    } else {
      userDataPath = path.join(os.homedir(), '.local', 'share', appName);
    }

    const dbPath = path.join(userDataPath, 'money-manager.db');
    this.db = new sqlite3.Database(dbPath);
  }

  // Hash password with salt
  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
  }

  // Verify password
  verifyPassword(password, salt, hash) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return verifyHash === hash;
  }

  // Create new user
  async createUser(username, password, email = null, fullName = null) {
    return new Promise((resolve, reject) => {
      // Check if user exists
      this.db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          reject(new Error('Username or email already exists'));
          return;
        }

        // Hash password
        const { salt, hash } = this.hashPassword(password);

        // Insert new user
        this.db.run(
          `INSERT INTO users (username, email, password_hash, password_salt, full_name)
           VALUES (?, ?, ?, ?, ?)`,
          [username, email || null, hash, salt, fullName || null],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({
                id: this.lastID,
                username,
                email,
                fullName
              });
            }
          }
        );
      });
    });
  }

  // Login user
  async login(username, password) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ? OR email = ? AND is_active = 1',
        [username, username],
        (err, user) => {
          if (err) {
            reject(err);
            return;
          }

          if (!user) {
            reject(new Error('User not found'));
            return;
          }

          // Verify password
          const isValid = this.verifyPassword(password, user.password_salt, user.password_hash);

          if (!isValid) {
            reject(new Error('Invalid password'));
            return;
          }

          // Update last login
          this.db.run(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
          );

          // Set current user (remove sensitive data)
          this.currentUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            created_at: user.created_at,
            last_login: new Date().toISOString()
          };

          resolve(this.currentUser);
        }
      );
    });
  }

  // Logout
  logout() {
    this.currentUser = null;
    return true;
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if logged in
  isAuthenticated() {
    return this.currentUser !== null;
  }

  // Change password
  async changePassword(oldPassword, newPassword) {
    if (!this.currentUser) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT password_salt, password_hash FROM users WHERE id = ?',
        [this.currentUser.id],
        (err, user) => {
          if (err) {
            reject(err);
            return;
          }

          // Verify old password
          const isValid = this.verifyPassword(oldPassword, user.password_salt, user.password_hash);

          if (!isValid) {
            reject(new Error('Current password is incorrect'));
            return;
          }

          // Hash new password
          const { salt, hash } = this.hashPassword(newPassword);

          // Update password
          this.db.run(
            'UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?',
            [salt, hash, this.currentUser.id],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(true);
              }
            }
          );
        }
      );
    });
  }

  // List all users (admin only)
  async listUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, username, email, full_name, created_at, last_login, is_active FROM users',
        [],
        (err, users) => {
          if (err) {
            reject(err);
          } else {
            resolve(users);
          }
        }
      );
    });
  }

  // Delete user (admin only)
  async deleteUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }
}

module.exports = new LocalAuth();
