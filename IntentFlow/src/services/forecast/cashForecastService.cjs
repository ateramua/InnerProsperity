'use strict';

const { v4: uuidv4 } = require('uuid');

class CashForecastService {
  constructor(dbProvider) {
    this.dbProvider = dbProvider;
  }

  async getDb() {
    if (typeof this.dbProvider === 'function') {
      return this.dbProvider();
    }
    return this.dbProvider;
  }

  async createShare(userId, payload, ttlDays = 90) {
    const db = await this.getDb();
    const id = uuidv4();
    const expires = new Date();
    expires.setDate(expires.getDate() + ttlDays);
    await db.run(
      `INSERT INTO forecast_shares (id, user_id, payload, expires_at) VALUES (?, ?, ?, ?)`,
      [id, userId, JSON.stringify(payload), expires.toISOString()],
    );
    return id;
  }

  async getShare(shareId) {
    const db = await this.getDb();
    const row = await db.get(
      `SELECT payload FROM forecast_shares
       WHERE id = ?
         AND datetime(expires_at) > datetime('now')`,
      [shareId],
    );
    if (!row?.payload) return null;
    try {
      return JSON.parse(row.payload);
    } catch {
      return null;
    }
  }

  async deleteExpiredShares() {
    const db = await this.getDb();
    await db.run(`DELETE FROM forecast_shares WHERE datetime(expires_at) <= datetime('now')`);
  }

  async getRecurringPrefs(userId) {
    const db = await this.getDb();
    return db.all(
      `SELECT recurring_id, status, override_json, updated_at
       FROM forecast_recurring_prefs
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [userId],
    );
  }

  async setRecurringPref(userId, recurringId, status, override = null) {
    const db = await this.getDb();
    await db.run(
      `INSERT INTO forecast_recurring_prefs (user_id, recurring_id, status, override_json, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, recurring_id) DO UPDATE SET
         status = excluded.status,
         override_json = excluded.override_json,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        recurringId,
        status,
        override ? JSON.stringify(override) : null,
      ],
    );
    return { recurringId, status, override };
  }

  async clearRecurringPref(userId, recurringId) {
    const db = await this.getDb();
    await db.run(
      `DELETE FROM forecast_recurring_prefs WHERE user_id = ? AND recurring_id = ?`,
      [userId, recurringId],
    );
  }

  async getScheduledTransactionsForUser(userId, { fromDate = null, limit = 5000 } = {}) {
    const db = await this.getDb();
    const params = [userId];
    let sql = `
      SELECT id, account_id, date, payee, amount, transaction_type, category_id, memo, status
      FROM scheduled_transactions
      WHERE user_id = ? AND status = 'pending'
    `;
    if (fromDate) {
      sql += ` AND date >= ?`;
      params.push(fromDate);
    }
    sql += ` ORDER BY date ASC LIMIT ?`;
    params.push(limit);
    return db.all(sql, params);
  }
}

module.exports = CashForecastService;
