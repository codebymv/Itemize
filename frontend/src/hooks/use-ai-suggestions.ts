import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '@/lib/storage';
import logger from '@/lib/logger';
import { fetchListSuggestions } from '@/services/aiGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { buildSuggestionCacheKey } from './aiSuggestionCache';

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
  const itemsKey = JSON.stringify(existingItems);
  const stableItems = useMemo(() => JSON.parse(itemsKey) as string[], [itemsKey]);
  
  // For debouncing and throttling
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTime = useRef<number>(0);
  const requestSequence = useRef(0);
  
  const { isAuthenticated } = useAuth();

  // Check if we have cached suggestions for this list
  const getCachedSuggestions = useCallback(() => {
    try {
      const cacheKey = buildSuggestionCacheKey('list', `${listTitle}\n${itemsKey}`);
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
  }, [listTitle, itemsKey]);
  
  // Save suggestions to cache
  const cacheSuggestions = useCallback((newSuggestions: string[]) => {
    try {
      if (!listTitle || !newSuggestions.length) return;
      
      const cacheKey = buildSuggestionCacheKey('list', `${listTitle}\n${itemsKey}`);
      const cacheData = {
        suggestions: newSuggestions,
        timestamp: Date.now()
      };
      
      storage.setJson(cacheKey, cacheData);
    } catch (err) {
      logger.warn('Failed to cache suggestions:', err);
    }
  }, [listTitle, itemsKey]);

  // Fetch suggestions from API
  const fetchSuggestions = useCallback(async () => {
    // Cancel any pending debounced calls
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const requestId = ++requestSequence.current;

    // Only fetch if enabled and we have at least one item
    if (!enabled || !listTitle || stableItems.length === 0) {
      setSuggestions([]);
      setCurrentSuggestion(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!isAuthenticated) {
      setError('You must be logged in to use AI suggestions');
      return;
    }
    
    // Check if we have cached suggestions first
    const cachedSuggestions = getCachedSuggestions();
    if (cachedSuggestions) {
      if (requestId !== requestSequence.current) return;
      logger.debug('ai-suggestions', 'Using cached suggestions for:', listTitle);
      setSuggestions(cachedSuggestions);
      setCurrentSuggestion(cachedSuggestions[0] || null);
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
      
      const response = await fetchListSuggestions(
        listTitle,
        stableItems.filter(item => item.trim() !== ''),
      );

      if (requestId !== requestSequence.current) return;
      if (response.error) {
        setSuggestions([]);
        setCurrentSuggestion(null);
        setError(response.error);
        return;
      }

      if (response.suggestions.length > 0) {
        const newSuggestions = response.suggestions;
        setSuggestions(newSuggestions);
        setCurrentSuggestion(newSuggestions[0]);
        setCurrentIndex(0);
        
        // Cache the suggestions
        cacheSuggestions(newSuggestions);
      } else {
        setSuggestions([]);
        setCurrentSuggestion(null);
      }
    } catch (err: unknown) {
      if (requestId !== requestSequence.current) return;
      logger.error('Failed to fetch AI suggestions:', err);
      
      // Handle auth errors gracefully
      if (getApiStatus(err) === 401) {
        setError('Session expired. Please log in again to use AI suggestions.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      }
      
      // No hardcoded fallback suggestions - keep clean UI
      setSuggestions([]);
      setCurrentSuggestion(null);
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [enabled, listTitle, stableItems, isAuthenticated, getCachedSuggestions, cacheSuggestions]);

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

  // Get next suggestion in the list
  const getNextSuggestion = useCallback(() => {
    if (suggestions.length === 0) return null;
    
    const nextIndex = (currentIndex + 1) % suggestions.length;
    setCurrentIndex(nextIndex);
    const nextSuggestion = suggestions[nextIndex];
    setCurrentSuggestion(nextSuggestion);
    
    return nextSuggestion;
  }, [suggestions, currentIndex]);

  const clearSuggestions = useCallback(() => {
    requestSequence.current += 1;
    setSuggestions([]);
    setCurrentSuggestion(null);
    setCurrentIndex(0);
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    requestSequence.current += 1;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setSuggestions([]);
    setCurrentSuggestion(null);
    setCurrentIndex(0);
    setError(null);
    setIsLoading(false);

    if (enabled && listTitle && stableItems.length > 0) {
      debouncedFetchSuggestions();
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      requestSequence.current += 1;
    };
  }, [enabled, listTitle, itemsKey, stableItems.length, debouncedFetchSuggestions]);
  
  return {
    currentSuggestion,
    suggestions,
    isLoading,
    error,
    debouncedFetchSuggestions,
    fetchSuggestions,
    getSuggestionForInput,
    getNextSuggestion,
    clearSuggestions,
  };
};

export default useAISuggestions;
