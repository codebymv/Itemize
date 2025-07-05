const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Note AI Suggestion Service
 * 
 * A service to generate note content suggestions and continuations using Google's Gemini API.
 * It includes caching and handles both sentence completions and paragraph continuations.
 */
class NoteAISuggestionService {
  constructor() {
    // Initialize Gemini API client using environment variable
    this.genAI = process.env.GEMINI_API_KEY ? 
      new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    
    if (this.genAI) {
      // Use Gemini 1.5 Flash for quicker responses
      this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      console.log('✅ Note AI Suggestion Service initialized');
    } else {
      console.warn('⚠️ Note AI Suggestion Service initialized without API key');
    }
    
    // Simple in-memory cache with 1-hour expiry
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Generate suggestions for note content based on context and category
   */
  async suggestNoteContent(context, category = 'general', requestTypes = ['completion', 'continuation']) {
    try {
      // Check if we have enough context
      if (!context || context.trim().length < 10) {
        return { suggestions: [], continuations: [] };
      }

      // Generate cache key
      const cacheKey = `note-${context.slice(-100)}-${category}-${requestTypes.join(',')}`;
      
      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('📦 Using cached note suggestions for context:', context.substring(0, 50));
        return { ...cached, cached: true };
      }

      // If no Gemini API access, return empty results
      if (!this.model) {
        console.warn('⚠️ Cannot generate note suggestions: Missing Gemini API key');
        return { suggestions: [], continuations: [], error: 'Missing API key' };
      }

      // Create prompt for the AI
      const prompt = this.createNotePrompt(context, category, requestTypes);
      
      // Call Gemini API
      console.log('🤖 Generating note suggestions for context:', context.substring(0, 50));
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
          topK: 40,
          topP: 0.9,
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
   * Create an optimized prompt for note content suggestions
   */
  createNotePrompt(context, category, requestTypes) {
    const categoryContext = this.getCategoryContext(category);
    const lastSentence = this.getLastSentence(context);
    const isIncomplete = this.isIncompleteSentence(lastSentence);
    
    let prompt = `You are helping someone write notes in the "${category}" category. ${categoryContext}\n\n`;
    prompt += `Current note content context:\n"${context}"\n\n`;
    
    if (requestTypes.includes('completion') && isIncomplete) {
      prompt += `The last sentence appears incomplete: "${lastSentence}"\n`;
      prompt += `Provide 3-5 short, natural completions for this sentence. Each completion should be 1-8 words that would naturally follow.\n\n`;
    }
    
    if (requestTypes.includes('continuation')) {
      prompt += `Suggest 3-5 natural continuations that could follow this content. Each should be a complete sentence or phrase (10-25 words) that logically continues the thought or adds relevant information.\n\n`;
    }
    
    prompt += `Format your response as:\n`;
    if (requestTypes.includes('completion')) {
      prompt += `COMPLETIONS:\n- completion1\n- completion2\n- completion3\n\n`;
    }
    if (requestTypes.includes('continuation')) {
      prompt += `CONTINUATIONS:\n- continuation1\n- continuation2\n- continuation3\n\n`;
    }
    
    prompt += `Keep suggestions concise, natural, and contextually relevant. Avoid repetition of existing content.`;
    
    return prompt;
  }

  /**
   * Get category-specific context for better suggestions
   */
  getCategoryContext(category) {
    const categoryLower = category.toLowerCase();
    
    if (categoryLower.includes('meeting')) {
      return 'This is meeting notes. Focus on action items, decisions, follow-ups, and key discussion points.';
    } else if (categoryLower.includes('project')) {
      return 'This is project notes. Focus on tasks, timelines, resources, deliverables, and progress updates.';
    } else if (categoryLower.includes('research')) {
      return 'This is research notes. Focus on findings, sources, analysis, and conclusions.';
    } else if (categoryLower.includes('idea') || categoryLower.includes('brainstorm')) {
      return 'This is idea/brainstorming notes. Focus on creative concepts, possibilities, and innovative thinking.';
    } else if (categoryLower.includes('personal') || categoryLower.includes('journal')) {
      return 'This is personal notes. Focus on thoughts, reflections, experiences, and personal insights.';
    } else if (categoryLower.includes('learning') || categoryLower.includes('study')) {
      return 'This is learning/study notes. Focus on key concepts, explanations, examples, and knowledge retention.';
    } else {
      return 'This is general notes. Provide helpful, relevant suggestions that naturally continue the thought.';
    }
  }

  /**
   * Extract the last sentence from context
   */
  getLastSentence(context) {
    const sentences = context.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences[sentences.length - 1]?.trim() || '';
  }

  /**
   * Check if the last sentence appears incomplete
   */
  isIncompleteSentence(sentence) {
    if (!sentence) return false;
    
    // Common patterns that suggest incomplete sentences
    const incompletePatterns = [
      /\b(the|a|an|this|that|these|those)$/i,
      /\b(is|are|was|were|will|would|should|could|can|may|might)$/i,
      /\b(to|for|with|by|in|on|at|of|from)$/i,
      /\b(and|or|but|so|because|since|while|when|if|unless)$/i,
      /\b(need|want|have|had|get|got|make|take|give|put)$/i
    ];
    
    return incompletePatterns.some(pattern => pattern.test(sentence));
  }

  /**
   * Parse the AI response into suggestions and continuations
   */
  parseNoteResponse(text, requestTypes) {
    const result = { suggestions: [], continuations: [] };
    
    try {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let currentSection = null;
      
      for (const line of lines) {
        if (line.toUpperCase().includes('COMPLETIONS:')) {
          currentSection = 'completions';
          continue;
        } else if (line.toUpperCase().includes('CONTINUATIONS:')) {
          currentSection = 'continuations';
          continue;
        }
        
        // Parse items (remove bullet points and clean up)
        if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
          const item = line.replace(/^[-•*]\s*/, '').trim();
          if (item.length > 0) {
            if (currentSection === 'completions' && requestTypes.includes('completion')) {
              result.suggestions.push(item);
            } else if (currentSection === 'continuations' && requestTypes.includes('continuation')) {
              result.continuations.push(item);
            }
          }
        }
      }
      
      // Fallback: if no structured format, try to extract any useful content
      if (result.suggestions.length === 0 && result.continuations.length === 0) {
        const fallbackItems = text.split(/[\n,]/).map(item => item.trim()).filter(item => item.length > 0 && item.length < 100);
        if (requestTypes.includes('continuation')) {
          result.continuations = fallbackItems.slice(0, 3);
        } else if (requestTypes.includes('completion')) {
          result.suggestions = fallbackItems.slice(0, 3);
        }
      }
      
    } catch (error) {
      console.error('Error parsing note response:', error);
    }
    
    // Limit results
    result.suggestions = result.suggestions.slice(0, 5);
    result.continuations = result.continuations.slice(0, 5);
    
    return result;
  }

  /**
   * Cache management methods
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired entry
    }
    return null;
  }

  setInCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Simple cache cleanup - remove old entries if cache gets too large
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear all cached suggestions
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Note AI suggestion cache cleared');
  }
}

module.exports = new NoteAISuggestionService();