import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { storage } from '@/lib/storage';

// Shorter debounce for better responsiveness (was 3000ms)
const NOTES_DEBOUNCE_DELAY = 1000;

// Minimum words before triggering AI suggestions
const MIN_WORDS_FOR_AI = 3; // Lowered from 10 for better responsiveness

// Context window - only send last N sentences to API
const CONTEXT_SENTENCES = 3;

// Cache duration for note suggestions (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

// Throttle AI API calls (minimum time between calls)
const AI_CALL_THROTTLE = 2000; // 2 seconds

interface UseNoteSuggestionsOptions {
  enabled: boolean;
  noteContent: string;
  noteCategory?: string;
}

interface NoteSuggestionResponse {
  suggestions: string[];
  continuations: string[];
  cached?: boolean;
  error?: string;
}

export const useNoteSuggestions = ({ enabled, noteContent, noteCategory }: UseNoteSuggestionsOptions) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [continuations, setContinuations] = useState<string[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTriggerContext, setLastTriggerContext] = useState<string>('');
  
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastApiCall = useRef<number>(0);
  const { token } = useAuth();

  // Get the last few sentences as context (more efficient than full content)
  const getContextWindow = useCallback((content: string): string => {
    if (!content.trim()) return '';
    
    // Split by sentence endings, take last N sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const contextSentences = sentences.slice(-CONTEXT_SENTENCES).join('. ');
    
    // Limit to max 200 characters to control API costs
    return contextSentences.length > 200 
      ? contextSentences.substring(contextSentences.length - 200)
      : contextSentences;
  }, []);

  // Check if we should trigger AI based on content analysis
  const shouldTriggerAI = useCallback((content: string): boolean => {
    if (!enabled || !content.trim()) {
      console.log('❌ Note AI: Disabled or empty content', { enabled, contentLength: content.length });
      return false;
    }
    
    const words = content.trim().split(/\s+/);
    console.log('🔍 Note AI: Checking trigger conditions', { 
      wordCount: words.length, 
      minRequired: MIN_WORDS_FOR_AI, 
      content: content.substring(0, 50) + '...' 
    });
    
    // Must have minimum word count
    if (words.length < MIN_WORDS_FOR_AI) {
      console.log(`❌ Note AI: Not enough words (${words.length}/${MIN_WORDS_FOR_AI})`);
      return false;
    }
    
    // Check if context has changed significantly since last call
    const currentContext = getContextWindow(content);
    // Allow more frequent updates by checking for meaningful changes rather than exact equality
    const contextChanged = currentContext !== lastTriggerContext;
    const contentLengthChanged = Math.abs(content.length - lastTriggerContext.length) > 5;
    
    console.log('🔍 Context change check:', {
      contextChanged,
      contentLengthChanged,
      currentLength: content.length,
      lastLength: lastTriggerContext.length,
      currentContext: currentContext.substring(0, 30),
      lastContext: lastTriggerContext.substring(0, 30)
    });
    
    // Don't block if content has changed meaningfully
    if (!contextChanged && !contentLengthChanged) {
      console.log('❌ Note AI: Context unchanged, skipping');
      return false;
    }
    
    // More responsive trigger points for better autocomplete experience:
    // 1. Ends with sentence completion
    if (/[.!?]\s*$/.test(content.trim())) {
      console.log('✅ Note AI trigger: Sentence completion');
      return true;
    }
    
    // 2. Recent paragraph break
    if (/\n\s*\n\s*\w+/.test(content.slice(-50))) {
      console.log('✅ Note AI trigger: Paragraph break');
      return true;
    }
    
    // 3. After a significant amount of new content (reduced from 100 to 20)
    const newContentLength = Math.abs(content.length - lastTriggerContext.length);
    if (newContentLength > 20) {
      console.log('✅ Note AI trigger: New content length', newContentLength);
      return true;
    }
    
    // 4. Trigger when user has typed enough new content for fresh suggestions
    const wordsSinceLastTrigger = Math.abs(words.length - (lastTriggerContext.trim().split(/\s+/).length || 0));
    if (wordsSinceLastTrigger >= 3) {
      console.log('✅ Note AI trigger: Significant word count change', { wordsSinceLastTrigger });
      return true;
    }
    
    // 5. Trigger if we have context change but no recent suggestions
    if (contextChanged) {
      console.log('✅ Note AI trigger: Context changed');
      return true;
    }
    
    console.log('❌ Note AI: No trigger conditions met');
    return false;
  }, [enabled, getContextWindow, lastTriggerContext]);

  // Get cached suggestions
  const getCachedSuggestions = useCallback((context: string) => {
    try {
      // Use hash of full context instead of just last 50 chars for better cache sensitivity
      const contextHash = context.replace(/\s+/g, ' ').trim().split(' ').slice(-20).join(' ');
      const cacheKey = `note-suggestions-${btoa(contextHash).slice(-50)}-${noteCategory || 'general'}`;
      const cachedData = storage.getJson<{ suggestions: string[]; continuations: string[]; timestamp: number }>(cacheKey);
      
      if (cachedData) {
        const { suggestions, continuations, timestamp } = cachedData;
        if (Date.now() - timestamp < CACHE_DURATION) {
          console.log('📦 Found cached suggestions for context:', contextHash.substring(0, 50));
          return { suggestions: suggestions || [], continuations: continuations || [] };
        }
      }
    } catch (err) {
      console.warn('Failed to read note suggestion cache:', err);
    }
    return null;
  }, [noteCategory]);

  // Cache suggestions
  const cacheSuggestions = useCallback((context: string, newSuggestions: string[], newContinuations: string[]) => {
    try {
      // Use same hash logic as getCachedSuggestions for consistency
      const contextHash = context.replace(/\s+/g, ' ').trim().split(' ').slice(-20).join(' ');
      const cacheKey = `note-suggestions-${btoa(contextHash).slice(-50)}-${noteCategory || 'general'}`;
      const cacheData = {
        suggestions: newSuggestions,
        continuations: newContinuations,
        timestamp: Date.now()
      };
      storage.setJson(cacheKey, cacheData);
      console.log('💾 Cached suggestions for context:', contextHash.substring(0, 50));
    } catch (err) {
      console.warn('Failed to cache note suggestions:', err);
    }
  }, [noteCategory]);

  // Generate local pattern-based suggestions (no API cost)
  const getLocalSuggestions = useCallback((content: string): string[] => {
    const localSuggestions: string[] = [];
    const lastSentence = content.split(/[.!?]/).pop()?.trim() || '';
    
    // Pattern-based completions based on common writing patterns
    if (lastSentence.toLowerCase().includes('i need to')) {
      localSuggestions.push('remember to', 'focus on', 'make sure');
    } else if (lastSentence.toLowerCase().includes('the main')) {
      localSuggestions.push('point is', 'goal is', 'issue is');
    } else if (lastSentence.toLowerCase().includes('next step')) {
      localSuggestions.push('is to', 'would be', 'should be');
    }
    
    // Category-specific patterns
    if (noteCategory?.toLowerCase().includes('meeting')) {
      localSuggestions.push('Action items:', 'Follow up on:', 'Next meeting:');
    } else if (noteCategory?.toLowerCase().includes('project')) {
      localSuggestions.push('Timeline:', 'Resources needed:', 'Deliverables:');
    }
    
    return localSuggestions;
  }, [noteCategory]);

  // Fetch AI suggestions (cost-controlled)
  const fetchAISuggestions = useCallback(async (forceRefresh = false) => {
    if (!token || !enabled) return;
    
    const context = getContextWindow(noteContent);
    if (!context || !shouldTriggerAI(noteContent)) {
      // Use local suggestions instead
      const localSugs = getLocalSuggestions(noteContent);
      setSuggestions(localSugs);
      setCurrentSuggestion(localSugs[0] || null);
      return;
    }
    
    // Check cache first
    const cached = getCachedSuggestions(context);
    if (cached && !forceRefresh) {
      console.log('📦 Using cached note suggestions for context:', context.substring(0, 50));
      setSuggestions(cached.suggestions);
      setContinuations(cached.continuations);
      setCurrentSuggestion(cached.suggestions[0] || cached.continuations[0] || null);
      return;
    }
    
    // Throttle API calls to avoid hitting rate limits
    const now = Date.now();
    if (!forceRefresh && lastApiCall.current && (now - lastApiCall.current) < AI_CALL_THROTTLE) {
      console.log('⏰ Throttling AI call - too soon since last request');
      return;
    }
    
    if (forceRefresh) {
      console.log('🚀 Force refreshing AI suggestions (bypassing throttle and cache)');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      lastApiCall.current = Date.now();
      setLastTriggerContext(context);
      
      const apiUrl = getApiUrl();
      
      const response = await axios.post<NoteSuggestionResponse>(`${apiUrl}/api/note-suggestions`, {
        content: context,
        category: noteCategory,
        // Request both sentence completions and paragraph continuations
        requestTypes: ['completion', 'continuation']
      }, {
        withCredentials: true,
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000 // 10 second timeout
      });

      if (response.data) {
        const { suggestions = [], continuations = [] } = response.data;
        console.log('🚀 Note AI suggestions received:', { 
          suggestions: suggestions.length, 
          continuations: continuations.length,
          firstSuggestion: suggestions[0] || continuations[0] || 'none',
          apiResponse: response.data
        });
        
        setSuggestions(suggestions);
        setContinuations(continuations);
        setCurrentSuggestion(suggestions[0] || continuations[0] || null);
        
        // Cache the results
        cacheSuggestions(context, suggestions, continuations);
      }
    } catch (err: any) {
      console.error('Failed to fetch note AI suggestions:', err);
      
      // Fallback to local suggestions on error
      const localSugs = getLocalSuggestions(noteContent);
      setSuggestions(localSugs);
      setCurrentSuggestion(localSugs[0] || null);
      
      if (err?.response?.status === 401) {
        setError('Session expired. Please log in again.');
      } else {
        setError('AI suggestions temporarily unavailable');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, enabled, noteContent, noteCategory, getContextWindow, shouldTriggerAI, getCachedSuggestions, cacheSuggestions, getLocalSuggestions]);

  // Debounced fetch with smart triggering
  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      fetchAISuggestions();
    }, NOTES_DEBOUNCE_DELAY);
  }, [fetchAISuggestions]);

  // Manual trigger for immediate suggestions
  const triggerSuggestions = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    fetchAISuggestions();
  }, [fetchAISuggestions]);

  // Force refresh suggestions (bypasses cache and throttle)
  const forceRefreshSuggestions = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    fetchAISuggestions(true);
  }, [fetchAISuggestions]);

  // Clear all suggestions from React state
  const clearSuggestions = useCallback(() => {
    console.log('🧹 Clearing suggestions from React state');
    setSuggestions([]);
    setContinuations([]);
    setCurrentSuggestion(null);
  }, []);

  // Get suggestion for current typing position (GitHub Copilot style)
  const getSuggestionForInput = useCallback((content: string, cursorPosition: number): string | null => {
    console.log('🎯 Note getSuggestionForInput:', { 
      enabled, 
      contentLength: content.length, 
      cursorPosition, 
      suggestionsCount: suggestions.length,
      continuationsCount: continuations.length,
      firstSuggestion: suggestions[0]?.substring(0, 30),
      firstContinuation: continuations[0]?.substring(0, 30)
    });
    
    if (!enabled || !content) return null;
    
    // More permissive cursor position validation - allow suggestions in most cases
    const isAtEnd = cursorPosition >= content.length;
    const isAfterSpace = cursorPosition > 0 && /\s/.test(content[cursorPosition - 1]);
    const isAtWordBoundary = cursorPosition === content.length || /\s/.test(content[cursorPosition] || ' ');
    const isInMiddleOfWord = cursorPosition > 0 && cursorPosition < content.length && 
                            !/\s/.test(content[cursorPosition - 1]) && !/\s/.test(content[cursorPosition]);
    
    // Only block suggestions if we're clearly in the middle of a word (not at end, not after space)
    if (isInMiddleOfWord) {
      console.log('❌ Cursor in middle of word, blocking suggestion:', {
        isAtEnd,
        isAfterSpace,
        isAtWordBoundary,
        isInMiddleOfWord,
        charBefore: content[cursorPosition - 1],
        charAfter: content[cursorPosition]
      });
      return null;
    }
    
    console.log('✅ Cursor position valid for suggestions:', {
      isAtEnd,
      isAfterSpace,
      isAtWordBoundary,
      isInMiddleOfWord,
      charBefore: content[cursorPosition - 1],
      charAfter: content[cursorPosition]
    });
    
    // GitHub Copilot style: suggest continuation from current position
    const allSuggestions = [...suggestions, ...continuations];
    
    // Get content from cursor position to analyze context
    const contentBeforeCursor = content.substring(0, cursorPosition);
    const contentAfterCursor = content.substring(cursorPosition);
    
    // Simplified filtering to reduce flashing - only filter obvious duplicates
    const filteredSuggestions = allSuggestions.filter(suggestion => {
      if (!suggestion) return false;
      
      const suggestionTrimmed = suggestion.trim();
      if (!suggestionTrimmed) return false;
      
      // Don't suggest if the suggestion already exists after the cursor
      if (contentAfterCursor.toLowerCase().includes(suggestionTrimmed.toLowerCase())) {
        console.log('🚫 Filtering suggestion already present after cursor:', {
          suggestion: suggestion.substring(0, 30),
          contentAfterCursor: contentAfterCursor.substring(0, 30)
        });
        return false;
      }
      
      // Only filter if the suggestion exactly matches the end of content before cursor
      const contentEnd = contentBeforeCursor.trim().slice(-suggestionTrimmed.length);
      if (contentEnd.toLowerCase() === suggestionTrimmed.toLowerCase()) {
        console.log('🚫 Filtering exact duplicate suggestion:', {
          contentEnd: contentEnd.slice(-30),
          suggestion: suggestion.substring(0, 30)
        });
        return false;
      }
      
      // Filter if suggestion starts with the last few words before cursor (only very obvious cases)
      const lastWords = contentBeforeCursor.trim().split(/\s+/).slice(-2).join(' ').toLowerCase();
      const suggestionStart = suggestionTrimmed.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
      
      if (lastWords.length > 3 && suggestionStart.length > 3 && lastWords === suggestionStart) {
        console.log('🚫 Filtering suggestion starting with recent words:', {
          lastWords,
          suggestionStart,
          suggestion: suggestion.substring(0, 30)
        });
        return false;
      }
      
      return true;
    });
    
    console.log('🔍 Suggestion filtering results:', {
      originalSuggestions: allSuggestions.length,
      filteredSuggestions: filteredSuggestions.length,
      originalFirst: allSuggestions[0]?.substring(0, 30),
      filteredFirst: filteredSuggestions[0]?.substring(0, 30),
      contentBeforeCursor: contentBeforeCursor.substring(-30),
      contentAfterCursor: contentAfterCursor.substring(0, 30)
    });
    
    // Return first non-duplicate suggestion if we have any
    if (filteredSuggestions.length > 0) {
      const suggestion = filteredSuggestions[0];
      console.log('💡 Note autocomplete suggestion (filtered):', suggestion.substring(0, 50));
      return suggestion;
    }
    
    console.log('❌ No non-duplicate suggestions available');
    return null;
  }, [enabled, suggestions, continuations]);
  
  // Helper function to calculate text similarity
  const calculateSimilarity = useCallback((text1: string, text2: string): number => {
    if (!text1 || !text2) return 0;
    
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => 
      word.length > 2 && words2.includes(word)
    ).length;
    
    const totalWords = Math.max(words1.length, words2.length);
    return totalWords > 0 ? commonWords / totalWords : 0;
  }, []);

  // Effect to trigger suggestions on content change
  useEffect(() => {
    if (enabled && noteContent) {
      debouncedFetch();
    }
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [enabled, noteContent, debouncedFetch]);

  return {
    suggestions,
    continuations,
    currentSuggestion,
    isLoading,
    error,
    triggerSuggestions,
    forceRefreshSuggestions,
    clearSuggestions,
    getSuggestionForInput,
    // Metrics for debugging/optimization
    metrics: {
      lastTriggerContext,
      shouldTrigger: shouldTriggerAI(noteContent),
      wordCount: noteContent.trim().split(/\s+/).length,
      contextWindow: getContextWindow(noteContent)
    }
  };
};