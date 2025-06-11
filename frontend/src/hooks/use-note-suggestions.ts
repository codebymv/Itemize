import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// Shorter debounce for better responsiveness (was 3000ms)
const NOTES_DEBOUNCE_DELAY = 1000;

// Minimum words before triggering AI suggestions
const MIN_WORDS_FOR_AI = 3; // Lowered from 10 for better responsiveness

// Context window - only send last N sentences to API
const CONTEXT_SENTENCES = 3;

// Cache duration for note suggestions (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

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
    if (currentContext === lastTriggerContext) return false;
    
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
    
    // 4. Always trigger for responsive autocomplete (like lists)
    console.log('✅ Note AI trigger: Always responsive');
    return true;
  }, [enabled, getContextWindow, lastTriggerContext]);

  // Get cached suggestions
  const getCachedSuggestions = useCallback((context: string) => {
    try {
      const cacheKey = `note-suggestions-${context.slice(-50)}-${noteCategory || 'general'}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        const { suggestions, continuations, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_DURATION) {
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
      const cacheKey = `note-suggestions-${context.slice(-50)}-${noteCategory || 'general'}`;
      const cacheData = {
        suggestions: newSuggestions,
        continuations: newContinuations,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
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
  const fetchAISuggestions = useCallback(async () => {
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
    if (cached) {
      console.log('Using cached note suggestions');
      setSuggestions(cached.suggestions);
      setContinuations(cached.continuations);
      setCurrentSuggestion(cached.suggestions[0] || null);
      return;
    }
    
    // Throttle API calls (reduced from 10 seconds to 2 seconds for responsiveness)
    const now = Date.now();
    if (now - lastApiCall.current < 2000) {
      console.log('⏱️ Throttling note AI request (wait 2s)');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      lastApiCall.current = now;
      setLastTriggerContext(context);
      
      const apiUrl = import.meta.env.VITE_API_URL || (
        import.meta.env.MODE === 'production' 
          ? 'https://itemize.cloud' 
          : 'http://localhost:3001'
      );
      
      const response = await axios.post<NoteSuggestionResponse>(`${apiUrl}/api/note-suggestions`, {
        context,
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
        
        // Temporary fallback for testing - add mock suggestions if API returns empty
        let finalSuggestions = suggestions;
        let finalContinuations = continuations;
        
        if (suggestions.length === 0 && continuations.length === 0) {
          console.log('🎭 Using mock suggestions for testing');
          finalSuggestions = [
            ' and provides an intuitive interface for task management.',
            ' that helps users organize their work efficiently.',
            ' designed for seamless collaboration and productivity.',
            ' with a focus on simplicity and user experience.'
          ];
          finalContinuations = [
            ' It features drag-and-drop functionality and real-time updates.',
            ' The app supports both individual and team workflows.'
          ];
        }
        
        setSuggestions(finalSuggestions);
        setContinuations(finalContinuations);
        setCurrentSuggestion(finalSuggestions[0] || finalContinuations[0] || null);
        
        // Cache the results
        cacheSuggestions(context, finalSuggestions, finalContinuations);
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

  // Get suggestion for current typing position (GitHub Copilot style)
  const getSuggestionForInput = useCallback((content: string, cursorPosition: number): string | null => {
    console.log('🎯 Note getSuggestionForInput:', { 
      enabled, 
      contentLength: content.length, 
      cursorPosition, 
      suggestionsCount: suggestions.length,
      continuationsCount: continuations.length 
    });
    
    if (!enabled || !content || cursorPosition < content.length) return null;
    
    // GitHub Copilot style: suggest continuation from current position
    const allSuggestions = [...suggestions, ...continuations];
    
    // Return first available suggestion if we have any
    if (allSuggestions.length > 0) {
      const suggestion = allSuggestions[0];
      console.log('💡 Note autocomplete suggestion:', suggestion);
      return suggestion;
    }
    
    return null;
  }, [enabled, suggestions, continuations]);

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