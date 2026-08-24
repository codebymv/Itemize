import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '@/lib/storage';
import logger from '@/lib/logger';
import { fetchNoteSuggestions } from '@/services/aiGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { buildSuggestionCacheKey } from './aiSuggestionCache';

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

const getApiStatus = (error: unknown): number | undefined => {
  if (error instanceof GraphqlRequestError) {
    return error.code === 'UNAUTHENTICATED' ? 401 : error.status;
  }
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: unknown } }).response;
    if (typeof response?.status === 'number') {
      return response.status;
    }
  }
  return undefined;
};

export const useNoteSuggestions = ({ enabled, noteContent, noteCategory }: UseNoteSuggestionsOptions) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [continuations, setContinuations] = useState<string[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const lastTriggerContext = useRef<string>('');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastApiCall = useRef<number>(0);
  const requestSequence = useRef(0);
  const { isAuthenticated } = useAuth();

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
      logger.debug('note-suggestions', 'Disabled or empty content', { enabled, contentLength: content.length });
      return false;
    }
    
    const words = content.trim().split(/\s+/);
    logger.debug('note-suggestions', 'Checking trigger conditions', { 
      wordCount: words.length, 
      minRequired: MIN_WORDS_FOR_AI, 
      content: content.substring(0, 50) + '...' 
    });
    
    // Must have minimum word count
    if (words.length < MIN_WORDS_FOR_AI) {
      logger.debug('note-suggestions', `Not enough words (${words.length}/${MIN_WORDS_FOR_AI})`);
      return false;
    }
    
    // Check if context has changed significantly since last call
    const currentContext = getContextWindow(content);
    // Allow more frequent updates by checking for meaningful changes rather than exact equality
    const contextChanged = currentContext !== lastTriggerContext.current;
    const contentLengthChanged = Math.abs(content.length - lastTriggerContext.current.length) > 5;
    
    logger.debug('note-suggestions', 'Context change check:', {
      contextChanged,
      contentLengthChanged,
      currentLength: content.length,
      lastLength: lastTriggerContext.current.length,
      currentContext: currentContext.substring(0, 30),
      lastContext: lastTriggerContext.current.substring(0, 30)
    });
    
    // Don't block if content has changed meaningfully
    if (!contextChanged && !contentLengthChanged) {
      logger.debug('note-suggestions', 'Context unchanged, skipping');
      return false;
    }
    
    // More responsive trigger points for better autocomplete experience:
    // 1. Ends with sentence completion
    if (/[.!?]\s*$/.test(content.trim())) {
      logger.debug('note-suggestions', 'Trigger: Sentence completion');
      return true;
    }
    
    // 2. Recent paragraph break
    if (/\n\s*\n\s*\w+/.test(content.slice(-50))) {
      logger.debug('note-suggestions', 'Trigger: Paragraph break');
      return true;
    }
    
    // 3. After a significant amount of new content (reduced from 100 to 20)
    const newContentLength = Math.abs(content.length - lastTriggerContext.current.length);
    if (newContentLength > 20) {
      logger.debug('note-suggestions', 'Trigger: New content length', newContentLength);
      return true;
    }
    
    // 4. Trigger when user has typed enough new content for fresh suggestions
    const wordsSinceLastTrigger = Math.abs(words.length - (lastTriggerContext.current.trim().split(/\s+/).length || 0));
    if (wordsSinceLastTrigger >= 3) {
      logger.debug('note-suggestions', 'Trigger: Significant word count change', { wordsSinceLastTrigger });
      return true;
    }
    
    // 5. Trigger if we have context change but no recent suggestions
    if (contextChanged) {
      logger.debug('note-suggestions', 'Trigger: Context changed');
      return true;
    }
    
    logger.debug('note-suggestions', 'No trigger conditions met');
    return false;
  }, [enabled, getContextWindow]);

  // Get cached suggestions
  const getCachedSuggestions = useCallback((context: string) => {
    try {
      const normalizedContext = context.replace(/\s+/g, ' ').trim();
      const cacheKey = buildSuggestionCacheKey('note', normalizedContext, noteCategory || 'general');
      const cachedData = storage.getJson<{ suggestions: string[]; continuations: string[]; timestamp: number }>(cacheKey);
      
      if (cachedData) {
        const { suggestions, continuations, timestamp } = cachedData;
        if (Date.now() - timestamp < CACHE_DURATION) {
          logger.debug('note-suggestions', 'Found cached suggestions');
          return { suggestions: suggestions || [], continuations: continuations || [] };
        }
      }
    } catch (err) {
      logger.warn('Failed to read note suggestion cache:', err);
    }
    return null;
  }, [noteCategory]);

  // Cache suggestions
  const cacheSuggestions = useCallback((context: string, newSuggestions: string[], newContinuations: string[]) => {
    try {
      const normalizedContext = context.replace(/\s+/g, ' ').trim();
      const cacheKey = buildSuggestionCacheKey('note', normalizedContext, noteCategory || 'general');
      const cacheData = {
        suggestions: newSuggestions,
        continuations: newContinuations,
        timestamp: Date.now()
      };
      storage.setJson(cacheKey, cacheData);
      logger.debug('note-suggestions', 'Cached suggestions');
    } catch (err) {
      logger.warn('Failed to cache note suggestions:', err);
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
    if (!isAuthenticated || !enabled) return;
    const requestId = ++requestSequence.current;
    
    const context = getContextWindow(noteContent);
    if (!context || !shouldTriggerAI(noteContent)) {
      // Use local suggestions instead
      const localSugs = getLocalSuggestions(noteContent);
      if (requestId !== requestSequence.current) return;
      setSuggestions(localSugs);
      setCurrentSuggestion(localSugs[0] || null);
      return;
    }
    
    // Check cache first
    const cached = getCachedSuggestions(context);
    if (cached && !forceRefresh) {
      if (requestId !== requestSequence.current) return;
      logger.debug('note-suggestions', 'Using cached note suggestions for context:', context.substring(0, 50));
      setSuggestions(cached.suggestions);
      setContinuations(cached.continuations);
      setCurrentSuggestion(cached.suggestions[0] || cached.continuations[0] || null);
      return;
    }
    
    // Throttle API calls to avoid hitting rate limits
    const now = Date.now();
    if (!forceRefresh && lastApiCall.current && (now - lastApiCall.current) < AI_CALL_THROTTLE) {
      const delay = AI_CALL_THROTTLE - (now - lastApiCall.current);
      logger.debug('note-suggestions', `Throttling AI call for ${delay}ms`);
      debounceTimer.current = setTimeout(() => {
        void fetchAISuggestions(forceRefresh);
      }, delay);
      return;
    }
    
    if (forceRefresh) {
      logger.debug('note-suggestions', 'Force refreshing AI suggestions (bypassing throttle and cache)');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      lastApiCall.current = Date.now();
      lastTriggerContext.current = context;
      
      const response = await fetchNoteSuggestions(context);

      if (requestId !== requestSequence.current) return;
      if (response.error) {
        setSuggestions([]);
        setContinuations([]);
        setCurrentSuggestion(null);
        setError(response.error);
        return;
      }

      if (response) {
        const { suggestions = [] } = response;
        const continuations: string[] = [];
        logger.debug('note-suggestions', 'AI suggestions received:', { 
          suggestions: suggestions.length, 
          continuations: continuations.length,
          firstSuggestion: suggestions[0] || continuations[0] || 'none',
          apiResponse: response
        });
        
        setSuggestions(suggestions);
        setContinuations(continuations);
        setCurrentSuggestion(suggestions[0] || continuations[0] || null);
        
        // Cache results
        cacheSuggestions(context, suggestions, continuations);
      }
    } catch (err: unknown) {
      if (requestId !== requestSequence.current) return;
      logger.error('Failed to fetch note AI suggestions:', err);
      
      // Fallback to local suggestions on error
      const localSugs = getLocalSuggestions(noteContent);
      setSuggestions(localSugs);
      setCurrentSuggestion(localSugs[0] || null);
      
      if (getApiStatus(err) === 401) {
        setError('Session expired. Please log in again.');
      } else {
        setError('AI suggestions temporarily unavailable');
      }
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [isAuthenticated, enabled, noteContent, getContextWindow, shouldTriggerAI, getCachedSuggestions, cacheSuggestions, getLocalSuggestions]);

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
    requestSequence.current += 1;
    logger.debug('note-suggestions', 'Clearing suggestions from React state');
    setSuggestions([]);
    setContinuations([]);
    setCurrentSuggestion(null);
  }, []);

  // Get suggestion for current typing position (GitHub Copilot style)
  const getSuggestionForInput = useCallback((content: string, cursorPosition: number): string | null => {
    logger.debug('note-suggestions', 'getSuggestionForInput:', { 
      enabled, 
      contentLength: content.length, 
      cursorPosition, 
      suggestionsCount: suggestions.length,
      continuationsCount: continuations.length,
      firstSuggestion: suggestions[0]?.substring(0, 30),
      firstContinuation: continuations[0]?.substring(0, 30)
    });
    
    if (!enabled || !content) return null;
    
    const isAtEnd = cursorPosition >= content.length;
    if (!isAtEnd) return null;
    
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
        logger.debug('note-suggestions', 'Filtering suggestion already present after cursor:', {
          suggestion: suggestion.substring(0, 30),
          contentAfterCursor: contentAfterCursor.substring(0, 30)
        });
        return false;
      }
      
      // Only filter if the suggestion exactly matches the end of content before cursor
      const contentEnd = contentBeforeCursor.trim().slice(-suggestionTrimmed.length);
      if (contentEnd.toLowerCase() === suggestionTrimmed.toLowerCase()) {
        logger.debug('note-suggestions', 'Filtering exact duplicate suggestion:', {
          contentEnd: contentEnd.slice(-30),
          suggestion: suggestion.substring(0, 30)
        });
        return false;
      }
      
      // Filter if suggestion starts with the last few words before cursor (only very obvious cases)
      const lastWords = contentBeforeCursor.trim().split(/\s+/).slice(-2).join(' ').toLowerCase();
      const suggestionStart = suggestionTrimmed.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
      
      if (lastWords.length > 3 && suggestionStart.length > 3 && lastWords === suggestionStart) {
        logger.debug('note-suggestions', 'Filtering suggestion starting with recent words:', {
          lastWords,
          suggestionStart,
          suggestion: suggestion.substring(0, 30)
        });
        return false;
      }
      
      return true;
    });
    
    logger.debug('note-suggestions', 'Suggestion filtering results:', {
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
      logger.debug('note-suggestions', 'Autocomplete suggestion (filtered):', suggestion.substring(0, 50));
      return suggestion;
    }
    
    logger.debug('note-suggestions', 'No non-duplicate suggestions available');
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
    } else {
      requestSequence.current += 1;
      setSuggestions([]);
      setContinuations([]);
      setCurrentSuggestion(null);
      setError(null);
      setIsLoading(false);
    }
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      requestSequence.current += 1;
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
      lastTriggerContext: lastTriggerContext.current,
      shouldTrigger: shouldTriggerAI(noteContent),
      wordCount: noteContent.trim().split(/\s+/).length,
      contextWindow: getContextWindow(noteContent)
    }
  };
};
