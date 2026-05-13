-- Migration: 011_add_user_password_columns.sql
-- Add password_hash and password_salt columns to users table

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN avatar_color TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN updated_at DATETIME;
ALTER TABLE users ADD COLUMN last_login DATETIME;