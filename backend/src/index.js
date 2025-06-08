// Load environment variables first, before any other imports
require('dotenv').config();

// Import necessary packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Log startup
console.log(`Starting server on port ${port} at ${new Date().toISOString()}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '[REDACTED]' : 'not set'}`);

// Basic middleware that won't break anything
app.use(express.json());
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Set up health check endpoint for Railway - KEEP THIS WORKING
app.get('/health', (req, res) => {
  console.log('Health check hit at:', new Date().toISOString());
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Also support /api/health for consistency
app.get('/api/health', (req, res) => {
  console.log('API Health check hit at:', new Date().toISOString());
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server - KEEP BINDING TO 0.0.0.0 for Railway
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log('Health check endpoints available at:');
  console.log('  - /health');
  console.log('  - /api/health');
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});

// Deferred initialization for other services
setTimeout(async () => {
  console.log('Starting deferred initialization...');
  
  // Try to initialize the database but don't let it crash the server
  try {
    console.log('Initializing database connection...');
    const db = require('./db');
    const actualPool = db.createDbConnection(); // Call function to get pool
    let databaseInitialized = false;

    if (actualPool) {
      try {
        console.log('Attempting to initialize database schema with actualPool...');
        await db.initializeDatabase(actualPool); // Pass the created pool
        console.log('✅ Database schema initialized via actualPool');
        databaseInitialized = true;
      } catch (initError) {
        console.error('❌ Error initializing database schema with actualPool:', initError.message, initError.stack);
      }
    } else {
      console.warn('⚠️ Database pool (actualPool) not obtained. Operations requiring DB may fail.');
    }

    // Initialize auth routes
    if (actualPool) {
        try {
            console.log('Initializing auth routes...');
            const { router: authRouter, authenticateJWT: authMiddleware } = require('./auth');
            
            // Middleware to make dbPool available to auth routes
            app.use((req, res, next) => {
                req.dbPool = actualPool;
                next();
            });
            
            app.use('/api/auth', authRouter);
            console.log('✅ Auth routes initialized and mounted on /api/auth');
            
            // Make authenticateJWT available for other routes
            // Ensure this doesn't conflict if authenticateJWT was already defined globally
            // For clarity, we'll use the imported authMiddleware for list routes
            global.authenticateJWT = authMiddleware; // Or pass it around as needed

        } catch (authInitError) {
            console.error('Failed to initialize auth routes:', authInitError.message);
        }
    } else {
        console.warn('Skipping auth routes initialization due to missing pool.');
    }
      
      // Get all lists
      // Ensure authenticateJWT is correctly referenced. If it's now global.authenticateJWT or authMiddleware
      app.get('/api/lists', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
          );
          client.release();
          res.json(result.rows);
        } catch (error) {
          console.error('Error fetching lists:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Create a new list
      app.post('/api/lists', global.authenticateJWT, async (req, res) => {
        try {
          const { title, category, items } = req.body;
          
          if (!title) {
            return res.status(400).json({ error: 'Title is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'INSERT INTO lists (title, category, items, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, category || 'General', JSON.stringify(items || []), req.user.id]
          );
          client.release();
          
          res.status(201).json(result.rows[0]);
        } catch (error) {
          console.error('Error creating list:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Update a list
      app.put('/api/lists/:id', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { title, category, items } = req.body;
          
          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE lists SET title = $1, category = $2, items = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
            [title, category, JSON.stringify(items), id, req.user.id]
          );
          client.release();
          
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
      app.delete('/api/lists/:id', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          
          const client = await actualPool.connect();
          const result = await client.query(
            'DELETE FROM lists WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
          );
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
          }
          
          res.json({ message: 'List deleted successfully' });
        } catch (error) {
          console.error('Error deleting list:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });
      
      console.log('✅ Lists API routes initialized');
      
      // Try to initialize AI suggestion service
      try {
        console.log('Initializing AI suggestion service...');
        const aiSuggestionService = require('./services/aiSuggestionService');
        
        // AI suggestions endpoint
        app.post('/api/suggestions', global.authenticateJWT, async (req, res) => {
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
        
        console.log('✅ AI suggestion service initialized with API key:', process.env.GEMINI_API_KEY ? '[REDACTED]' : 'not set');
      } catch (aiError) {
        console.error('Failed to initialize AI suggestion service:', aiError.message);
        // Continue running even if AI service fails
      }
    
    
  } catch (dbError) {
    console.error('Database connection error:', dbError.message);
    console.log('Server will continue running for health checks');
  }
  
  // 404 handler - MUST be registered after all valid routes
  app.use('*', (req, res) => {
    res.status(200).send('Server is running. Use /health or /api/health to check status.');
  });
  
  console.log('✅ All routes registered, including catch-all handler');
}, 500); // Wait a bit to ensure server is up first
