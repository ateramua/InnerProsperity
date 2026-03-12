
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class UserService {
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
  async createUser(username, password, fullName = null, email = null) {
    return new Promise((resolve, reject) => {
      // Check if user exists
      this.db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          reject(new Error('Username already exists'));
          return;
        }

        // Hash password
        const { salt, hash } = this.hashPassword(password);

        // Random avatar color
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
        const avatarColor = colors[Math.floor(Math.random() * colors.length)];

        // Insert new user
        this.db.run(
          `INSERT INTO users (username, password_hash, password_salt, full_name, email, avatar_color)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [username, hash, salt, fullName || username, email, avatarColor],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({
                id: this.lastID,
                username,
                fullName: fullName || username,
                email,
                avatarColor
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
        'SELECT * FROM users WHERE username = ?',
        [username],
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
            fullName: user.full_name,
            email: user.email,
            avatarColor: user.avatar_color,
            createdAt: user.created_at,
            lastLogin: new Date().toISOString()
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

  // List all users
  async listUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, username, full_name, email, avatar_color, last_login FROM users ORDER BY username',
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
}

module.exports = new UserService();