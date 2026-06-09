const { getDatabase } = require('../db/database.cjs');
const crypto = require('crypto');

class UserService {
  constructor() {
    this.currentUser = null;
  }

  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
  }

  verifyPassword(password, salt, hash) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return verifyHash === hash;
  }

  async createUser(username, password, fullName = null, email = null) {
    const db = await getDatabase();
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      throw new Error('Username already exists');
    }

    const { salt, hash } = this.hashPassword(password);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const result = await db.run(
      `INSERT INTO users (username, password_hash, password_salt, full_name, email, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hash, salt, fullName || username, email, avatarColor]
    );

    return {
      id: result.lastID,
      username,
      fullName: fullName || username,
      email,
      avatarColor,
    };
  }

  async login(username, password) {
    const db = await getDatabase();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = this.verifyPassword(password, user.password_salt, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    this.currentUser = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      avatarColor: user.avatar_color,
      createdAt: user.created_at,
      lastLogin: new Date().toISOString(),
    };

    return this.currentUser;
  }

  logout() {
    this.currentUser = null;
    return true;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async listUsers() {
    const db = await getDatabase();
    return db.all(
      'SELECT id, username, full_name, email, avatar_color, last_login FROM users ORDER BY username'
    );
  }
}

module.exports = new UserService();
