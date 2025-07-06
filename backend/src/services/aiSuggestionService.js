const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * AI Suggestion Service
 * 
 * A service to generate list item suggestions using Google's Gemini API.
 * It includes basic caching to minimize API calls.
 */
class AISuggestionService {
  constructor() {
    // Initialize Gemini API client using environment variable
    this.genAI = process.env.GEMINI_API_KEY ? 
      new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    
    if (this.genAI) {
      // Use Gemini 1.5 Flash for quicker responses
      this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      console.log('✅ AI Suggestion Service initialized');
    } else {
      console.warn('⚠️ AI Suggestion Service initialized without API key');
    }
    
    // Simple in-memory cache with 1-hour expiry
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Generate suggestions for list items based on list title and existing items
   */
  async suggestListItems(listTitle, existingItems = []) {
    try {
      // Check if we have enough context (at least one item required)
      if (!listTitle || existingItems.length === 0) {
        return { suggestions: [] };
      }

      // Generate cache key
      const cacheKey = `${listTitle}-${existingItems.join(',').slice(0, 100)}`;
      
      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('📦 Using cached suggestions for:', listTitle);
        return { suggestions: cached, cached: true };
      }

      // If no Gemini API access, return empty results
      if (!this.model) {
        console.warn('⚠️ Cannot generate suggestions: Missing Gemini API key');
        return { suggestions: [], error: 'Missing API key' };
      }

      // Create prompt for the AI
      const prompt = this.createPrompt(listTitle, existingItems);
      
      // Call Gemini API
      console.log('🤖 Generating suggestions for:', listTitle);
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 200, // Increased to allow more detailed suggestions
          temperature: 0.7,    // Increased for more diverse suggestions
          topK: 40,
          topP: 0.95,         // Increased for more variety
        }
      });

      // Parse the response
      const text = result.response.text().trim();
      const suggestions = this.parseResponse(text);
      
      // Only cache if we got valid suggestions
      if (suggestions.length > 0) {
        this.setInCache(cacheKey, suggestions);
      }
      
      return { suggestions };
      
    } catch (error) {
      console.error('❌ Error generating suggestions:', error);
      return { suggestions: [], error: error.message };
    }
  }

  /**
   * Generate suggestions for note content based on existing content
   */
  async suggestNoteContent(content) {
    try {
      // Check if we have enough context
      if (!content || content.trim().length < 10) {
        return { suggestions: [] };
      }

      // Generate cache key based on content hash
      const contentHash = this.generateContentHash(content);
      const cacheKey = `note-content-${contentHash}`;
      
      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('📦 Using cached note suggestions for content hash:', contentHash.slice(0, 8));
        return { suggestions: cached, cached: true };
      }

      // If no Gemini API access, return empty results
      if (!this.model) {
        console.warn('⚠️ Cannot generate note suggestions: Missing Gemini API key');
        return { suggestions: [], error: 'Missing API key' };
      }

      // Create prompt for note content suggestions
      const prompt = this.createNotePrompt(content);
      
      // Call Gemini API
      console.log('🤖 Generating note suggestions for content length:', content.length);
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.6,
          topK: 30,
          topP: 0.8,
        }
      });

      // Parse the response
      const text = result.response.text().trim();
      const suggestions = this.parseNoteResponse(text);
      
      // Only cache if we got valid suggestions
      if (suggestions.length > 0) {
        this.setInCache(cacheKey, suggestions);
      }
      
      return { suggestions };
      
    } catch (error) {
      console.error('❌ Error generating note suggestions:', error);
      return { suggestions: [], error: error.message };
    }
  }

  /**
   * Create a prompt for note content suggestions
   */
  createNotePrompt(content) {
    // Analyze content to determine context
    const contentLower = content.toLowerCase();
    const contentLength = content.length;
    
    // Determine what type of suggestion would be most helpful
    let suggestionType = 'continuation';
    if (contentLength < 100) {
      suggestionType = 'expansion';
    } else if (content.includes('?') || contentLower.includes('how') || contentLower.includes('what') || contentLower.includes('why')) {
      suggestionType = 'answer';
    } else if (content.includes('TODO') || content.includes('- [ ]') || contentLower.includes('need to') || contentLower.includes('should')) {
      suggestionType = 'action';
    }

    return `
      Based on this note content, suggest a helpful continuation or addition that would naturally flow from what's already written:
      
      "${content}"
      
      Provide a single, concise suggestion (1-2 sentences) that would:
      - Naturally continue the thought or topic
      - Add valuable information or insight
      - Help complete an incomplete thought
      - Provide a logical next step if it's a task or process
      
      The suggestion should feel like a natural extension of the existing content and be immediately useful to the writer.
      
      Return ONLY the suggested text with no additional formatting, explanations, or quotation marks.
    `;
  }

  /**
   * Parse note content response
   */
  parseNoteResponse(text) {
    // Clean up the response
    const cleaned = text.trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^Suggestion:\s*/i, '') // Remove "Suggestion:" prefix
      .trim();
    
    // Return as single suggestion if valid
    if (cleaned.length > 10 && cleaned.length < 300) {
      return [cleaned];
    }
    
    return [];
  }

  /**
   * Generate a simple hash for content caching
   */
  generateContentHash(content) {
    // Simple hash function for caching purposes
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Create an optimized prompt for the Gemini API with enhanced context
   */
  createPrompt(listTitle, existingItems) {
    // Detect list type to provide more contextual suggestions
    const titleLower = listTitle.toLowerCase();
    let listType = this.detectListType(titleLower);
    let listContext = this.getListContext(listType, existingItems);
    
    return `
      I have a list named "${listTitle}" which is a ${listType} list.
      
      ${listContext}
      
      The list currently contains: ${existingItems.join(', ')}
      
      Based on this context, suggest 7 highly relevant items that would complement this list.
      Think about:
      - Items commonly purchased/used together with the existing items
      - Items that would logically complete the list
      - Items that might be forgotten but are important
      - A mix of both obvious and non-obvious but useful suggestions
      
      For example, if someone has "milk, eggs, cereal" on their grocery list, you might suggest "bread, butter, orange juice, coffee, yogurt, cheese, bacon"
      
      Return ONLY a comma-separated list of items with no additional text, explanations, or formatting.
      Items should be concise (1-4 words each) and directly usable.
    `;
  }
  
  /**
   * Detect the type of list based on title and existing items
   */
  detectListType(titleLower) {
    // Primary detection from title keywords
    if (titleLower.includes('shop') || titleLower.includes('grocer') || titleLower.includes('store') || titleLower.includes('market')) {
      return 'grocery shopping';
    } else if (titleLower.includes('todo') || titleLower.includes('task') || titleLower.includes('chore')) {
      return 'todo';
    } else if (titleLower.includes('pack') || titleLower.includes('travel') || titleLower.includes('trip') || titleLower.includes('vacation')) {
      return 'packing';
    } else if (titleLower.includes('wish') || titleLower.includes('want') || titleLower.includes('gift')) {
      return 'wishlist';
    } else if (titleLower.includes('recipe') || titleLower.includes('cook') || titleLower.includes('bak') || titleLower.includes('ingredient') || titleLower.includes('food')) {
      return 'recipe';
    } else if (titleLower.includes('project') || titleLower.includes('material') || titleLower.includes('supply')) {
      return 'project';
    } else if (titleLower.includes('work') || titleLower.includes('office') || titleLower.includes('business')) {
      return 'work';
    } else if (titleLower.includes('clean') || titleLower.includes('household')) {
      return 'cleaning';
    } else if (titleLower.includes('party') || titleLower.includes('event') || titleLower.includes('celebration')) {
      return 'event';
    } else {
      // Default to generic if no specific type detected
      return 'general';
    }
  }
  
  /**
   * Provide rich context information based on list type
   */
  getListContext(listType, existingItems) {
    // Convert items to lowercase for better pattern matching
    const lowerItems = existingItems.map(item => item.toLowerCase());
    
    switch(listType) {
      case 'grocery shopping':
        let groceryContext = 'This is a grocery shopping list. Think about different categories:';
        
        // Check if the list has certain types of items to provide more specific context
        if (this.containsAnyOf(lowerItems, ['milk', 'cheese', 'yogurt', 'cream'])) {
          groceryContext += '\n- Include other dairy items that complement these';
        }
        if (this.containsAnyOf(lowerItems, ['bread', 'cereal', 'rice', 'pasta', 'flour'])) {
          groceryContext += '\n- Add bakery/grain products that go well with these';
        }
        if (this.containsAnyOf(lowerItems, ['apple', 'banana', 'orange', 'grape', 'berry', 'fruit'])) {
          groceryContext += '\n- Suggest more fruits or related items';
        }
        if (this.containsAnyOf(lowerItems, ['lettuce', 'tomato', 'onion', 'potato', 'carrot', 'vegetable'])) {
          groceryContext += '\n- Include more vegetables or complementary produce';
        }
        if (this.containsAnyOf(lowerItems, ['chicken', 'beef', 'pork', 'fish', 'meat'])) {
          groceryContext += '\n- Suggest proteins or items that go well with these meats';
        }
        if (this.containsAnyOf(lowerItems, ['cookie', 'cake', 'ice cream', 'chocolate', 'candy'])) {
          groceryContext += '\n- Include dessert items or baking ingredients';
        }
        
        // Always remind about commonly forgotten household/grocery items
        groceryContext += '\n\nConsider commonly forgotten household items like paper towels, dish soap, trash bags, etc.';
        groceryContext += '\nAlso consider condiments, spices, and other items that complete meals like salsa, ketchup, olive oil, etc.';
        
        return groceryContext;
        
      case 'todo':
        return 'This is a to-do list. Suggest practical tasks that might complement the existing ones. Include both quick tasks and more substantial ones. Consider different categories like household maintenance, personal errands, financial tasks, health-related activities, etc.';
        
      case 'packing':
        return 'This is a packing list. Suggest essential items people often forget when packing. Consider categories like clothing, toiletries, electronics, documents, medications, and comfort items. Include both obvious necessities and easily forgotten but important items.';
        
      case 'wishlist':
        return 'This is a wishlist. Suggest desirable items that complement the existing ones. Think about both practical and aspirational items at different price points. Consider accessories or complementary items that would enhance the existing wishes.';
        
      case 'recipe':
        return 'This is a recipe ingredient list. Suggest complementary ingredients, spices, garnishes or additional items needed to complete a dish. Include both essentials that might have been forgotten and enhancers that would elevate the recipe.';
        
      case 'project':
        return 'This is a project supplies list. Suggest additional materials, tools, and items needed to successfully complete the project. Think about both essential components and helpful extras that improve results or make the work easier.';
        
      case 'work':
        return 'This is a work-related list. Suggest items, tasks or resources that would enhance productivity and organization in a work environment. Include both physical items and digital resources or actions.';
        
      case 'cleaning':
        return 'This is a cleaning supplies or tasks list. Suggest additional cleaning products, tools, or tasks that would create a comprehensive cleaning routine. Include both commonly used and specialized items for different surfaces or areas.';
        
      case 'event':
        return 'This is an event planning list. Suggest additional items, decorations, food, activities or logistics to consider. Include both essential and nice-to-have items that enhance the event experience.';
        
      default:
        return 'Based on this list, suggest additional items that would complement or complete it. Consider both essential items that might be missing and helpful additions that would enhance the usefulness of this list.';
    }
  }
  
  /**
   * Helper to check if an array contains any of the specified terms
   */
  containsAnyOf(items, terms) {
    return items.some(item => {
      return terms.some(term => item.includes(term));
    });
  }

  /**
   * Parse the AI response into a clean array of suggestions
   */
  parseResponse(text) {
    // Split by commas or newlines, clean up each item, and filter out empty strings
    return text.split(/[,\n]/) // Split by comma or newline
      .map(item => item.trim())
      .filter(item => {
        // Must not be empty and not be too long
        const valid = item.length > 0 && item.length < 50;
        // Filter out list markers like "1. " or "- "
        return valid && !(/^\d+\.\s|^-\s/).test(item);
      })
      .filter((item, index, self) => 
        // Remove duplicates (case insensitive)
        index === self.findIndex(t => t.toLowerCase() === item.toLowerCase())
      )
      .slice(0, 10); // Limit to max 10 suggestions
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  getFromCache(key) {
    if (this.cache.has(key)) {
      const { value, timestamp } = this.cache.get(key);
      const now = Date.now();
      
      // Check if the cache entry has expired
      if (now - timestamp < this.cacheTTL) {
        return value;
      } else {
        // Remove expired cache entry
        this.cache.delete(key);
      }
    }
    return null;
  }

  /**
   * Set a value in the cache with the current timestamp
   */
  setInCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    // Cleanup cache if it gets too large
    if (this.cache.size > 100) {
      const oldestKey = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
  }
}

// Export as singleton
module.exports = new AISuggestionService();
