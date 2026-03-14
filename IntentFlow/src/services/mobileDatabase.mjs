// src/services/mobileDatabase.mjs
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

class MobileDatabase {
  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('✅ MobileDatabase already initialized');
      return;
    }

    try {
      console.log('📦 Initializing MobileDatabase...');
      
      // Create the database
      this.db = await this.sqlite.createConnection(
        'intentflow',
        false,
        'no-encryption',
        1
      );
      await this.db.open();

      // Run migrations to create tables
      await this.runMigrations();
      
      this.isInitialized = true;
      console.log('✅ Mobile database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize mobile database:', error);
      throw error;
    }
  }

  async runMigrations() {
    console.log('📦 Running migrations...');
    
    try {
      // Create users table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE,
          full_name TEXT,
          password_hash TEXT,
          password_salt TEXT,
          avatar_color TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        )
      `);

      // Create accounts table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          balance REAL DEFAULT 0,
          currency TEXT DEFAULT 'USD',
          institution TEXT,
          is_active INTEGER DEFAULT 1,
          account_type_category TEXT DEFAULT 'budget',
          cleared_balance REAL DEFAULT 0,
          working_balance REAL DEFAULT 0,
          credit_limit REAL,
          interest_rate REAL,
          due_date DATE,
          minimum_payment REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create categories table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_hidden INTEGER DEFAULT 0,
          group_id TEXT,
          target_type TEXT,
          target_amount REAL,
          target_date DATE,
          assigned REAL DEFAULT 0,
          activity REAL DEFAULT 0,
          available REAL DEFAULT 0,
          priority INTEGER DEFAULT 2,
          last_month_assigned REAL DEFAULT 0,
          average_spending REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create category_groups table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS category_groups (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          sort_order INTEGER,
          is_hidden INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      console.log('✅ Migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration error:', error);
      throw error;
    }
  }

  // ==================== CATEGORY GROUP METHODS ====================
  async createCategoryGroup(groupData) {
    console.log('📦 createCategoryGroup called with:', groupData);
    
    if (!this.isInitialized) {
      console.log('📦 Database not initialized, initializing now...');
      await this.initialize();
    }
    
    try {
      const id = groupData.id || `group_${Date.now()}`;
      const query = `
        INSERT INTO category_groups (id, user_id, name, sort_order)
        VALUES (?, ?, ?, ?)
      `;
      
      console.log('📦 Executing query:', query);
      console.log('📦 Values:', [id, groupData.user_id, groupData.name, groupData.sort_order || 0]);
      
      const result = await this.db.run(query, [
        id,
        groupData.user_id,
        groupData.name,
        groupData.sort_order || 0
      ]);
      
      console.log('📦 Query result:', result);
      
      return { success: true, data: { id } };
    } catch (error) {
      console.error('❌ Error creating category group:', error);
      return { success: false, error: error.message };
    }
  }

  async getCategoryGroups(userId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const result = await this.db.query(
        'SELECT * FROM category_groups WHERE user_id = ? ORDER BY sort_order',
        [userId]
      );
      return { success: true, data: result.values || [] };
    } catch (error) {
      console.error('Error getting category groups:', error);
      return { success: false, error: error.message };
    }
  }

  async updateCategoryGroup(id, userId, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const query = 'UPDATE category_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
      await this.db.run(query, [updates.name, id, userId]);
      return { success: true };
    } catch (error) {
      console.error('Error updating category group:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteCategoryGroup(id, userId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      await this.db.run('DELETE FROM category_groups WHERE id = ? AND user_id = ?', [id, userId]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting category group:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== CATEGORY METHODS ====================
  async createCategory(categoryData) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const id = categoryData.id || `cat_${Date.now()}`;
      const query = `
        INSERT INTO categories (id, user_id, name, group_id, target_type, target_amount, target_date, assigned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.run(query, [
        id,
        categoryData.user_id,
        categoryData.name,
        categoryData.group_id,
        categoryData.target_type || 'monthly',
        categoryData.target_amount || 0,
        categoryData.target_date || null,
        categoryData.assigned || 0
      ]);
      
      return { success: true, data: { id } };
    } catch (error) {
      console.error('Error creating category:', error);
      return { success: false, error: error.message };
    }
  }

  async getCategories(userId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const result = await this.db.query(
        'SELECT * FROM categories WHERE user_id = ?',
        [userId]
      );
      return { success: true, data: result.values || [] };
    } catch (error) {
      console.error('Error getting categories:', error);
      return { success: false, error: error.message };
    }
  }

  async updateCategory(categoryId, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const setClauses = [];
      const values = [];

      if (updates.name !== undefined) {
        setClauses.push('name = ?');
        values.push(updates.name);
      }
      if (updates.assigned !== undefined) {
        setClauses.push('assigned = ?');
        values.push(updates.assigned);
      }
      if (updates.target_amount !== undefined) {
        setClauses.push('target_amount = ?');
        values.push(updates.target_amount);
      }
      if (updates.target_type !== undefined) {
        setClauses.push('target_type = ?');
        values.push(updates.target_type);
      }
      if (updates.target_date !== undefined) {
        setClauses.push('target_date = ?');
        values.push(updates.target_date);
      }
      if (updates.group_id !== undefined) {
        setClauses.push('group_id = ?');
        values.push(updates.group_id);
      }

      values.push(categoryId);

      if (setClauses.length === 0) {
        return { success: false, error: 'No updates provided' };
      }

      const query = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`;
      await this.db.run(query, values);
      
      return { success: true };
    } catch (error) {
      console.error('Error updating category:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteCategory(categoryId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      await this.db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting category:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== ACCOUNT METHODS ====================
  async getAccounts(userId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const result = await this.db.query(
        'SELECT * FROM accounts WHERE user_id = ?',
        [userId]
      );
      return { success: true, data: result.values || [] };
    } catch (error) {
      console.error('Error getting accounts:', error);
      return { success: false, error: error.message };
    }
  }

  async createAccount(accountData) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const id = accountData.id || `acc_${Date.now()}`;
      const query = `
        INSERT INTO accounts (id, user_id, name, type, balance, institution, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.run(query, [
        id,
        accountData.user_id,
        accountData.name,
        accountData.type,
        accountData.balance || 0,
        accountData.institution || '',
        accountData.currency || 'USD'
      ]);
      
      return { success: true, data: { id } };
    } catch (error) {
      console.error('Error creating account:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== TRANSACTION METHODS ====================
  async getTransactions(userId, limit = 100) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const result = await this.db.query(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT ?',
        [userId, limit]
      );
      return { success: true, data: result.values || [] };
    } catch (error) {
      console.error('Error getting transactions:', error);
      return { success: false, error: error.message };
    }
  }

  async addTransaction(transactionData) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const id = transactionData.id || `tx_${Date.now()}`;
      const query = `
        INSERT INTO transactions (id, account_id, user_id, date, description, amount, category_id, payee, memo, is_cleared)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await this.db.run(query, [
        id,
        transactionData.accountId,
        transactionData.userId,
        transactionData.date,
        transactionData.description,
        transactionData.amount,
        transactionData.categoryId,
        transactionData.payee || '',
        transactionData.memo || '',
        transactionData.cleared ? 1 : 0
      ]);
      
      return { success: true, data: { id } };
    } catch (error) {
      console.error('Error adding transaction:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create a single instance and export it
const mobileDatabase = new MobileDatabase();
export default mobileDatabase;