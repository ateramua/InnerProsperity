-- Add check_number column to transactions table if it doesn't exist
ALTER TABLE transactions ADD COLUMN check_number TEXT;