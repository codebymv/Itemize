import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { storage } from '@/lib/storage';
import logger from '@/lib/logger';

// Cache duration in milliseconds (30 minutes)
const CACHE_DURATION = 30 * 60 * 1000;

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;

// Minimum time between API requests in milliseconds (2 seconds)
const API_REQUEST_THROTTLE = 2000;

interface UseSuggestionsOptions {
  enabled: boolean;
  listTitle: string;
  existingItems: string[];
}

interface SuggestionResponse {
  suggestions: string[];
  cached?: boolean;
  error?: string;
}

/**
 * Custom hook for AI-powered list item suggestions
 */
export const useAISuggestions = ({ enabled, listTitle, existingItems }: UseSuggestionsOptions) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize the items string to prevent unnecessary re-runs
  const itemsKey = useMemo(() => existingItems.join('|'), [existingItems.join('|')]);

  // Track the last content we had suggestions for to prevent unnecessary clearing
  const lastSuggestedContent = useRef<string>('');
  
  // For debouncing and throttling
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTime = useRef<number>(0);
  const lastInitializedKey = useRef<string>('');
  
  const { token } = useAuth(); // Get the authentication token

  // Reset current suggestion when input is cleared or feature is disabled
  useEffect(() => {
    if (!enabled) {
      setCurrentSuggestion(null);
    }
  }, [enabled]);

  // Check if we have cached suggestions for this list
  const getCachedSuggestions = useCallback(() => {
    try {
      const cacheKey = `itemize-suggestions-${listTitle}-${existingItems.join(',')}`;
      const cachedData = storage.getJson<{ suggestions: string[]; timestamp: number }>(cacheKey);
      
      if (cachedData) {
        const { suggestions, timestamp } = cachedData;
        // Check if cache is still valid
        if (Date.now() - timestamp < CACHE_DURATION && suggestions && suggestions.length > 0) {
          return suggestions;
        }
        }
      } catch (err) {
        logger.warn('Failed to read suggestion cache:', err);
      }
      return null;
  }, [listTitle, existingItems]);
  
  // Save suggestions to cache
  const cacheSuggestions = useCallback((newSuggestions: string[]) => {
    try {
      if (!listTitle || !newSuggestions.length) return;
      
      const cacheKey = `itemize-suggestions-${listTitle}-${existingItems.join(',')}`;
      const cacheData = {
        suggestions: newSuggestions,
        timestamp: Date.now()
      };
      
      storage.setJson(cacheKey, cacheData);
    } catch (err) {
      logger.warn('Failed to cache suggestions:', err);
    }
  }, [listTitle, existingItems]);

  // Fetch suggestions from API
  const fetchSuggestions = useCallback(async () => {
    // Cancel any pending debounced calls
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    const currentContentKey = `${listTitle}-${itemsKey}`;

    // Only fetch if enabled and we have at least one item
    if (!enabled || !listTitle || existingItems.length === 0) {
      // Only clear suggestions if they're not already empty to prevent unnecessary re-renders
      if (suggestions.length > 0 || currentSuggestion !== null) {
        setSuggestions([]);
        setCurrentSuggestion(null);
        lastSuggestedContent.current = '';
      }
      return;
    }

    // If we already have suggestions for this exact content, don't clear them
    if (lastSuggestedContent.current === currentContentKey && currentSuggestion !== null) {
      logger.debug('ai-suggestions', 'Skipping fetch - already have suggestions for this content');
      return;
    }

    // Don't attempt to fetch if we don't have a token
    if (!token) {
      setError('You must be logged in to use AI suggestions');
      return;
    }
    
    // Check if we have cached suggestions first
    const cachedSuggestions = getCachedSuggestions();
    if (cachedSuggestions) {
      // Only update if suggestions actually changed to prevent unnecessary re-renders
      const currentFirstSuggestion = suggestions[0];
      const cachedFirstSuggestion = cachedSuggestions[0];

      if (suggestions.length === 0 || currentFirstSuggestion !== cachedFirstSuggestion) {
        logger.debug('ai-suggestions', 'Using cached suggestions for:', listTitle);
        setSuggestions(cachedSuggestions);
        setCurrentSuggestion(cachedFirstSuggestion || null);
        lastSuggestedContent.current = currentContentKey;
      }
      setIsLoading(false);
      return;
    }
    
    // Throttle API requests to prevent excessive calls
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime.current;
    
    if (timeSinceLastRequest < API_REQUEST_THROTTLE) {
      setIsLoading(true);
      
      // Delay the call until we're past the throttle window
      const delayTime = API_REQUEST_THROTTLE - timeSinceLastRequest;
      logger.debug('ai-suggestions', `Throttling API call for ${delayTime}ms`);
      
      debounceTimer.current = setTimeout(() => {
        fetchSuggestions();
      }, delayTime);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      lastRequestTime.current = Date.now();
      
      const apiUrl = getApiUrl();
      
      const response = await axios.post<SuggestionResponse>(`${apiUrl}/api/suggestions`, {
        listTitle,
        existingItems: existingItems.filter(item => item.trim() !== '')
      }, {
        withCredentials: true,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data && response.data.suggestions && response.data.suggestions.length > 0) {
        const newSuggestions = response.data.suggestions;
        setSuggestions(newSuggestions);
        setCurrentSuggestion(newSuggestions[0]);
        setCurrentIndex(0);
        
        // Cache the suggestions
        cacheSuggestions(newSuggestions);
      } else {
        setSuggestions([]);
        setCurrentSuggestion(null);
      }
    } catch (err: any) {
      logger.error('Failed to fetch AI suggestions:', err);
      
      // Handle auth errors gracefully
      if (err?.response?.status === 401) {
        setError('Session expired. Please log in again to use AI suggestions.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      }
      
      // No hardcoded fallback suggestions - keep clean UI
      setSuggestions([]);
      setCurrentSuggestion(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, listTitle, existingItems, token, getCachedSuggestions, cacheSuggestions]);

  // Debounced fetch suggestions
  const debouncedFetchSuggestions = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    setIsLoading(true);
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions();
    }, DEBOUNCE_DELAY);
  }, [fetchSuggestions]);

  // Get a suggestion for the current input
  const getSuggestionForInput = useCallback((input: string): string | null => {
    // Debug input state (reduced logging)
    // console.log('getSuggestionForInput called with:', { 
    //   input, 
    //   enabled, 
    //   suggestionCount: suggestions.length, 
    //   currentSuggestion,
    //   listTitle
    // });
    
    if (!enabled) {
      // console.log('AI suggestions not enabled');
      return null;
    }
    
    if (!input.trim()) {
      // console.log('Input is empty');
      return null;
    }
    
    // First try to match from actual suggestions from the API
    if (suggestions.length > 0) {
      const inputLower = input.toLowerCase().trim();
      
      // Try to find suggestions that match the input prefix
      const matchingSuggestions = suggestions.filter(suggestion => 
        suggestion.toLowerCase().startsWith(inputLower) && 
        suggestion.toLowerCase() !== inputLower
      );
      
      if (matchingSuggestions.length > 0) {
        logger.debug('ai-suggestions', 'Using API suggestion (prefix match):', matchingSuggestions[0]);
        return matchingSuggestions[0];
      }
      
      // If no prefix matches, look for containing matches
      const containsMatches = suggestions.filter(suggestion => 
        suggestion.toLowerCase().includes(inputLower) && 
        suggestion.toLowerCase() !== inputLower
      );
      
      if (containsMatches.length > 0) {
        logger.debug('ai-suggestions', 'Using API suggestion (contains match):', containsMatches[0]);
        return containsMatches[0];
      }
    }
    
    // No hardcoded fallback suggestions - only use actual API suggestions
    return null;
  }, [enabled, suggestions]);

  // Accept a suggestion (returns the complete suggestion)
  const acceptSuggestion = useCallback((suggestion: string): string => {
    // Find the next suggestion and set it as current
    const nextSuggestions = suggestions
      .filter(s => s.toLowerCase() !== suggestion.toLowerCase());
      
    if (nextSuggestions.length > 0) {
      setCurrentSuggestion(nextSuggestions[0]);
    } else {
      setCurrentSuggestion(null);
    }
    
    return suggestion;
  }, [suggestions]);

  // Get next suggestion in the list
  const getNextSuggestion = useCallback(() => {
    if (suggestions.length === 0) return null;
    
    const nextIndex = (currentIndex + 1) % suggestions.length;
    setCurrentIndex(nextIndex);
    const nextSuggestion = suggestions[nextIndex];
    setCurrentSuggestion(nextSuggestion);
    
    return nextSuggestion;
  }, [suggestions, currentIndex]);

  // Generate a context-aware suggestion without needing user input
  const generateContextSuggestion = useCallback((): string | null => {
    // Only use actual API suggestions if available
    if (suggestions.length > 0) {
      return suggestions[0];
    }
    
    // No hardcoded fallback suggestions - return null for clean UI
    return null;
  }, [suggestions]);
  
  // Generate an initial suggestion when the hook mounts or when key dependencies change
  useEffect(() => {
    const currentKey = `${enabled}-${listTitle}-${itemsKey}`;

    // Only initialize if we haven't already done so for this configuration
    if (enabled && !currentSuggestion && lastInitializedKey.current !== currentKey) {
      lastInitializedKey.current = currentKey;

      // Try to use a generated suggestion immediately
      const initialSuggestion = generateContextSuggestion();
      if (initialSuggestion) {
        setCurrentSuggestion(initialSuggestion);
      } else {
        // Otherwise fetch from API
        debouncedFetchSuggestions();
      }
    }
  }, [enabled, listTitle, itemsKey]); // Use memoized itemsKey to prevent unnecessary re-runs
  
  return {
    currentSuggestion,
    suggestions,
    isLoading,
    error,
    debouncedFetchSuggestions,
    fetchSuggestions,
    getSuggestionForInput,
    acceptSuggestion,
    getNextSuggestion,
    generateContextSuggestion
  };
};

export default useAISuggestions;
