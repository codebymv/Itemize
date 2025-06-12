-- Categories Table Migration
-- Run this after existing schema is in place

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color_value VARCHAR(7) DEFAULT '#3B82F6', -- Default blue color
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name) -- Prevent duplicate category names per user
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Add category_id foreign key to lists table (keeping category text for backwards compatibility during migration)
ALTER TABLE lists ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Add category_id foreign key to notes table (keeping category text for backwards compatibility during migration)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Create indexes for the foreign keys
CREATE INDEX IF NOT EXISTS idx_lists_category_id ON lists(category_id);
CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);

-- Insert default categories for existing users
-- This will create "General" category for each user and populate category_ids
DO $$
DECLARE
    user_record RECORD;
    general_category_id INTEGER;
BEGIN
    -- For each user, create a "General" category
    FOR user_record IN SELECT DISTINCT id FROM users LOOP
        -- Insert General category if it doesn't exist
        INSERT INTO categories (user_id, name, color_value)
        VALUES (user_record.id, 'General', '#6B7280')
        ON CONFLICT (user_id, name) DO NOTHING
        RETURNING id INTO general_category_id;
        
        -- If category already existed, get its id
        IF general_category_id IS NULL THEN
            SELECT id INTO general_category_id 
            FROM categories 
            WHERE user_id = user_record.id AND name = 'General';
        END IF;
        
        -- Create categories from existing list types
        INSERT INTO categories (user_id, name, color_value)
        SELECT DISTINCT user_record.id, category, '#3B82F6'
        FROM lists 
        WHERE user_id = user_record.id 
        AND category IS NOT NULL 
        AND category != '' 
        AND category != 'General'
        ON CONFLICT (user_id, name) DO NOTHING;
        
        -- Create categories from existing note categories
        INSERT INTO categories (user_id, name, color_value)
        SELECT DISTINCT user_record.id, category, '#10B981'
        FROM notes 
        WHERE user_id = user_record.id 
        AND category IS NOT NULL 
        AND category != '' 
        AND category != 'General'
        ON CONFLICT (user_id, name) DO NOTHING;
        
        -- Update lists to reference category_id
        UPDATE lists 
        SET category_id = c.id
        FROM categories c
        WHERE lists.user_id = user_record.id 
        AND lists.category = c.name 
        AND c.user_id = user_record.id;
        
        -- Set remaining lists without matching category to General
        UPDATE lists 
        SET category_id = general_category_id
        WHERE user_id = user_record.id 
        AND category_id IS NULL;
        
        -- Update notes to reference category_id
        UPDATE notes 
        SET category_id = c.id
        FROM categories c
        WHERE notes.user_id = user_record.id 
        AND notes.category = c.name 
        AND c.user_id = user_record.id;
        
        -- Set remaining notes without matching category to General
        UPDATE notes 
        SET category_id = general_category_id
        WHERE user_id = user_record.id 
        AND category_id IS NULL;
        
    END LOOP;
END $$;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_categories_updated_at ON categories;
CREATE TRIGGER trigger_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_categories_updated_at();

-- Insert sample categories for testing
-- This should only run if no categories exist yet
INSERT INTO categories (user_id, name, color_value) 
SELECT u.id, 'Work', '#EF4444'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id = u.id AND name = 'Work')
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO categories (user_id, name, color_value) 
SELECT u.id, 'Personal', '#8B5CF6'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id = u.id AND name = 'Personal')
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO categories (user_id, name, color_value) 
SELECT u.id, 'Shopping', '#F59E0B'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id = u.id AND name = 'Shopping')
ON CONFLICT (user_id, name) DO NOTHING;

RAISE NOTICE 'Categories migration completed successfully'; 