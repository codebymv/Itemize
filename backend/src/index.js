// Load environment variables first, before any other imports
require('dotenv').config();

// Import necessary packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Set up DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

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

// Force HTTPS in production (but exclude health checks)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip HTTPS redirect for health check endpoints
    if (req.path === '/health' || req.path === '/api/health') {
      return next();
    }
    
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

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

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



// Docs routes
const docsRoutes = require('./routes/docs');
app.use('/docs', docsRoutes); // Mounted at /docs

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
            // For clarity, we'll use the imported authMiddleware for list routes
            global.authenticateJWT = authMiddleware; // Or pass it around as needed

        } catch (authInitError) {
            console.error('Failed to initialize auth routes:', authInitError.message);
        }
    } else {
        console.warn('Skipping auth routes initialization due to missing pool.');
    }
      
      // Get all lists
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
          const { title, category, type, items, color_value, position_x, position_y, width, height } = req.body;
          
          if (!title) {
            return res.status(400).json({ error: 'Title is required' });
          }

          // Handle both 'category' and 'type' field names for compatibility
          const categoryValue = category || type || 'General';

          const client = await actualPool.connect();
          const result = await client.query(
            'INSERT INTO lists (title, category, items, user_id, color_value, position_x, position_y, width, height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [
              title, 
              categoryValue, 
              JSON.stringify(items || []), 
              req.user.id, 
              color_value || null,
              position_x || 0, // Default to 0 if not provided
              position_y || 0, // Default to 0 if not provided
              width || 340,    // Default width
              height || 265    // Default height
            ]
          );
          client.release();
          
          // Map database field 'category' to frontend field 'type' for consistency
          const mappedResult = {
            ...result.rows[0],
            type: result.rows[0].category
          };
          
          res.status(201).json(mappedResult);
        } catch (error) {
          console.error('Error creating list:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Update a list
      app.put('/api/lists/:id', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { title, category, type, items, color_value, width, height } = req.body;
          
          // Handle both 'category' and 'type' field names for compatibility
          const categoryValue = category || type || 'General';
          
          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE lists SET title = $1, category = $2, items = $3, color_value = $4, width = $5, height = $6 WHERE id = $7 AND user_id = $8 RETURNING *',
            [title, categoryValue, JSON.stringify(items), color_value, width, height, id, req.user.id]
          );
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
          }
          
          // Map database field 'category' to frontend field 'type' for consistency
          const mappedResult = {
            ...result.rows[0],
            type: result.rows[0].category
          };
          
          res.json(mappedResult);
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
            title, 
            content = '', // Default empty content
            category = 'General', // Default category
            position_x, 
            position_y, 
            width, 
            height,
            z_index = 0, 
            color_value = '#3B82F6' // Default border color
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

      // --- Whiteboards API Endpoints ---

      // Get all whiteboards for the current user
      app.get('/api/whiteboards', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT id, user_id, title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value, created_at, updated_at FROM whiteboards WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
          );
          client.release();
          res.json(result.rows);
        } catch (error) {
          console.error('Error fetching whiteboards:', error);
          res.status(500).json({ error: 'Internal server error while fetching whiteboards' });
        }
      });

      // Create a new whiteboard
      app.post('/api/whiteboards', global.authenticateJWT, async (req, res) => {
        try {
          const {
            title,
            category = 'General',
            canvas_data = '{"paths": [], "shapes": []}',
            canvas_width,
            canvas_height,
            background_color = '#FFFFFF',
            position_x,
            position_y,
            z_index = 0,
            color_value = '#3B82F6'
          } = req.body;

          if (typeof position_x !== 'number' || typeof position_y !== 'number') {
            return res.status(400).json({ error: 'position_x and position_y are required and must be numbers.' });
          }

          // Validate and process canvas_data
          let processedCanvasData;
          try {
            if (typeof canvas_data === 'string') {
              // Validate that it's valid JSON
              JSON.parse(canvas_data);
              processedCanvasData = canvas_data;
            } else {
              // If it's an object/array, stringify it
              const jsonString = JSON.stringify(canvas_data);
              // Validate the result
              JSON.parse(jsonString);
              processedCanvasData = jsonString;
            }
          } catch (jsonError) {
            console.error('Invalid canvas data JSON on create:', jsonError, { canvas_data });
            return res.status(400).json({ error: 'Invalid canvas data format' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            `INSERT INTO whiteboards (user_id, title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
              req.user.id,
              title,
              category,
              processedCanvasData,
              canvas_width,
              canvas_height,
              background_color,
              position_x,
              position_y,
              z_index,
              color_value
            ]
          );
          client.release();
          res.status(201).json(result.rows[0]);
        } catch (error) {
          console.error('Error creating whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while creating whiteboard' });
        }
      });

      // Update an existing whiteboard
      app.put('/api/whiteboards/:whiteboardId', global.authenticateJWT, async (req, res) => {
        try {
          const { whiteboardId } = req.params;
          const { title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value } = req.body;

          const client = await actualPool.connect();
          const currentWhiteboardResult = await client.query('SELECT * FROM whiteboards WHERE id = $1 AND user_id = $2', [whiteboardId, req.user.id]);

          if (currentWhiteboardResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }

          const currentWhiteboard = currentWhiteboardResult.rows[0];

          const newTitle = title !== undefined ? title : currentWhiteboard.title;
          const newCategory = category !== undefined ? category : currentWhiteboard.category;
          
          // Properly handle canvas_data with validation
          let newCanvasData = currentWhiteboard.canvas_data;
          if (canvas_data !== undefined) {
            try {
              // If canvas_data is already a string, don't double-stringify
              if (typeof canvas_data === 'string') {
                // Validate that it's valid JSON
                JSON.parse(canvas_data);
                newCanvasData = canvas_data;
              } else {
                // If it's an object/array, stringify it
                const jsonString = JSON.stringify(canvas_data);
                // Validate the result
                JSON.parse(jsonString);
                newCanvasData = jsonString;
              }
            } catch (jsonError) {
              console.error('Invalid canvas data JSON:', jsonError, { canvas_data });
              client.release();
              return res.status(400).json({ error: 'Invalid canvas data format' });
            }
          }
          
          const newCanvasWidth = canvas_width !== undefined ? canvas_width : currentWhiteboard.canvas_width;
          const newCanvasHeight = canvas_height !== undefined ? canvas_height : currentWhiteboard.canvas_height;
          const newBackgroundColor = background_color !== undefined ? background_color : currentWhiteboard.background_color;
          const newPositionX = position_x !== undefined ? position_x : currentWhiteboard.position_x;
          const newPositionY = position_y !== undefined ? position_y : currentWhiteboard.position_y;
          const newZIndex = z_index !== undefined ? z_index : currentWhiteboard.z_index;
          const newColorValue = color_value !== undefined ? color_value : currentWhiteboard.color_value;

          const updateResult = await client.query(
            `UPDATE whiteboards 
             SET title = $1, category = $2, canvas_data = $3, canvas_width = $4, canvas_height = $5, background_color = $6, position_x = $7, position_y = $8, z_index = $9, color_value = $10 
             WHERE id = $11 AND user_id = $12 RETURNING *`,
            [newTitle, newCategory, newCanvasData, newCanvasWidth, newCanvasHeight, newBackgroundColor, newPositionX, newPositionY, newZIndex, newColorValue, whiteboardId, req.user.id]
          );
          client.release();
          res.json(updateResult.rows[0]);
        } catch (error) {
          console.error('Error updating whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while updating whiteboard' });
        }
      });

      // Delete a whiteboard
      app.delete('/api/whiteboards/:whiteboardId', global.authenticateJWT, async (req, res) => {
        try {
          const { whiteboardId } = req.params;
          const client = await actualPool.connect();
          const result = await client.query(
            'DELETE FROM whiteboards WHERE id = $1 AND user_id = $2 RETURNING id',
            [whiteboardId, req.user.id]
          );
          client.release();
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }
          res.status(200).json({ message: 'Whiteboard deleted successfully' });
        } catch (error) {
          console.error('Error deleting whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while deleting whiteboard' });
        }
      });

      console.log('✅ Whiteboards API routes initialized');

      // --- Sharing API Endpoints ---

      // Helper function to sanitize content for public sharing
      const sanitizeContent = (content) => {
        if (typeof content === 'string') {
          return purify.sanitize(content);
        }
        if (typeof content === 'object' && content !== null) {
          const sanitized = {};
          for (const [key, value] of Object.entries(content)) {
            if (typeof value === 'string') {
              sanitized[key] = purify.sanitize(value);
            } else {
              sanitized[key] = value;
            }
          }
          return sanitized;
        }
        return content;
      };

      // Helper function to get user info for attribution
      const getUserInfo = async (userId, client) => {
        const userResult = await client.query('SELECT name, email FROM users WHERE id = $1', [userId]);
        return userResult.rows[0] || { name: 'Anonymous', email: null };
      };

      // Share a list - generate or get existing share token
      app.post('/api/lists/:listId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { listId } = req.params;
          const client = await actualPool.connect();

          // Check if list exists and belongs to user
          const listResult = await client.query(
            'SELECT id, share_token, is_public FROM lists WHERE id = $1 AND user_id = $2',
            [listId, req.user.id]
          );

          if (listResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'List not found or access denied' });
          }

          const list = listResult.rows[0];
          let shareToken = list.share_token;

          // Generate new token if doesn't exist
          if (!shareToken) {
            shareToken = require('crypto').randomUUID();
            await client.query(
              'UPDATE lists SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
              [shareToken, listId]
            );
          } else if (!list.is_public) {
            // Re-enable sharing if it was disabled
            await client.query(
              'UPDATE lists SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
              [listId]
            );
          }

          client.release();

          // Generate frontend URL for sharing
          const frontendHost = process.env.NODE_ENV === 'production'
            ? 'itemize.cloud' // Use the actual frontend domain in production
            : 'localhost:5173'; // Frontend dev server port

          res.json({
            shareToken,
            shareUrl: `${req.protocol}://${frontendHost}/shared/list/${shareToken}`
          });
        } catch (error) {
          console.error('Error sharing list:', error);
          res.status(500).json({ error: 'Internal server error while sharing list' });
        }
      });

      // Share a note - generate or get existing share token
      app.post('/api/notes/:noteId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const client = await actualPool.connect();

          // Check if note exists and belongs to user
          const noteResult = await client.query(
            'SELECT id, share_token, is_public FROM notes WHERE id = $1 AND user_id = $2',
            [noteId, req.user.id]
          );

          if (noteResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Note not found or access denied' });
          }

          const note = noteResult.rows[0];
          let shareToken = note.share_token;

          // Generate new token if doesn't exist
          if (!shareToken) {
            shareToken = require('crypto').randomUUID();
            await client.query(
              'UPDATE notes SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
              [shareToken, noteId]
            );
          } else if (!note.is_public) {
            // Re-enable sharing if it was disabled
            await client.query(
              'UPDATE notes SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
              [noteId]
            );
          }

          client.release();

          // Generate frontend URL for sharing
          const frontendHost = process.env.NODE_ENV === 'production'
            ? 'itemize.cloud' // Use the actual frontend domain in production
            : 'localhost:5173'; // Frontend dev server port

          res.json({
            shareToken,
            shareUrl: `${req.protocol}://${frontendHost}/shared/note/${shareToken}`
          });
        } catch (error) {
          console.error('Error sharing note:', error);
          res.status(500).json({ error: 'Internal server error while sharing note' });
        }
      });

      // Share a whiteboard - generate or get existing share token
      app.post('/api/whiteboards/:whiteboardId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { whiteboardId } = req.params;
          const client = await actualPool.connect();

          // Check if whiteboard exists and belongs to user
          const whiteboardResult = await client.query(
            'SELECT id, share_token, is_public FROM whiteboards WHERE id = $1 AND user_id = $2',
            [whiteboardId, req.user.id]
          );

          if (whiteboardResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }

          const whiteboard = whiteboardResult.rows[0];
          let shareToken = whiteboard.share_token;

          // Generate new token if doesn't exist
          if (!shareToken) {
            shareToken = require('crypto').randomUUID();
            await client.query(
              'UPDATE whiteboards SET share_token = $1, is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $2',
              [shareToken, whiteboardId]
            );
          } else if (!whiteboard.is_public) {
            // Re-enable sharing if it was disabled
            await client.query(
              'UPDATE whiteboards SET is_public = TRUE, shared_at = CURRENT_TIMESTAMP WHERE id = $1',
              [whiteboardId]
            );
          }

          client.release();

          // Generate frontend URL for sharing
          const frontendHost = process.env.NODE_ENV === 'production'
            ? 'itemize.cloud' // Use the actual frontend domain in production
            : 'localhost:5173'; // Frontend dev server port

          res.json({
            shareToken,
            shareUrl: `${req.protocol}://${frontendHost}/shared/whiteboard/${shareToken}`
          });
        } catch (error) {
          console.error('Error sharing whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while sharing whiteboard' });
        }
      });

      // Unshare a list - revoke sharing
      app.delete('/api/lists/:listId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { listId } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(
            'UPDATE lists SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
            [listId, req.user.id]
          );

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found or access denied' });
          }

          res.json({ message: 'List sharing revoked successfully' });
        } catch (error) {
          console.error('Error unsharing list:', error);
          res.status(500).json({ error: 'Internal server error while unsharing list' });
        }
      });

      // Unshare a note - revoke sharing
      app.delete('/api/notes/:noteId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(
            'UPDATE notes SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
            [noteId, req.user.id]
          );

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
          }

          res.json({ message: 'Note sharing revoked successfully' });
        } catch (error) {
          console.error('Error unsharing note:', error);
          res.status(500).json({ error: 'Internal server error while unsharing note' });
        }
      });

      // Unshare a whiteboard - revoke sharing
      app.delete('/api/whiteboards/:whiteboardId/share', global.authenticateJWT, async (req, res) => {
        try {
          const { whiteboardId } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(
            'UPDATE whiteboards SET is_public = FALSE WHERE id = $1 AND user_id = $2 RETURNING id',
            [whiteboardId, req.user.id]
          );

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }

          res.json({ message: 'Whiteboard sharing revoked successfully' });
        } catch (error) {
          console.error('Error unsharing whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while unsharing whiteboard' });
        }
      });

      // Public endpoint to get shared list (with rate limiting)
      app.get('/api/shared/list/:token', publicRateLimit, async (req, res) => {
        try {
          const { token } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(`
            SELECT l.id, l.title, l.category, l.items, l.color_value, l.created_at, l.updated_at,
                   u.name as creator_name
            FROM lists l
            JOIN users u ON l.user_id = u.id
            WHERE l.share_token = $1 AND l.is_public = TRUE
          `, [token]);

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shared content not found or no longer available' });
          }

          const list = result.rows[0];

          // Sanitize content before sending
          const sanitizedList = {
            id: list.id,
            title: sanitizeContent(list.title),
            category: sanitizeContent(list.category),
            items: list.items ? list.items.map(item => ({
              id: item.id,
              text: sanitizeContent(item.text),
              completed: item.completed
            })) : [],
            color_value: list.color_value,
            created_at: list.created_at,
            updated_at: list.updated_at,
            creator_name: sanitizeContent(list.creator_name),
            type: 'list'
          };

          res.json(sanitizedList);
        } catch (error) {
          console.error('Error fetching shared list:', error);
          res.status(500).json({ error: 'Internal server error while fetching shared content' });
        }
      });

      // Public endpoint to get shared note (with rate limiting)
      app.get('/api/shared/note/:token', publicRateLimit, async (req, res) => {
        try {
          const { token } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(`
            SELECT n.id, n.title, n.content, n.category, n.color_value, n.created_at, n.updated_at,
                   u.name as creator_name
            FROM notes n
            JOIN users u ON n.user_id = u.id
            WHERE n.share_token = $1 AND n.is_public = TRUE
          `, [token]);

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shared content not found or no longer available' });
          }

          const note = result.rows[0];

          // Sanitize content before sending
          const sanitizedNote = {
            id: note.id,
            title: sanitizeContent(note.title),
            content: sanitizeContent(note.content),
            category: sanitizeContent(note.category),
            color_value: note.color_value,
            created_at: note.created_at,
            updated_at: note.updated_at,
            creator_name: sanitizeContent(note.creator_name),
            type: 'note'
          };

          res.json(sanitizedNote);
        } catch (error) {
          console.error('Error fetching shared note:', error);
          res.status(500).json({ error: 'Internal server error while fetching shared content' });
        }
      });

      // Public endpoint to get shared whiteboard (with rate limiting)
      app.get('/api/shared/whiteboard/:token', publicRateLimit, async (req, res) => {
        try {
          const { token } = req.params;
          const client = await actualPool.connect();

          const result = await client.query(`
            SELECT w.id, w.title, w.category, w.canvas_data, w.canvas_width, w.canvas_height,
                   w.background_color, w.color_value, w.created_at, w.updated_at,
                   u.name as creator_name
            FROM whiteboards w
            JOIN users u ON w.user_id = u.id
            WHERE w.share_token = $1 AND w.is_public = TRUE
          `, [token]);

          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shared content not found or no longer available' });
          }

          const whiteboard = result.rows[0];

          // Sanitize content before sending
          const sanitizedWhiteboard = {
            id: whiteboard.id,
            title: sanitizeContent(whiteboard.title),
            category: sanitizeContent(whiteboard.category),
            canvas_data: sanitizeContent(whiteboard.canvas_data),
            canvas_width: whiteboard.canvas_width,
            canvas_height: whiteboard.canvas_height,
            background_color: whiteboard.background_color,
            color_value: whiteboard.color_value,
            created_at: whiteboard.created_at,
            updated_at: whiteboard.updated_at,
            creator_name: sanitizeContent(whiteboard.creator_name),
            type: 'whiteboard'
          };

          res.json(sanitizedWhiteboard);
        } catch (error) {
          console.error('Error fetching shared whiteboard:', error);
          res.status(500).json({ error: 'Internal server error while fetching shared content' });
        }
      });

      console.log('✅ Sharing API routes initialized');

      // --- Categories API Endpoints ---

      // Get all categories for the current user
      app.get('/api/categories', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          
          // Check if categories table exists
          const tableExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'categories'
            );
          `);
          
          if (!tableExists.rows[0].exists) {
            client.release();
            // Return legacy categories if new table doesn't exist
            return res.json([
              { id: 'general', name: 'General', color_value: '#6B7280' },
              { id: 'work', name: 'Work', color_value: '#EF4444' },
              { id: 'personal', name: 'Personal', color_value: '#8B5CF6' }
            ]);
          }
          
          const result = await client.query(
            'SELECT id, name, color_value, created_at, updated_at FROM categories WHERE user_id = $1 ORDER BY name ASC',
            [req.user.id]
          );
          client.release();
          res.json(result.rows);
        } catch (error) {
          console.error('Error fetching categories:', error);
          // Fallback to basic categories if there's an error
          res.json([
            { id: 'general', name: 'General', color_value: '#6B7280' },
            { id: 'work', name: 'Work', color_value: '#EF4444' },
            { id: 'personal', name: 'Personal', color_value: '#8B5CF6' }
          ]);
        }
      });

      // Create a new category
      app.post('/api/categories', global.authenticateJWT, async (req, res) => {
        try {
          const { name, color_value = '#3B82F6' } = req.body;
          
          if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'INSERT INTO categories (user_id, name, color_value) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, name.trim(), color_value]
          );
          client.release();
          
          res.status(201).json(result.rows[0]);
        } catch (error) {
          if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Category name already exists' });
          }
          console.error('Error creating category:', error);
          res.status(500).json({ error: 'Internal server error while creating category' });
        }
      });

      // Update a category
      app.put('/api/categories/:id', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { name, color_value } = req.body;
          
          if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE categories SET name = $1, color_value = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
            [name.trim(), color_value, id, req.user.id]
          );
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
          }
          
          res.json(result.rows[0]);
        } catch (error) {
          if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Category name already exists' });
          }
          console.error('Error updating category:', error);
          res.status(500).json({ error: 'Internal server error while updating category' });
        }
      });

      // Delete a category
      app.delete('/api/categories/:id', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          
          const client = await actualPool.connect();
          
          // Get General category for this user to reassign orphaned items
          const generalCategoryResult = await client.query(
            'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
            [req.user.id, 'General']
          );
          
          if (generalCategoryResult.rows.length === 0) {
            client.release();
            return res.status(400).json({ error: 'Cannot delete category: General category not found' });
          }
          
          const generalCategoryId = generalCategoryResult.rows[0].id;
          
          // Don't allow deleting the General category
          if (parseInt(id) === generalCategoryId) {
            client.release();
            return res.status(400).json({ error: 'Cannot delete the General category' });
          }
          
          // Reassign lists and notes to General category
          await client.query(
            'UPDATE lists SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
            [generalCategoryId, id, req.user.id]
          );
          
          await client.query(
            'UPDATE notes SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
            [generalCategoryId, id, req.user.id]
          );
          
          // Delete the category
          const result = await client.query(
            'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
          );
          
          client.release();
          
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
          }
          
          res.status(200).json({ message: 'Category deleted successfully' });
        } catch (error) {
          console.error('Error deleting category:', error);
          res.status(500).json({ error: 'Internal server error while deleting category' });
        }
      });

      console.log('✅ Categories API routes initialized');

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

      // Enhanced status endpoint for status page - placed after DB initialization
      app.get('/api/status', async (req, res) => {
        try {
          const status = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: '0.8.2',
            server: {
              port: port,
              memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB'
              },
              platform: process.platform,
              nodeVersion: process.version
            },
            services: {
              api: 'operational',
              database: 'operational',
              auth: 'operational'
            },
            endpoints: {
              total: 25,
              available: [
                '/api/auth/*',
                '/api/lists',
                '/api/lists/:id',
                '/api/lists/:id/share',
                '/api/canvas/lists',
                '/api/notes',
                '/api/notes/:id',
                '/api/notes/:id/share',
                '/api/whiteboards',
                '/api/whiteboards/:id',
                '/api/whiteboards/:id/share',
                '/api/shared/list/:token',
                '/api/shared/note/:token',
                '/api/shared/whiteboard/:token',
                '/api/categories',
                '/api/categories/:id',
                '/api/suggestions',
                '/api/docs/content',
                '/api/docs/structure',
                '/api/docs/search',
                '/api/health',
                '/api/status',
                '/docs/*',
                '/health',
                '/shared/*'
              ]
            }
          };

          // Test basic functionality
          const healthChecks = {
            express: true,
            cors: true,
            json_parser: true,
            database: false // Will be updated below if DB is available
          };

          // Check database connectivity using the same pool as CRUD operations
          if (actualPool) {
            try {
              const client = await actualPool.connect();
              await client.query('SELECT 1');
              client.release();
              healthChecks.database = true;
              status.services.database = 'operational';
            } catch (dbError) {
              console.error('Database health check failed:', dbError.message);
              status.services.database = 'degraded';
            }
          } else {
            status.services.database = 'unavailable';
          }

          status.healthChecks = healthChecks;

          res.status(200).json(status);
        } catch (error) {
          res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            server: {
              port: port,
              environment: process.env.NODE_ENV || 'development'
            }
          });
        }
      });

      console.log('✅ Status endpoint initialized');

  } catch (dbError) {
    console.error('Database connection error:', dbError.message);
    console.log('Server will continue running for health checks');
  }
  
  // Serve static files from the frontend's dist directory
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));

  // For any other route, serve the frontend's index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });

  // 404 handler - MUST be registered after all valid routes
  app.use('*', (req, res) => {
    res.status(200).send('Server is running. Use /health or /api/health to check status.');
  });

  console.log('✅ All routes registered, including catch-all handler');
}, 500); // Wait a bit to ensure server is up first