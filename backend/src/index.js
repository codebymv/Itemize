// Load environment variables first, before any other imports
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
// Import database models with Sequelize
const { sequelize, User, List, initializeDatabase } = require('./models');
// Now import auth module after environment variables are loaded
const { router: authRouter, authenticateJWT } = require('./auth');

const app = express();
const port = process.env.PORT || 3001;

// Sequelize is now handling the database connection in models.js

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
app.get('/api/lists', authenticateJWT, async (req, res) => {
  try {
    const lists = await List.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new list
app.post('/api/lists', authenticateJWT, async (req, res) => {
  try {
    const { title, category, items } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const list = await List.create({
      title,
      category: category || 'General',
      items: items || [],
      userId: req.user.id
    });
    
    res.status(201).json(list);
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a list
app.put('/api/lists/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, items } = req.body;
    
    const list = await List.findOne({
      where: { 
        id: id,
        userId: req.user.id // Ensure user can only update their own lists
      }
    });
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    list.title = title;
    list.category = category;
    list.items = items;
    await list.save();
    
    res.json(list);
  } catch (error) {
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a list
app.delete('/api/lists/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    
    const list = await List.findOne({
      where: { 
        id: id,
        userId: req.user.id // Ensure user can only delete their own lists
      }
    });
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    await list.destroy();
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

// Initialize database with Sequelize before starting server
initializeDatabase().then((dbInitialized) => {
  if (dbInitialized) {
    console.log('Database initialized successfully');
  } else {
    console.warn('Database initialization failed, using fallback mode');
  }
  
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});