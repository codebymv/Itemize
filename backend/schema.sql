-- Create lists table
CREATE TABLE IF NOT EXISTS lists (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE -- For future OAuth integration
);

-- Create users table (for future OAuth integration)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    provider VARCHAR(50) NOT NULL, -- 'google', 'github', etc.
    provider_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_created_at ON lists(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);

-- Add some sample data (optional)
INSERT INTO lists (title, category, items) VALUES 
('Grocery Shopping', 'Shopping', '[{"id":1,"text":"Milk","completed":false},{"id":2,"text":"Bread","completed":false},{"id":3,"text":"Eggs","completed":true}]'),
('Weekend Tasks', 'Personal', '[{"id":1,"text":"Clean the house","completed":false},{"id":2,"text":"Do laundry","completed":true}]'),
('Work Projects', 'Work', '[{"id":1,"text":"Finish presentation","completed":false},{"id":2,"text":"Review code","completed":false}]')
ON CONFLICT DO NOTHING;