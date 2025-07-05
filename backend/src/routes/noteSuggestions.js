const express = require('express');
const noteAISuggestionService = require('../services/noteAISuggestionService');
const { authenticateJWT } = require('../auth');

const router = express.Router();

/**
 * POST /api/note-suggestions
 * Generate AI-powered suggestions for note content
 * 
 * Request body:
 * {
 *   "content": "string",           // Current note content
 *   "category": "string",         // Optional: Note category (e.g., "meeting", "project")
 *   "requestTypes": ["string"]    // Optional: Types of suggestions ["completion", "continuation"]
 * }
 * 
 * Response:
 * {
 *   "suggestions": ["string"],    // Sentence completions
 *   "continuations": ["string"],  // Content continuations
 *   "cached": boolean,            // Whether result was from cache
 *   "error": "string"             // Error message if any
 * }
 */
router.post('/', authenticateJWT, async (req, res) => {
  try {
    console.log('📝 Note suggestions request body:', JSON.stringify(req.body, null, 2));
    const { content, category = 'general', requestTypes = ['completion', 'continuation'] } = req.body;
    
    // Validate request
    if (!content || typeof content !== 'string') {
      console.log('❌ Validation failed - content:', content, 'type:', typeof content);
      return res.status(400).json({
        error: 'Content is required and must be a string',
        suggestions: [],
        continuations: []
      });
    }
    
    // Validate content length
    if (content.length > 5000) {
      return res.status(400).json({
        error: 'Content too long (max 5000 characters)',
        suggestions: [],
        continuations: []
      });
    }
    
    // Validate request types
    const validTypes = ['completion', 'continuation'];
    const filteredTypes = requestTypes.filter(type => validTypes.includes(type));
    if (filteredTypes.length === 0) {
      return res.status(400).json({
        error: 'At least one valid request type is required: completion, continuation',
        suggestions: [],
        continuations: []
      });
    }
    
    console.log(`📝 Note suggestions request: ${content.substring(0, 50)}... (category: ${category})`);
    
    // Generate suggestions
    const result = await noteAISuggestionService.suggestNoteContent(
      content,
      category,
      filteredTypes
    );
    
    // Log the result for debugging
    console.log(`✅ Generated ${result.suggestions?.length || 0} completions and ${result.continuations?.length || 0} continuations`);
    
    // Return response
    res.json({
      suggestions: result.suggestions || [],
      continuations: result.continuations || [],
      cached: result.cached || false,
      ...(result.error && { error: result.error })
    });
    
  } catch (error) {
    console.error('❌ Error in note suggestions endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      suggestions: [],
      continuations: []
    });
  }
});

/**
 * POST /api/note-suggestions/clear-cache
 * Clear the note suggestions cache
 */
router.post('/clear-cache', authenticateJWT, (req, res) => {
  try {
    noteAISuggestionService.clearCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('❌ Error clearing note suggestions cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;