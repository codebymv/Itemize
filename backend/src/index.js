// Load environment variables first, before any other imports
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
// Import our new database module using pg directly
const { createDbConnection, initializeDatabase, userOperations, listOperations } = require('./db');
// Now import auth module after environment variables are loaded
const { router: authRouter, authenticateJWT } = require('./auth');
// Import AI suggestion service
const aiSuggestionService = require('./services/aiSuggestionService');

const app = express();
const port = process.env.PORT || 3001;

// Initialize database connection
const pool = createDbConnection();

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Auth routes - pass database pool to auth router
app.use('/api/auth', (req, res, next) => {
  req.dbPool = pool;
  next();
}, authRouter);

// Health check endpoints for Railway deployment
// Define these early so they work even if other parts of the app have issues

// Primary health check endpoint at /health for Railway
app.get('/health', (req, res) => {
  // Return OK even if database connection is not available
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    dbConnected: !!pool,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Also support /api/health for API consistency
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    dbConnected: !!pool,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all lists
app.get('/api/lists', authenticateJWT, async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }
    
    const lists = await listOperations.findAllByUserId(pool, req.user.id);
    res.json(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new list
app.post('/api/lists', authenticateJWT, async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const { title, category, items } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const list = await listOperations.create(pool, {
      title,
      category: category || 'General',
      items: items || [],
      userId: req.user.id
    });
    
    if (!list) {
      return res.status(500).json({ error: 'Failed to create list' });
    }
    
    res.status(201).json(list);
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a list
app.put('/api/lists/:id', authenticateJWT, async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const { id } = req.params;
    const { title, category, items } = req.body;
    
    // First check if the list exists and belongs to the user
    const existingList = await listOperations.findById(pool, id, req.user.id);
    
    if (!existingList) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    // Update the list
    const updatedList = await listOperations.update(pool, id, req.user.id, {
      title,
      category,
      items
    });
    
    if (!updatedList) {
      return res.status(500).json({ error: 'Failed to update list' });
    }
    
    res.json(updatedList);
  } catch (error) {
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a list
app.delete('/api/lists/:id', authenticateJWT, async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const { id } = req.params;
    
    // Delete the list and verify ownership in one operation
    const success = await listOperations.delete(pool, id, req.user.id);
    
    if (!success) {
      return res.status(404).json({ error: 'List not found or could not be deleted' });
    }
    
    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AI suggestions endpoint
app.post('/api/suggestions', authenticateJWT, async (req, res) => {
  try {
    const { listTitle, existingItems } = req.body;
    
    if (!listTitle || !Array.isArray(existingItems)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const result = await aiSuggestionService.suggestListItems(listTitle, existingItems);
    res.json(result);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
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

// Initialize AI suggestion service first - this doesn't depend on the database
aiSuggestionService.initialize();

// Initialize the database connection before fully starting the server
async function startServer() {
  try {
    // Parse PORT as a number (Railway provides this automatically)
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber)) {
      console.error(`Invalid PORT value: ${port}`);
      process.exit(1);
    }
    
    // Check if we have a valid pool
    if (pool) {
      const dbInitialized = await initializeDatabase(pool);
      if (dbInitialized) {
        console.log('Database schema initialized successfully');
      } else {
        console.log('Database initialization failed');
      }
    } else {
      console.warn('No database connection, skipping initialization');
    }
    
    // Print all environment variables without sensitive values for debugging
    console.log('Environment variables:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`  PORT: ${portNumber}`);
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '[REDACTED]' : 'not set'}`);
    console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
    console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '[REDACTED]' : 'not set'}`);
    console.log(`  JWT_SECRET: ${process.env.JWT_SECRET ? '[REDACTED]' : 'not set'}`);
    console.log(`  GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '[REDACTED]' : 'not set'}`);
    console.log('------------------------------');
    
    // Start the server with more explicit binding
    // Railway dynamically assigns a port that the app needs to listen on
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port} (${new Date().toISOString()})`);
      console.log('Health check endpoints:');
      console.log('  - /health');
      console.log('  - /api/health');
    });
    
    // Add error handler for the server
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();