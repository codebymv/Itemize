const express = require('express');
const router = express.Router();
const aiSuggestionService = require('../services/aiSuggestionService');
const { sendError } = require('../utils/response');

// Middleware to authenticate JWT tokens
const authenticateJWT = global.authenticateJWT || ((req, res, next) => {
  // Fallback if global auth middleware not available
  console.warn('JWT authentication middleware not available');
  next();
});

// POST /api/note-suggestions
router.post('/', authenticateJWT, async (req, res) => {
  try {
    console.log('Note suggestions request received:', {
      body: req.body,
      headers: req.headers,
      user: req.user ? { id: req.user.id } : 'no user'
    });

    const { content } = req.body;
    
    // Validate request body
    if (!content || typeof content !== 'string') {
      console.error('Invalid request body - content missing or not a string:', { content, type: typeof content });
      return res.status(400).json({ 
        error: 'Invalid request parameters. Content field is required and must be a string.' 
      });
    }

    if (content.trim().length === 0) {
      console.error('Empty content provided');
      return res.status(400).json({ 
        error: 'Content cannot be empty.' 
      });
    }

    console.log('Generating note suggestions for content length:', content.length);
    
    // Call AI suggestion service
    const result = await aiSuggestionService.suggestNoteContent(content);
    
    console.log('Note suggestions generated successfully:', {
      suggestionsCount: result.suggestions ? result.suggestions.length : 0
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error generating note suggestions:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    
    return sendError(res, 'Failed to generate note suggestions');
  }
});

module.exports = router;