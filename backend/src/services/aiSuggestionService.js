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
   * Generate suggestions for note content based on context
   */
  async suggestNoteContent(context, category = '', requestTypes = ['completion', 'continuation']) {
    try {
      // Check if we have enough context
      if (!context || context.length < 10) {
        return { suggestions: [], continuations: [] };
      }

      // Generate cache key for note content
      const cacheKey = `note-${this.generateCacheKey(context)}-${category}`;
      
      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('📦 Using cached note suggestions for context:', context.substring(0, 50));
        return { 
          suggestions: cached.suggestions || [], 
          continuations: cached.continuations || [], 
          cached: true 
        };
      }

      // If no Gemini API access, return empty results
      if (!this.model) {
        console.warn('⚠️ Cannot generate note suggestions: Missing Gemini API key');
        return { suggestions: [], continuations: [], error: 'Missing API key' };
      }

      // Create prompt for note content suggestions
      const prompt = this.createNotePrompt(context, category, requestTypes);
      
      // Call Gemini API
      console.log('🤖 Generating note suggestions for context:', context.substring(0, 50));
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
        }
      });

      // Parse the response
      const text = result.response.text().trim();
      const parsed = this.parseNoteResponse(text, requestTypes);
      
      // Only cache if we got valid suggestions
      if (parsed.suggestions.length > 0 || parsed.continuations.length > 0) {
        this.setInCache(cacheKey, parsed);
      }
      
      return parsed;
      
    } catch (error) {
      console.error('❌ Error generating note suggestions:', error);
      return { suggestions: [], continuations: [], error: error.message };
    }
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

  /**
   * Generate a cache key from context using last 20 words for better uniqueness
   */
  generateCacheKey(context) {
    const words = context.split(/\s+/).filter(word => word.length > 0);
    const lastWords = words.slice(-20).join(' ');
    return Buffer.from(lastWords).toString('base64').substring(0, 50);
  }

  /**
   * Create a prompt for note content suggestions
   */
  createNotePrompt(context, category, requestTypes) {
    const hasCompletion = requestTypes.includes('completion');
    const hasContinuation = requestTypes.includes('continuation');
    
    let prompt = `You are helping with smart autocomplete for note-taking. The user is writing a note`;
    
    if (category) {
      prompt += ` in the "${category}" category`;
    }
    
    prompt += `.\n\nCurrent context:\n"${context}"\n\n`;
    
    if (hasCompletion && hasContinuation) {
      prompt += `Please provide:
1. COMPLETIONS: 4 short phrase completions (3-8 words) that could finish the current sentence naturally
2. CONTINUATIONS: 2 longer continuations (10-20 words) that could start the next sentence or paragraph

Focus on:
- Natural, contextually relevant suggestions
- Maintaining the writing style and tone
- Providing helpful, intelligent continuations
- Avoiding generic or repetitive phrases

Format your response exactly as:
COMPLETIONS:
[completion 1]
[completion 2]
[completion 3]
[completion 4]

CONTINUATIONS:
[continuation 1]
[continuation 2]`;
    } else if (hasCompletion) {
      prompt += `Please provide 4 short phrase completions (3-8 words) that could finish the current sentence naturally. Focus on contextually relevant and intelligent suggestions.

Return only the completions, one per line, with no additional formatting.`;
    } else if (hasContinuation) {
      prompt += `Please provide 2 longer continuations (10-20 words) that could start the next sentence or paragraph. Focus on natural flow and helpful content.

Return only the continuations, one per line, with no additional formatting.`;
    }
    
    return prompt;
  }

  /**
   * Parse the note AI response into suggestions and continuations
   */
  parseNoteResponse(text, requestTypes) {
    const hasCompletion = requestTypes.includes('completion');
    const hasContinuation = requestTypes.includes('continuation');
    
    let suggestions = [];
    let continuations = [];
    
    if (hasCompletion && hasContinuation && text.includes('COMPLETIONS:') && text.includes('CONTINUATIONS:')) {
      // Parse structured response
      const parts = text.split('CONTINUATIONS:');
      const completionsSection = parts[0].replace('COMPLETIONS:', '').trim();
      const continuationsSection = parts[1] ? parts[1].trim() : '';
      
      suggestions = completionsSection.split('\n')
        .map(line => line.trim())
        .filter(line => this.isValidSuggestion(line))
        .slice(0, 4);
        
      continuations = continuationsSection.split('\n')
        .map(line => line.trim())
        .filter(line => this.isValidSuggestion(line))
        .slice(0, 2);
    } else {
      // Parse simple response - treat as completions or continuations based on length
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => this.isValidSuggestion(line));
        
      for (const line of lines) {
        if (line.length <= 50 && suggestions.length < 4) {
          suggestions.push(line);
        } else if (line.length > 50 && continuations.length < 2) {
          continuations.push(line);
        }
      }
    }
    
    // Ensure suggestions start with space if they don't already
    suggestions = suggestions.map(s => s.startsWith(' ') ? s : ` ${s}`);
    continuations = continuations.map(c => c.startsWith(' ') ? c : ` ${c}`);
    
    return { suggestions, continuations };
  }

  /**
   * Check if a suggestion is valid and should be included
   */
  isValidSuggestion(line) {
    if (!line || line.length === 0 || line.length > 200) {
      return false;
    }
    
    // Filter out structured markers and labels
    const invalidPatterns = [
      /^\d+\.\s/,           // "1. " numbered lists
      /^-\s/,               // "- " bullet points
      /^[A-Z]+:/,           // "COMPLETIONS:", "CONTINUATIONS:", etc.
      /^:\w+/,              // ":timeline", ":note", ":section", etc.
      /^\[.*\]$/,           // "[completion 1]", "[example]", etc.
      /^#{1,6}\s/,          // Markdown headers "# ", "## ", etc.
      /^\*\*.*\*\*$/,       // Bold markdown "**text**"
      /^_.*_$/,             // Italic markdown "_text_"
      /^`.*`$/,             // Code markdown "`code`"
      /^here\s+(are|is)/i,  // "Here are some suggestions..."
      /^suggestions?:/i,    // "Suggestions:", "Suggestion:"
      /^examples?:/i,       // "Examples:", "Example:"
    ];
    
    // Check if line matches any invalid pattern
    const isInvalid = invalidPatterns.some(pattern => pattern.test(line));
    
    if (isInvalid) {
      console.log('🚫 Filtered out invalid suggestion:', line);
      return false;
    }
    
    return true;
  }
}

// Export as singleton
module.exports = new AISuggestionService();
