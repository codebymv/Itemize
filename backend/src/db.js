const { Pool } = require('pg');

// Connection configuration with better error handling
const createDbConnection = () => {
  try {
    // For Railway deployments, prefer connection pooler approach
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Supabase connections
      },
      // Add explicit connection parameters for better stability
      max: 5,              // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
      connectionTimeoutMillis: 5000, // How long to wait for a connection to become available
    });

    // Test the connection
    pool.on('connect', (client) => {
      console.log('Connected to PostgreSQL database');
    });

    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      // Don't crash on connection errors, but log them
    });

    return pool;
  } catch (error) {
    console.error('Error setting up database connection:', error);
    return null;
  }
};

// Create database tables if they don't exist
const initializeDatabase = async (pool) => {
  if (!pool) {
    console.log('No database connection, using in-memory storage');
    return false;
  }

  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        picture TEXT,
        "googleId" VARCHAR(255),
        provider VARCHAR(50) DEFAULT 'google',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create lists table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lists (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(255) DEFAULT 'General',
        items JSONB DEFAULT '[]'::jsonb,
        "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
};

// User operations
const userOperations = {
  // Find a user by ID
  findById: async (pool, id) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      return null;
    }
  },

  // Find a user by email
  findByEmail: async (pool, email) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  },

  // Find or create a user (for OAuth)
  findOrCreate: async (pool, userData) => {
    try {
      // Try to find the user first
      let user = await userOperations.findByEmail(pool, userData.email);
      
      // If user exists, update their info
      if (user) {
        const updateResult = await pool.query(
          `UPDATE users SET 
            name = $1, 
            picture = $2, 
            "googleId" = $3,
            "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $4 RETURNING *`,
          [userData.name, userData.picture, userData.googleId, user.id]
        );
        return updateResult.rows[0];
      }
      
      // Otherwise create a new user
      const createResult = await pool.query(
        `INSERT INTO users (email, name, picture, "googleId", provider) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [userData.email, userData.name, userData.picture, userData.googleId, userData.provider || 'google']
      );
      
      return createResult.rows[0];
    } catch (error) {
      console.error('Error finding or creating user:', error);
      return null;
    }
  }
};

// List operations
const listOperations = {
  // Find all lists for a user
  findAllByUserId: async (pool, userId) => {
    try {
      const result = await pool.query(
        'SELECT * FROM lists WHERE "userId" = $1 ORDER BY "createdAt" DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding lists by user ID:', error);
      return [];
    }
  },

  // Find one list by ID (and optionally verify user ownership)
  findById: async (pool, listId, userId = null) => {
    try {
      let query = 'SELECT * FROM lists WHERE id = $1';
      let params = [listId];
      
      // If userId provided, verify ownership
      if (userId) {
        query += ' AND "userId" = $2';
        params.push(userId);
      }
      
      const result = await pool.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  },

  // Create a new list
  create: async (pool, listData) => {
    try {
      const result = await pool.query(
        `INSERT INTO lists (title, category, items, "userId") 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [
          listData.title,
          listData.category || 'General',
          JSON.stringify(listData.items || []),
          listData.userId
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating list:', error);
      return null;
    }
  },

  // Update an existing list
  update: async (pool, listId, userId, listData) => {
    try {
      const result = await pool.query(
        `UPDATE lists SET 
          title = $1, 
          category = $2, 
          items = $3,
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $4 AND "userId" = $5
         RETURNING *`,
        [
          listData.title,
          listData.category,
          JSON.stringify(listData.items),
          listId,
          userId
        ]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating list:', error);
      return null;
    }
  },

  // Delete a list
  delete: async (pool, listId, userId) => {
    try {
      const result = await pool.query(
        'DELETE FROM lists WHERE id = $1 AND "userId" = $2 RETURNING id',
        [listId, userId]
      );
      return result.rows[0] ? true : false;
    } catch (error) {
      console.error('Error deleting list:', error);
      return false;
    }
  }
};

module.exports = {
  createDbConnection,
  initializeDatabase,
  userOperations,
  listOperations
};
