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
const { createServer } = require('http');
const { Server } = require('socket.io');

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

// Create HTTP server and integrate Socket.IO
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || (
      process.env.NODE_ENV === 'production'
        ? 'https://itemize.cloud'
        : 'http://localhost:5173'
    ),
    methods: ['GET', 'POST']
  }
});

// WebSocket setup will be initialized after database connection

// Start the server - KEEP BINDING TO 0.0.0.0 for Railway
server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`✅ WebSocket server ready`);
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

    // Initialize WebSocket functionality after database is ready
    if (actualPool) {
      console.log('Initializing WebSocket functionality...');

      // WebSocket connection management
      const sharedListViewers = new Map(); // shareToken -> Set of socket IDs
      const sharedNoteViewers = new Map(); // shareToken -> Set of socket IDs
      const sharedWhiteboardViewers = new Map(); // shareToken -> Set of socket IDs
      const userCanvasConnections = new Map(); // userId -> Set of socket IDs

      io.on('connection', (socket) => {
        console.log(`WebSocket client connected: ${socket.id}`);

        // Handle user joining their own canvas for real-time updates
        socket.on('joinUserCanvas', async (data) => {
          try {
            const { token } = data;
            console.log(`Attempting to join user canvas with token`);

            // Verify the token and get user ID
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id;

            console.log(`User ${userId} joining their canvas`);

            // Join user-specific room
            const roomName = `user-canvas-${userId}`;
            socket.join(roomName);

            // Track user canvas connections
            if (!userCanvasConnections.has(userId)) {
              userCanvasConnections.set(userId, new Set());
            }
            userCanvasConnections.get(userId).add(socket.id);

            console.log(`User ${userId} joined their canvas room: ${roomName}`);

            // Emit success to the joining client
            socket.emit('joinedUserCanvas', {
              message: 'Successfully joined user canvas',
              userId: userId
            });

          } catch (error) {
            console.error('Error joining user canvas:', error);
            socket.emit('error', { message: 'Failed to join user canvas' });
          }
        });

        // Test ping/pong for debugging
        socket.on('testPing', (data) => {
          console.log('Backend: Received test ping:', data);
          socket.emit('testPong', { message: 'Pong from backend', originalData: data });
        });

        // Handle viewer joining a shared list
        socket.on('joinSharedList', async (shareToken) => {
          try {
            console.log(`Attempting to join shared list with token: ${shareToken}`);

            // Validate that the share token exists and is public
            const client = await actualPool.connect();
            const result = await client.query(
              'SELECT id, title, is_public FROM lists WHERE share_token = $1',
              [shareToken]
            );

            console.log(`Database query result:`, result.rows);

            if (result.rows.length === 0) {
              console.log(`No list found with token: ${shareToken}`);
              client.release();
              socket.emit('error', { message: 'Invalid or inactive share link' });
              return;
            }

            const list = result.rows[0];
            if (!list.is_public) {
              console.log(`List found but not public: ${list.title}`);
              client.release();
              socket.emit('error', { message: 'This list is no longer shared' });
              return;
            }

            client.release();
            console.log(`Valid shared list found: ${list.title} (ID: ${list.id})`);

            // Join the room for this shared list
            const roomName = `shared-list-${shareToken}`;
            socket.join(roomName);

            // Track viewer count
            if (!sharedListViewers.has(shareToken)) {
              sharedListViewers.set(shareToken, new Set());
            }
            sharedListViewers.get(shareToken).add(socket.id);

            console.log(`Viewer ${socket.id} joined shared list: ${shareToken}`);

            // Emit success to the joining client
            socket.emit('joinedSharedList', {
              message: 'Successfully joined shared list',
              listTitle: list.title
            });

            // Emit viewer count to room
            const viewerCount = sharedListViewers.get(shareToken).size;
            io.to(roomName).emit('viewerCount', viewerCount);

            console.log(`Room ${roomName} now has ${viewerCount} viewers`);

          } catch (error) {
            console.error('Error joining shared list:', error);
            socket.emit('error', { message: 'Failed to join shared list' });
          }
        });

        // Handle viewer joining a shared note
        socket.on('joinSharedNote', async (shareToken) => {
          try {
            console.log(`Attempting to join shared note with token: ${shareToken}`);

            // Validate that the share token exists and is public
            const client = await actualPool.connect();
            const result = await client.query(
              'SELECT id, title, is_public FROM notes WHERE share_token = $1',
              [shareToken]
            );

            console.log(`Database query result:`, result.rows);

            if (result.rows.length === 0) {
              console.log(`No note found with token: ${shareToken}`);
              client.release();
              socket.emit('error', { message: 'Invalid or inactive share link' });
              return;
            }

            const note = result.rows[0];
            if (!note.is_public) {
              console.log(`Note found but not public: ${note.title}`);
              client.release();
              socket.emit('error', { message: 'This note is no longer shared' });
              return;
            }

            client.release();
            console.log(`Valid shared note found: ${note.title} (ID: ${note.id})`);

            // Join the room for this shared note
            const roomName = `shared-note-${shareToken}`;
            socket.join(roomName);

            // Track viewer count
            if (!sharedNoteViewers.has(shareToken)) {
              sharedNoteViewers.set(shareToken, new Set());
            }
            sharedNoteViewers.get(shareToken).add(socket.id);

            console.log(`Viewer ${socket.id} joined shared note: ${shareToken}`);

            // Emit success to the joining client
            socket.emit('joinedSharedNote', {
              message: 'Successfully joined shared note',
              noteTitle: note.title
            });

            // Emit viewer count to room
            const viewerCount = sharedNoteViewers.get(shareToken).size;
            io.to(roomName).emit('viewerCount', viewerCount);

            console.log(`Room ${roomName} now has ${viewerCount} viewers`);

          } catch (error) {
            console.error('Error joining shared note:', error);
            socket.emit('error', { message: 'Failed to join shared note' });
          }
        });

        // Handle viewer joining a shared whiteboard
        socket.on('joinSharedWhiteboard', async (shareToken) => {
          try {
            console.log(`Attempting to join shared whiteboard with token: ${shareToken}`);

            // Validate that the share token exists and is public
            const client = await actualPool.connect();
            const result = await client.query(
              'SELECT id, title, is_public FROM whiteboards WHERE share_token = $1',
              [shareToken]
            );

            console.log(`Database query result:`, result.rows);

            if (result.rows.length === 0) {
              console.log(`No whiteboard found with token: ${shareToken}`);
              client.release();
              socket.emit('error', { message: 'Invalid or inactive share link' });
              return;
            }

            const whiteboard = result.rows[0];
            if (!whiteboard.is_public) {
              console.log(`Whiteboard found but not public: ${whiteboard.title}`);
              client.release();
              socket.emit('error', { message: 'This whiteboard is no longer shared' });
              return;
            }

            client.release();
            console.log(`Valid shared whiteboard found: ${whiteboard.title} (ID: ${whiteboard.id})`);

            // Join the room for this shared whiteboard
            const roomName = `shared-whiteboard-${shareToken}`;
            socket.join(roomName);

            // Track viewer count
            if (!sharedWhiteboardViewers.has(shareToken)) {
              sharedWhiteboardViewers.set(shareToken, new Set());
            }
            sharedWhiteboardViewers.get(shareToken).add(socket.id);

            console.log(`Viewer ${socket.id} joined shared whiteboard: ${shareToken}`);

            // Emit success to the joining client
            socket.emit('joinedSharedWhiteboard', {
              message: 'Successfully joined shared whiteboard',
              whiteboardTitle: whiteboard.title
            });

            // Emit viewer count to room
            const viewerCount = sharedWhiteboardViewers.get(shareToken).size;
            io.to(roomName).emit('viewerCount', viewerCount);

            console.log(`Room ${roomName} now has ${viewerCount} viewers`);

          } catch (error) {
            console.error('Error joining shared whiteboard:', error);
            socket.emit('error', { message: 'Failed to join shared whiteboard' });
          }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
          console.log(`WebSocket client disconnected: ${socket.id}`);

          // Remove from all shared list viewer tracking
          for (const [shareToken, viewers] of sharedListViewers.entries()) {
            if (viewers.has(socket.id)) {
              viewers.delete(socket.id);

              // Clean up empty sets
              if (viewers.size === 0) {
                sharedListViewers.delete(shareToken);
              } else {
                // Update viewer count for remaining viewers
                const roomName = `shared-list-${shareToken}`;
                io.to(roomName).emit('viewerCount', viewers.size);
              }
            }
          }

          // Remove from all shared note viewer tracking
          for (const [shareToken, viewers] of sharedNoteViewers.entries()) {
            if (viewers.has(socket.id)) {
              viewers.delete(socket.id);

              // Clean up empty sets
              if (viewers.size === 0) {
                sharedNoteViewers.delete(shareToken);
              } else {
                // Update viewer count for remaining viewers
                const roomName = `shared-note-${shareToken}`;
                io.to(roomName).emit('viewerCount', viewers.size);
              }
            }
          }

          // Remove from all shared whiteboard viewer tracking
          for (const [shareToken, viewers] of sharedWhiteboardViewers.entries()) {
            if (viewers.has(socket.id)) {
              viewers.delete(socket.id);

              // Clean up empty sets
              if (viewers.size === 0) {
                sharedWhiteboardViewers.delete(shareToken);
              } else {
                // Update viewer count for remaining viewers
                const roomName = `shared-whiteboard-${shareToken}`;
                io.to(roomName).emit('viewerCount', viewers.size);
              }
            }
          }

          // Remove from user canvas connections
          for (const [userId, connections] of userCanvasConnections.entries()) {
            if (connections.has(socket.id)) {
              connections.delete(socket.id);
              console.log(`Removed user ${userId} canvas connection: ${socket.id}`);

              // Clean up empty sets
              if (connections.size === 0) {
                userCanvasConnections.delete(userId);
                console.log(`Cleaned up empty user canvas connections for user: ${userId}`);
              }
            }
          }
        });
      });

      // Helper function to broadcast list changes to shared viewers
      const broadcastListUpdate = (shareToken, eventType, data) => {
        if (shareToken && io) {
          const roomName = `shared-list-${shareToken}`;
          io.to(roomName).emit('listUpdated', {
            type: eventType,
            data: data,
            timestamp: new Date().toISOString()
          });
          console.log(`Broadcasted ${eventType} to shared list: ${shareToken}`);
        }
      };

      // Helper function to broadcast note changes to shared viewers
      const broadcastNoteUpdate = (shareToken, eventType, data) => {
        if (shareToken && io) {
          const roomName = `shared-note-${shareToken}`;
          io.to(roomName).emit('noteUpdated', {
            type: eventType,
            data: data,
            timestamp: new Date().toISOString()
          });
          console.log(`Broadcasted ${eventType} to shared note: ${shareToken}`);
        }
      };

      // Helper function to broadcast whiteboard changes to shared viewers
      const broadcastWhiteboardUpdate = (shareToken, eventType, data) => {
        if (shareToken && io) {
          const roomName = `shared-whiteboard-${shareToken}`;
          io.to(roomName).emit('whiteboardUpdated', {
            type: eventType,
            data: data,
            timestamp: new Date().toISOString()
          });
          console.log(`Broadcasted ${eventType} to shared whiteboard: ${shareToken}`);
        }
      };

      // Helper function to broadcast list changes to user's own canvas
      const broadcastUserListUpdate = (userId, eventType, data) => {
        if (userId && io) {
          const roomName = `user-canvas-${userId}`;
          io.to(roomName).emit('userListUpdated', {
            type: eventType,
            data: data,
            timestamp: new Date().toISOString()
          });
          console.log(`Broadcasted ${eventType} to user ${userId} canvas`);
        }
      };

      // Note: List creation broadcasts removed to match notes/whiteboards pattern
      // This prevents duplicate creation issues while maintaining real-time updates for other operations

      // Helper function to broadcast list deletion to user's own canvas
      const broadcastUserListDeleted = (userId, data) => {
        if (userId && io) {
          const roomName = `user-canvas-${userId}`;
          io.to(roomName).emit('userListDeleted', {
            type: 'LIST_DELETED',
            data: data,
            timestamp: new Date().toISOString()
          });
          console.log(`Broadcasted LIST_DELETED to user ${userId} canvas`);
        }
      };

      // Make WebSocket functionality available globally for API endpoints
      global.io = io;
      global.sharedListViewers = sharedListViewers;
      global.sharedNoteViewers = sharedNoteViewers;
      global.sharedWhiteboardViewers = sharedWhiteboardViewers;
      global.userCanvasConnections = userCanvasConnections;
      global.broadcastListUpdate = broadcastListUpdate;
      global.broadcastNoteUpdate = broadcastNoteUpdate;
      global.broadcastWhiteboardUpdate = broadcastWhiteboardUpdate;
      global.broadcastUserListUpdate = broadcastUserListUpdate;
      // global.broadcastUserListCreated = broadcastUserListCreated; // Removed to prevent duplicates
      global.broadcastUserListDeleted = broadcastUserListDeleted;

      console.log('✅ WebSocket functionality initialized');
    } else {
      console.warn('Skipping WebSocket initialization due to missing database pool.');
    }

      // Get all lists
      app.get('/api/lists', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          // Make sure to include color_value in the results
          const result = await client.query(
            'SELECT id, title, category, items, created_at, updated_at, user_id, color_value, share_token, is_public, shared_at FROM lists WHERE user_id = $1 ORDER BY id DESC',
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

          // Note: List creation broadcast removed to match notes/whiteboards pattern
          // This prevents duplicate creation issues in the frontend

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

          // Broadcast to shared viewers if list is public
          if (result.rows[0].is_public && result.rows[0].share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(result.rows[0].share_token, 'LIST_UPDATE', {
              id: result.rows[0].id,
              title: result.rows[0].title,
              category: result.rows[0].category,
              items: result.rows[0].items,
              color_value: result.rows[0].color_value,
              updated_at: result.rows[0].updated_at
            });
          }

          // Broadcast to user's own canvas for real-time updates
          if (global.broadcastUserListUpdate) {
            global.broadcastUserListUpdate(req.user.id, 'LIST_UPDATE', mappedResult);
          }

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

          // Broadcast to user's own canvas for real-time updates
          if (global.broadcastUserListDeleted) {
            global.broadcastUserListDeleted(req.user.id, { id: result.rows[0].id });
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

          // Broadcast position update to shared viewers if list is public
          if (result.rows[0].is_public && result.rows[0].share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(result.rows[0].share_token, 'POSITION_UPDATE', {
              id: result.rows[0].id,
              position_x: result.rows[0].position_x,
              position_y: result.rows[0].position_y
            });
          }

          res.json(result.rows[0]);
        } catch (error) {
          console.error('Error updating list position:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // --- Granular List API Endpoints for Real-time Updates ---

      // Toggle item completion status
      app.put('/api/lists/:id/items/:itemId/toggle', global.authenticateJWT, async (req, res) => {
        try {
          const { id, itemId } = req.params;

          const client = await actualPool.connect();

          // Get current list
          const listResult = await client.query(
            'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
          );

          if (listResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'List not found' });
          }

          const list = listResult.rows[0];
          const items = list.items || [];

          // Find and toggle the item
          const itemIndex = items.findIndex(item => item.id === itemId);
          if (itemIndex === -1) {
            client.release();
            return res.status(404).json({ error: 'Item not found' });
          }

          items[itemIndex].completed = !items[itemIndex].completed;

          // Update the list
          const updateResult = await client.query(
            'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [JSON.stringify(items), id, req.user.id]
          );
          client.release();

          const updatedList = updateResult.rows[0];

          // Broadcast to shared viewers if list is public
          if (updatedList.is_public && updatedList.share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(updatedList.share_token, 'ITEM_TOGGLED', {
              id: updatedList.id,
              itemId: itemId,
              completed: items[itemIndex].completed,
              items: updatedList.items
            });
          }

          // Broadcast to user's own canvas for real-time updates
          const mappedResult = {
            ...updatedList,
            type: updatedList.category
          };
          if (global.broadcastUserListUpdate) {
            global.broadcastUserListUpdate(req.user.id, 'ITEM_TOGGLED', mappedResult);
          }

          res.json(mappedResult);
        } catch (error) {
          console.error('Error toggling item:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Add new item to list
      app.post('/api/lists/:id/items', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { text, completed = false } = req.body;

          if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Item text is required' });
          }

          const client = await actualPool.connect();

          // Get current list
          const listResult = await client.query(
            'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
          );

          if (listResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'List not found' });
          }

          const list = listResult.rows[0];
          const items = list.items || [];

          // Create new item
          const newItem = {
            id: require('crypto').randomUUID(),
            text: text.trim(),
            completed: completed
          };

          items.push(newItem);

          // Update the list
          const updateResult = await client.query(
            'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [JSON.stringify(items), id, req.user.id]
          );
          client.release();

          const updatedList = updateResult.rows[0];

          // Broadcast to shared viewers if list is public
          if (updatedList.is_public && updatedList.share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(updatedList.share_token, 'ITEM_ADDED', {
              id: updatedList.id,
              newItem: newItem,
              items: updatedList.items
            });
          }

          // Broadcast to user's own canvas for real-time updates
          const mappedResult = {
            ...updatedList,
            type: updatedList.category
          };
          if (global.broadcastUserListUpdate) {
            global.broadcastUserListUpdate(req.user.id, 'ITEM_ADDED', mappedResult);
          }

          res.json({
            ...updatedList,
            type: updatedList.category
          });
        } catch (error) {
          console.error('Error adding item:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Remove item from list
      app.delete('/api/lists/:id/items/:itemId', global.authenticateJWT, async (req, res) => {
        try {
          const { id, itemId } = req.params;

          const client = await actualPool.connect();

          // Get current list
          const listResult = await client.query(
            'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
          );

          if (listResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'List not found' });
          }

          const list = listResult.rows[0];
          const items = list.items || [];

          // Find and remove the item
          const itemIndex = items.findIndex(item => item.id === itemId);
          if (itemIndex === -1) {
            client.release();
            return res.status(404).json({ error: 'Item not found' });
          }

          const removedItem = items[itemIndex];
          items.splice(itemIndex, 1);

          // Update the list
          const updateResult = await client.query(
            'UPDATE lists SET items = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [JSON.stringify(items), id, req.user.id]
          );
          client.release();

          const updatedList = updateResult.rows[0];

          // Broadcast to shared viewers if list is public
          if (updatedList.is_public && updatedList.share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(updatedList.share_token, 'ITEM_REMOVED', {
              id: updatedList.id,
              removedItemId: itemId,
              items: updatedList.items
            });
          }

          res.json({
            ...updatedList,
            type: updatedList.category
          });
        } catch (error) {
          console.error('Error removing item:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Update list title
      app.put('/api/lists/:id/title', global.authenticateJWT, async (req, res) => {
        try {
          const { id } = req.params;
          const { title } = req.body;

          if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Title is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE lists SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [title.trim(), id, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
          }

          const updatedList = result.rows[0];

          // Broadcast to shared viewers if list is public
          if (updatedList.is_public && updatedList.share_token && global.broadcastListUpdate) {
            global.broadcastListUpdate(updatedList.share_token, 'TITLE_CHANGED', {
              id: updatedList.id,
              title: updatedList.title
            });
          }

          res.json({
            ...updatedList,
            type: updatedList.category
          });
        } catch (error) {
          console.error('Error updating title:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // --- Notes API Endpoints ---

      // Get all notes for the current user
      app.get('/api/notes', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT id, user_id, title, content, category, color_value, position_x, position_y, width, height, z_index, created_at, updated_at, share_token, is_public, shared_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC',
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

          const updatedNote = updateResult.rows[0];

          // Broadcast update to shared note viewers if note is public
          if (updatedNote.is_public && updatedNote.share_token && global.broadcastNoteUpdate) {
            global.broadcastNoteUpdate(updatedNote.share_token, 'noteUpdated', {
              id: updatedNote.id,
              title: updatedNote.title,
              content: updatedNote.content,
              category: updatedNote.category,
              color_value: updatedNote.color_value,
              updated_at: updatedNote.updated_at
            });
          }

          // The updated_at field is handled automatically by the database trigger.
          res.json(updatedNote);
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

          // First check if note exists and get sharing info for logging
          const checkResult = await client.query(
            'SELECT id, title, share_token, is_public FROM notes WHERE id = $1 AND user_id = $2',
            [noteId, req.user.id]
          );

          if (checkResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Note not found or access denied' });
          }

          const noteInfo = checkResult.rows[0];
          console.log(`🗑️ Deleting note ${noteId} (${noteInfo.title}). Was shared: ${noteInfo.is_public}, Token: ${noteInfo.share_token}`);

          // Delete the note
          const result = await client.query(
            'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
            [noteId, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            console.error(`❌ Failed to delete note ${noteId} - no rows affected`);
            return res.status(404).json({ error: 'Note not found or access denied' });
          }

          // Broadcast deletion to shared note viewers if note was public
          if (noteInfo.is_public && noteInfo.share_token && global.broadcastNoteUpdate) {
            global.broadcastNoteUpdate(noteInfo.share_token, 'noteDeleted', {
              id: noteId,
              message: 'This note has been deleted by the owner'
            });
          }

          console.log(`✅ Note ${noteId} deleted successfully. Shared links with token ${noteInfo.share_token} are now invalid.`);
          res.status(200).json({ message: 'Note deleted successfully' });
        } catch (error) {
          console.error('Error deleting note:', error);
          res.status(500).json({ error: 'Internal server error while deleting note' });
        }
      });
      
      // --- Granular Note API Endpoints for Real-time Updates ---

      // Update note content only
      app.put('/api/notes/:noteId/content', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const { content } = req.body;

          if (content === undefined) {
            return res.status(400).json({ error: 'Content is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE notes SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [content, noteId, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
          }

          const updatedNote = result.rows[0];

          // Broadcast to shared viewers if note is public
          if (updatedNote.is_public && updatedNote.share_token && global.broadcastNoteUpdate) {
            global.broadcastNoteUpdate(updatedNote.share_token, 'CONTENT_CHANGED', {
              id: updatedNote.id,
              content: updatedNote.content,
              updated_at: updatedNote.updated_at
            });
          }

          res.json(updatedNote);
        } catch (error) {
          console.error('Error updating note content:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Update note title only
      app.put('/api/notes/:noteId/title', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const { title } = req.body;

          if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Title is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE notes SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [title.trim(), noteId, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
          }

          const updatedNote = result.rows[0];

          // Broadcast to shared viewers if note is public
          if (updatedNote.is_public && updatedNote.share_token && global.broadcastNoteUpdate) {
            global.broadcastNoteUpdate(updatedNote.share_token, 'TITLE_CHANGED', {
              id: updatedNote.id,
              title: updatedNote.title,
              updated_at: updatedNote.updated_at
            });
          }

          res.json(updatedNote);
        } catch (error) {
          console.error('Error updating note title:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Update note category only
      app.put('/api/notes/:noteId/category', global.authenticateJWT, async (req, res) => {
        try {
          const { noteId } = req.params;
          const { category } = req.body;

          if (!category || category.trim() === '') {
            return res.status(400).json({ error: 'Category is required' });
          }

          const client = await actualPool.connect();
          const result = await client.query(
            'UPDATE notes SET category = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [category.trim(), noteId, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
          }

          const updatedNote = result.rows[0];

          // Broadcast to shared viewers if note is public
          if (updatedNote.is_public && updatedNote.share_token && global.broadcastNoteUpdate) {
            global.broadcastNoteUpdate(updatedNote.share_token, 'CATEGORY_CHANGED', {
              id: updatedNote.id,
              category: updatedNote.category,
              updated_at: updatedNote.updated_at
            });
          }

          res.json(updatedNote);
        } catch (error) {
          console.error('Error updating note category:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      console.log('✅ Notes API routes initialized');

      // --- Whiteboards API Endpoints ---

      // Get all whiteboards for the current user
      app.get('/api/whiteboards', global.authenticateJWT, async (req, res) => {
        try {
          const client = await actualPool.connect();
          const result = await client.query(
            'SELECT id, user_id, title, category, canvas_data, canvas_width, canvas_height, background_color, position_x, position_y, z_index, color_value, created_at, updated_at, share_token, is_public, shared_at FROM whiteboards WHERE user_id = $1 ORDER BY created_at DESC',
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

          const updatedWhiteboard = updateResult.rows[0];

          // Broadcast to shared viewers if whiteboard is public
          if (updatedWhiteboard.is_public && updatedWhiteboard.share_token && global.broadcastWhiteboardUpdate) {
            global.broadcastWhiteboardUpdate(updatedWhiteboard.share_token, 'whiteboardUpdated', {
              id: updatedWhiteboard.id,
              title: updatedWhiteboard.title,
              category: updatedWhiteboard.category,
              canvas_data: updatedWhiteboard.canvas_data,
              canvas_width: updatedWhiteboard.canvas_width,
              canvas_height: updatedWhiteboard.canvas_height,
              background_color: updatedWhiteboard.background_color,
              color_value: updatedWhiteboard.color_value,
              updated_at: updatedWhiteboard.updated_at
            });
          }

          res.json(updatedWhiteboard);
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

          // First check if whiteboard exists and get sharing info for logging
          const checkResult = await client.query(
            'SELECT id, title, share_token, is_public FROM whiteboards WHERE id = $1 AND user_id = $2',
            [whiteboardId, req.user.id]
          );

          if (checkResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }

          const whiteboardInfo = checkResult.rows[0];
          console.log(`🗑️ Deleting whiteboard ${whiteboardId} (${whiteboardInfo.title}). Was shared: ${whiteboardInfo.is_public}, Token: ${whiteboardInfo.share_token}`);

          // Delete the whiteboard
          const result = await client.query(
            'DELETE FROM whiteboards WHERE id = $1 AND user_id = $2 RETURNING id',
            [whiteboardId, req.user.id]
          );
          client.release();

          if (result.rows.length === 0) {
            console.error(`❌ Failed to delete whiteboard ${whiteboardId} - no rows affected`);
            return res.status(404).json({ error: 'Whiteboard not found or access denied' });
          }

          // Broadcast deletion to shared viewers if whiteboard was public
          if (whiteboardInfo.is_public && whiteboardInfo.share_token && global.broadcastWhiteboardUpdate) {
            global.broadcastWhiteboardUpdate(whiteboardInfo.share_token, 'whiteboardDeleted', {
              id: whiteboardInfo.id,
              message: 'This whiteboard has been deleted by the owner.'
            });
          }

          console.log(`✅ Whiteboard ${whiteboardId} deleted successfully. Shared links with token ${whiteboardInfo.share_token} are now invalid.`);
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
          console.log(`🔗 Shared note access attempt with token: ${token}`);

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
            console.log(`❌ Shared note not found for token: ${token}`);
            return res.status(404).json({ error: 'Shared content not found or no longer available' });
          }

          console.log(`✅ Shared note found: ${result.rows[0].title} (ID: ${result.rows[0].id})`);
          console.log(`📊 Note details: Created ${result.rows[0].created_at}, Updated ${result.rows[0].updated_at}`);
          console.log(`👤 Creator: ${result.rows[0].creator_name}`);

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
          console.log(`🔗 Shared whiteboard access attempt with token: ${token}`);

          console.log('🔗 Attempting to connect to database...');
          const client = await actualPool.connect();
          console.log('🔗 Database connection successful');

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
            console.log(`❌ Shared whiteboard not found for token: ${token}`);
            return res.status(404).json({ error: 'Shared content not found or no longer available' });
          }

          console.log(`✅ Shared whiteboard found: ${result.rows[0].title} (ID: ${result.rows[0].id})`);
          console.log(`📊 Whiteboard details: Created ${result.rows[0].created_at}, Updated ${result.rows[0].updated_at}`);
          console.log(`👤 Creator: ${result.rows[0].creator_name}`);

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

          // Provide more specific error messages for common issues
          if (error.message && error.message.includes('timeout')) {
            console.error('🔗 Database connection timeout - database may be overloaded');
            res.status(503).json({ error: 'Database temporarily unavailable. Please try again in a moment.' });
          } else if (error.code === 'ECONNREFUSED') {
            console.error('🔗 Database connection refused - database may be down');
            res.status(503).json({ error: 'Database connection failed. Please try again later.' });
          } else {
            res.status(500).json({ error: 'Internal server error while fetching shared content' });
          }
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