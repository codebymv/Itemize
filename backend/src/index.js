// Load environment variables first, before any other imports
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
// Import database models
const { sequelize, initializeModels } = require('./models');
// Now import auth module after environment variables are loaded
const { router: authRouter, authenticateJWT } = require('./auth');

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Auth routes
app.use('/api/auth', authRouter);

// Health check endpoint for Railway deployment
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

// Backward compatibility for local development
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get all lists
app.get('/api/lists', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lists ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new list
app.post('/api/lists', async (req, res) => {
  try {
    const { title, category, items } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await pool.query(
      'INSERT INTO lists (title, category, items) VALUES ($1, $2, $3) RETURNING *',
      [title, category || 'General', JSON.stringify(items || [])]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a list
app.put('/api/lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, items } = req.body;
    
    const result = await pool.query(
      'UPDATE lists SET title = $1, category = $2, items = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [title, category, JSON.stringify(items), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a list
app.delete('/api/lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM lists WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database models before starting server
initializeModels().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});