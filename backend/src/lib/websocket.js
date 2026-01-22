/**
 * WebSocket Helper Module - Extracted from index.js
 * Handles WebSocket connection management and broadcast functions
 */
const jwt = require('jsonwebtoken');

/**
 * Initialize WebSocket functionality
 * @param {Object} io - Socket.IO server instance
 * @param {Object} pool - Database connection pool
 * @returns {Object} Broadcast functions and viewer trackers
 */
module.exports = (io, pool) => {
    // WebSocket connection management
    const sharedListViewers = new Map(); // shareToken -> Set of socket IDs
    const sharedNoteViewers = new Map(); // shareToken -> Set of socket IDs
    const sharedWhiteboardViewers = new Map(); // shareToken -> Set of socket IDs
    const userCanvasConnections = new Map(); // userId -> Set of socket IDs

    // Broadcast helper functions
    const broadcast = {
        listUpdate: (shareToken, eventType, data) => {
            if (shareToken && io) {
                const roomName = `shared-list-${shareToken}`;
                io.to(roomName).emit('listUpdated', {
                    type: eventType,
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Broadcasted ${eventType} to shared list: ${shareToken}`);
            }
        },

        noteUpdate: (shareToken, eventType, data) => {
            if (shareToken && io) {
                const roomName = `shared-note-${shareToken}`;
                io.to(roomName).emit('noteUpdated', {
                    type: eventType,
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Broadcasted ${eventType} to shared note: ${shareToken}`);
            }
        },

        whiteboardUpdate: (shareToken, eventType, data) => {
            if (shareToken && io) {
                const roomName = `shared-whiteboard-${shareToken}`;
                io.to(roomName).emit('whiteboardUpdated', {
                    type: eventType,
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Broadcasted ${eventType} to shared whiteboard: ${shareToken}`);
            }
        },

        userListUpdate: (userId, eventType, data) => {
            if (userId && io) {
                const roomName = `user-canvas-${userId}`;
                io.to(roomName).emit('userListUpdated', {
                    type: eventType,
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Broadcasted ${eventType} to user ${userId} canvas`);
            }
        },

        userListDeleted: (userId, data) => {
            if (userId && io) {
                const roomName = `user-canvas-${userId}`;
                io.to(roomName).emit('userListDeleted', {
                    type: 'LIST_DELETED',
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`Broadcasted LIST_DELETED to user ${userId} canvas`);
            }
        }
    };

    // Socket.IO event handlers
    io.on('connection', (socket) => {
        console.log(`WebSocket client connected: ${socket.id}`);

        // Handle user joining their own canvas for real-time updates
        socket.on('joinUserCanvas', async (data) => {
            try {
                const { token } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;

                const roomName = `user-canvas-${userId}`;
                socket.join(roomName);

                if (!userCanvasConnections.has(userId)) {
                    userCanvasConnections.set(userId, new Set());
                }
                userCanvasConnections.get(userId).add(socket.id);

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
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT id, title, is_public FROM lists WHERE share_token = $1',
                    [shareToken]
                );

                if (result.rows.length === 0 || !result.rows[0].is_public) {
                    client.release();
                    socket.emit('error', { message: 'Invalid or inactive share link' });
                    return;
                }

                client.release();

                const roomName = `shared-list-${shareToken}`;
                socket.join(roomName);

                if (!sharedListViewers.has(shareToken)) {
                    sharedListViewers.set(shareToken, new Set());
                }
                sharedListViewers.get(shareToken).add(socket.id);

                socket.emit('joinedSharedList', {
                    message: 'Successfully joined shared list',
                    listTitle: result.rows[0].title
                });

                const viewerCount = sharedListViewers.get(shareToken).size;
                io.to(roomName).emit('viewerCount', viewerCount);
            } catch (error) {
                console.error('Error joining shared list:', error);
                socket.emit('error', { message: 'Failed to join shared list' });
            }
        });

        // Handle viewer joining a shared note
        socket.on('joinSharedNote', async (shareToken) => {
            try {
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT id, title, is_public FROM notes WHERE share_token = $1',
                    [shareToken]
                );

                if (result.rows.length === 0 || !result.rows[0].is_public) {
                    client.release();
                    socket.emit('error', { message: 'Invalid or inactive share link' });
                    return;
                }

                client.release();

                const roomName = `shared-note-${shareToken}`;
                socket.join(roomName);

                if (!sharedNoteViewers.has(shareToken)) {
                    sharedNoteViewers.set(shareToken, new Set());
                }
                sharedNoteViewers.get(shareToken).add(socket.id);

                socket.emit('joinedSharedNote', {
                    message: 'Successfully joined shared note',
                    noteTitle: result.rows[0].title
                });

                const viewerCount = sharedNoteViewers.get(shareToken).size;
                io.to(roomName).emit('viewerCount', viewerCount);
            } catch (error) {
                console.error('Error joining shared note:', error);
                socket.emit('error', { message: 'Failed to join shared note' });
            }
        });

        // Handle viewer joining a shared whiteboard
        socket.on('joinSharedWhiteboard', async (shareToken) => {
            try {
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT id, title, is_public FROM whiteboards WHERE share_token = $1',
                    [shareToken]
                );

                if (result.rows.length === 0 || !result.rows[0].is_public) {
                    client.release();
                    socket.emit('error', { message: 'Invalid or inactive share link' });
                    return;
                }

                client.release();

                const roomName = `shared-whiteboard-${shareToken}`;
                socket.join(roomName);

                if (!sharedWhiteboardViewers.has(shareToken)) {
                    sharedWhiteboardViewers.set(shareToken, new Set());
                }
                sharedWhiteboardViewers.get(shareToken).add(socket.id);

                socket.emit('joinedSharedWhiteboard', {
                    message: 'Successfully joined shared whiteboard',
                    whiteboardTitle: result.rows[0].title
                });

                const viewerCount = sharedWhiteboardViewers.get(shareToken).size;
                io.to(roomName).emit('viewerCount', viewerCount);
            } catch (error) {
                console.error('Error joining shared whiteboard:', error);
                socket.emit('error', { message: 'Failed to join shared whiteboard' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`WebSocket client disconnected: ${socket.id}`);

            // Remove from all viewer tracking maps
            [
                { map: sharedListViewers, prefix: 'shared-list-' },
                { map: sharedNoteViewers, prefix: 'shared-note-' },
                { map: sharedWhiteboardViewers, prefix: 'shared-whiteboard-' }
            ].forEach(({ map, prefix }) => {
                for (const [shareToken, viewers] of map.entries()) {
                    if (viewers.has(socket.id)) {
                        viewers.delete(socket.id);
                        if (viewers.size === 0) {
                            map.delete(shareToken);
                        } else {
                            io.to(`${prefix}${shareToken}`).emit('viewerCount', viewers.size);
                        }
                    }
                }
            });

            // Remove from user canvas connections
            for (const [userId, connections] of userCanvasConnections.entries()) {
                if (connections.has(socket.id)) {
                    connections.delete(socket.id);
                    if (connections.size === 0) {
                        userCanvasConnections.delete(userId);
                    }
                }
            }
        });
    });

    console.log('✅ WebSocket functionality initialized');

    return {
        broadcast,
        viewers: {
            list: sharedListViewers,
            note: sharedNoteViewers,
            whiteboard: sharedWhiteboardViewers,
            userCanvas: userCanvasConnections
        }
    };
};
