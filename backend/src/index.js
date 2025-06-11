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

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

app.use(cors({
  origin: process.env.FRONTEND_URL || (
    process.env.NODE_ENV === 'production' 
      ? 'https://itemize.cloud' 
      : 'http://localhost:5173'
  ),
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
          // Make sure to include color_value in the results
          const result = await client.query(
            'SELECT id, title, category, items, created_at, updated_at, user_id, color_value FROM lists WHERE user_id = $1 ORDER BY id DESC',
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
          const { title, category, items, color_value } = req.body;
          
          if (!title) {
            return res.status(400).json({ error: 'Title is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'INSERT INTO lists (title, category, items, user_id, color_value) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [title, category || 'General', JSON.stringify(items || []), req.user.id, color_value || null]
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
          const { title, category, items, color_value } = req.body;
          
          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE lists SET title = $1, category = $2, items = $3, color_value = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
            [title, category, JSON.stringify(items), color_value, id, req.user.id]
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
      
      // Get all lists for canvas view with positions
      app.get('/api/canvas/lists', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
          );
          client.release();
          
          // Map database field 'category' to frontend field 'type'
          const mappedLists = result.rows.map(list => ({
            ...list,
            type: list.category // Map category to type for frontend
          }));
          
          res.json(mappedLists);
        } catch (error) {
          console.error('Error fetching lists for canvas:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });
      
      // Update list position for canvas view
      app.put('/api/lists/:id/position', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { x, y } = req.body;
          
          if (typeof x !== 'number' || typeof y !== 'number') {
            return res.status(400).json({ error: 'Invalid position coordinates' });
          }
          
          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE lists SET position_x = $1, position_y = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
            [x, y, id, req.user.id]
          );
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
          }
          
          res.json(result.rows[0]);
        } catch (error) {
          console.error('Error updating list position:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });
      // --- Notes API Endpoints ---

      // Get all notes for the current user
      app.get('/api/notes', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT id, user_id, title, content, category, color_value, position_x, position_y, width, height, z_index, created_at, updated_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
          );
          client.release();
          res.json(result.rows);
        } catch (error) {
          console.error('Error fetching notes:', error);
          res.status(500).json({ error: 'Internal server error while fetching notes' });
        }
      });

      // Create a new note
      app.post('/api/notes', global.authenticateJWT, async (req, res) => {
        try {
          const { 
            title = 'Untitled Note', // Default title if not provided
            content = '', // Default to empty string if not provided
            category = 'General', // Default category
            color_value, // Will use DB default if null/undefined
            position_x, 
            position_y, 
            width,      // Will use DB default if null/undefined
            height,     // Will use DB default if null/undefined
            z_index     // Will use DB default if null/undefined
          } = req.body;

          // Basic validation for required canvas positions
          if (typeof position_x !== 'number' || typeof position_y !== 'number') {
            return res.status(400).json({ error: 'position_x and position_y are required and must be numbers.' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            `INSERT INTO notes (user_id, title, content, category, color_value, position_x, position_y, width, height, z_index) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
              req.user.id, 
              title,
              content, 
              category,
              color_value, // Let DB handle default if undefined
              position_x, 
              position_y, 
              width,       // Let DB handle default if undefined
              height,      // Let DB handle default if undefined
              z_index      // Let DB handle default if undefined
            ]
          );
          client.release();
          res.status(201).json(result.rows[0]);
        } catch (error) {
          console.error('Error creating note:', error);
          res.status(500).json({ error: 'Internal server error while creating note' });
        }
      });

      // Update an existing note
      app.put('/api/notes/:noteId', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const { title, content, category, color_value, position_x, position_y, width, height, z_index } = req.body;

          // Fetch the current note to get existing values for fields not being updated
          const client = await actualPool.connect();
          const currentNoteResult = await client.query('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [noteId, req.user.id]);

          if (currentNoteResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Note not found or access denied' });
          }
          
          const currentNote = currentNoteResult.rows[0];

          // Prepare new values, using current values as fallback if not provided in request
          const newTitle = title !== undefined ? title : currentNote.title;
          const newContent = content !== undefined ? content : currentNote.content;
          const newCategory = category !== undefined ? category : currentNote.category;
          const newColorValue = color_value !== undefined ? color_value : currentNote.color_value;
          const newPositionX = position_x !== undefined ? position_x : currentNote.position_x;
          const newPositionY = position_y !== undefined ? position_y : currentNote.position_y;
          const newWidth = width !== undefined ? width : currentNote.width;
          const newHeight = height !== undefined ? height : currentNote.height;
          const newZIndex = z_index !== undefined ? z_index : currentNote.z_index;

          const updateResult = await client.query(
            `UPDATE notes 
             SET title = $1, content = $2, category = $3, color_value = $4, position_x = $5, position_y = $6, width = $7, height = $8, z_index = $9 
             WHERE id = $10 AND user_id = $11 RETURNING *`,
            [newTitle, newContent, newCategory, newColorValue, newPositionX, newPositionY, newWidth, newHeight, newZIndex, noteId, req.user.id]
          );
          client.release();
          
          // The updated_at field is handled automatically by the database trigger.
          res.json(updateResult.rows[0]);
        } catch (error) {
          console.error('Error updating note:', error);
          res.status(500).json({ error: 'Internal server error while updating note' });
        }
      });

      // Delete a note
      app.delete('/api/notes/:noteId', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const client = await actualPool.connect();
          const result = await client.query(
            'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
            [noteId, req.user.id]
          );
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
          }
          res.status(200).json({ message: 'Note deleted successfully' });
        } catch (error) {
          console.error('Error deleting note:', error);
          res.status(500).json({ error: 'Internal server error while deleting note' });
        }
      });
      
      console.log('✅ Notes API routes initialized');

      console.log('✅ Lists API routes initialized'); // This line might be redundant now or could be moved after notes init log
      
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
