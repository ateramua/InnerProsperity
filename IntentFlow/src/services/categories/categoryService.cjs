const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Singleton database connection
let dbInstance = null;

async function getDatabase(dbPath) {
    if (dbInstance) return dbInstance;

    dbInstance = await open({
        filename: dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db'),
        driver: sqlite3.Database
    });

    return dbInstance;
}

class CategoryService {
    constructor(dbProvider = null, dbPath = null) {
        this.dbProvider = dbProvider;
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        if (this.dbProvider) {
            return await this.dbProvider();
        }
        return getDatabase(this.dbPath);
    }

    async createCategory(categoryData) {
        const db = await this.getDb();
        try {
            const id = uuidv4(); // Use UUID like accounts
            const {
                userId,
                user_id,
                name,
                group_id = null,
                assigned = 0,
                target_type = 'monthly',
                target_amount = 0,
                target_date = null,
                priority = 2,
                is_hidden = 0
            } = categoryData;

            const finalUserId = userId || user_id;
            if (!finalUserId) {
                throw new Error('userId is required');
            }

            // Validate group exists if provided
            if (group_id) {
                const groupExists = await db.get(
                    'SELECT id FROM category_groups WHERE id = ? AND user_id = ?',
                    [group_id, finalUserId]
                );
                if (!groupExists) {
                    throw new Error(`Group with id ${group_id} does not exist for this user`);
                }
            }

            const now = new Date().toISOString();

            await db.run(`
                INSERT INTO categories (
                    id, user_id, name, group_id, assigned, activity, available,
                    target_type, target_amount, target_date, priority, is_hidden,
                    last_month_assigned, average_spending, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, finalUserId, name, group_id, assigned, 0, assigned,
                target_type, target_amount, target_date, priority, is_hidden,
                0, 0, now, now
            ]);

            return this.getCategoryById(id, finalUserId);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async getCategoryById(id, userId) {
        const db = await this.getDb();
        try {
            const category = await db.get(`
                SELECT * FROM categories 
                WHERE id = ? AND user_id = ?
            `, [id, userId]);
            return category;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async getAllCategories(userId) {
        const db = await this.getDb();
        try {
            const categories = await db.all(`
                SELECT * FROM categories 
                WHERE user_id = ? 
                ORDER BY name ASC
            `, [userId]);
            return categories;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async updateCategory(id, userId, updates) {
        const db = await this.getDb();
        try {
            const allowedUpdates = [
                'name', 'group_id', 'assigned', 'activity', 'available',
                'target_type', 'target_amount', 'target_date', 'priority',
                'last_month_assigned', 'average_spending', 'is_hidden'
            ];

            const setClauses = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key)) {
                    setClauses.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (setClauses.length === 0) {
                return null;
            }

            setClauses.push('updated_at = datetime("now")');
            values.push(id, userId);

            await db.run(`
                UPDATE categories 
                SET ${setClauses.join(', ')}
                WHERE id = ? AND user_id = ?
            `, values);

            return this.getCategoryById(id, userId);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async deleteCategory(id, userId) {
        const db = await this.getDb();
        try {
            // First, check if there are transactions using this category
            const transactionsCount = await db.get(`
                SELECT COUNT(*) as count FROM transactions 
                WHERE category_id = ? AND user_id = ?
            `, [id, userId]);

            if (transactionsCount.count > 0) {
                // Option 1: Set category_id to NULL instead of deleting
                await db.run(`
                    UPDATE transactions 
                    SET category_id = NULL 
                    WHERE category_id = ? AND user_id = ?
                `, [id, userId]);
            }

            // Delete the category
            const result = await db.run(`
                DELETE FROM categories 
                WHERE id = ? AND user_id = ?
            `, [id, userId]);

            return result.changes > 0;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

  

    async getCategoriesWithTargets(userId) {
        const db = await this.getDb();
        try {
            const categories = await db.all(`
                SELECT * FROM categories 
                WHERE user_id = ? 
                AND target_amount IS NOT NULL 
                AND target_amount > 0
                ORDER BY target_type, name
            `, [userId]);
            return categories;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }
}

module.exports = CategoryService;