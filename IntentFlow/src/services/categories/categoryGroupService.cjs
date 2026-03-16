// src/services/categories/categoryGroupService.cjs
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

class CategoryGroupService {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getCategoryGroups(userId) {
        const db = await getDatabase(this.dbPath);
        const groups = await db.all(`
            SELECT * FROM category_groups 
            WHERE user_id = ? 
            ORDER BY sort_order ASC, name ASC
        `, userId);
        return groups || [];
    }

    async createCategoryGroup(userId, name, sortOrder = 0) {
        const db = await getDatabase(this.dbPath);
        const id = uuidv4();
        await db.run(`
            INSERT INTO category_groups (id, user_id, name, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [id, userId, name, sortOrder]);
        return this.getCategoryGroupById(id);
    }

    async updateCategoryGroup(id, userId, updates) {
        const db = await getDatabase(this.dbPath);
        const allowedUpdates = ['name', 'sort_order', 'is_hidden'];
        const setClauses = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                setClauses.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (setClauses.length === 0) return null;

        setClauses.push('updated_at = datetime("now")');
        values.push(id, userId);

        await db.run(`
            UPDATE category_groups 
            SET ${setClauses.join(', ')}
            WHERE id = ? AND user_id = ?
        `, values);

        return this.getCategoryGroupById(id);
    }

    async deleteCategoryGroup(id, userId) {
        const db = await getDatabase(this.dbPath);
        // Remove group reference from categories
        await db.run(`
            UPDATE categories 
            SET group_id = NULL 
            WHERE group_id = ?
        `, id);

        // Delete the group
        const result = await db.run(`
            DELETE FROM category_groups 
            WHERE id = ? AND user_id = ?
        `, [id, userId]);

        return result.changes > 0;
    }

    async getCategoryGroupById(id) {
        const db = await getDatabase(this.dbPath);
        return await db.get(`
            SELECT * FROM category_groups WHERE id = ?
        `, id);
    }

    async getGroupsWithCategories(userId) {
        const db = await getDatabase(this.dbPath);

        const groups = await db.all(`
            SELECT * FROM category_groups 
            WHERE user_id = ? 
            ORDER BY sort_order ASC, name ASC
        `, userId);

        const groupsWithCategories = await Promise.all(groups.map(async (group) => {
            const categories = await db.all(`
                SELECT * FROM categories 
                WHERE group_id = ? 
                ORDER BY name ASC
            `, group.id);
            return {
                ...group,
                categories: categories || []
            };
        }));

        // Also get uncategorized categories
        const uncategorized = await db.all(`
            SELECT * FROM categories 
            WHERE user_id = ? AND group_id IS NULL
            ORDER BY name ASC
        `, userId);

        if (uncategorized.length > 0) {
            groupsWithCategories.unshift({
                id: 'uncategorized',
                name: 'Uncategorized',
                is_hidden: 0,
                categories: uncategorized
            });
        }

        return groupsWithCategories;
    }
}

module.exports = CategoryGroupService;