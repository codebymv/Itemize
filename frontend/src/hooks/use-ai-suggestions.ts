import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Import auth context

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
  
  // For debouncing and throttling
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTime = useRef<number>(0);
  
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
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        const { suggestions, timestamp } = JSON.parse(cachedData);
        // Check if cache is still valid
        if (Date.now() - timestamp < CACHE_DURATION && suggestions && suggestions.length > 0) {
          return suggestions;
        }
      }
    } catch (err) {
      console.warn('Failed to read suggestion cache:', err);
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
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (err) {
      console.warn('Failed to cache suggestions:', err);
    }
  }, [listTitle, existingItems]);

  // Fetch suggestions from API
  const fetchSuggestions = useCallback(async () => {
    // Cancel any pending debounced calls
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    
    // Only fetch if enabled and we have at least one item
    if (!enabled || !listTitle || existingItems.length === 0) {
      setSuggestions([]);
      setCurrentSuggestion(null);
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
      console.log('Using cached suggestions for:', listTitle);
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
      console.log(`Throttling API call for ${delayTime}ms`);
      
      debounceTimer.current = setTimeout(() => {
        fetchSuggestions();
      }, delayTime);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      lastRequestTime.current = Date.now();
      
      // Get the API URL from environment or use default
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const response = await axios.post<SuggestionResponse>(`${apiUrl}/api/suggestions`, {
        listTitle,
        existingItems: existingItems.filter(item => item.trim() !== '') // Filter out empty items
      }, {
        withCredentials: true, // Include credentials for authenticated requests
        headers: {
          'Authorization': `Bearer ${token}` // Include the JWT token in the header
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
      console.error('Failed to fetch AI suggestions:', err);
      
      // Handle auth errors gracefully
      if (err?.response?.status === 401) {
        setError('Session expired. Please log in again to use AI suggestions.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      }
      
      // Provide some default suggestions for common list types
      if (listTitle.toLowerCase().includes('shop') || listTitle.toLowerCase().includes('grocery')) {
        setSuggestions(['milk', 'eggs', 'bread', 'cheese', 'apples']);
        setCurrentSuggestion('milk');
      } else {
        setSuggestions([]);
        setCurrentSuggestion(null);
      }
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
    if (!enabled || !input.trim() || suggestions.length === 0) {
      return null;
    }

    const inputLower = input.toLowerCase().trim();
    
    // First try to find an exact prefix match (standard autocomplete behavior)
    const exactMatch = suggestions.find(suggestion => 
      suggestion.toLowerCase().startsWith(inputLower) && 
      suggestion.toLowerCase() !== inputLower
    );
    
    if (exactMatch) return exactMatch;
    
    // If no exact match found and input is at least 2 characters, try fuzzy matching
    if (inputLower.length >= 2) {
      // Try to find a suggestion that contains the input characters in sequence
      const fuzzyMatch = suggestions.find(suggestion => {
        // Skip if it's exactly the same as input
        if (suggestion.toLowerCase() === inputLower) return false;
        
        // Check if all characters from input exist in sequence in the suggestion
        let index = 0;
        for (const char of inputLower) {
          index = suggestion.toLowerCase().indexOf(char, index);
          if (index === -1) return false;
          index += 1;
        }
        return true;
      });
      
      if (fuzzyMatch) return fuzzyMatch;
      
      // As a last resort, check if any suggestion contains this input as a substring
      const substringMatch = suggestions.find(suggestion => 
        suggestion.toLowerCase().includes(inputLower) && 
        suggestion.toLowerCase() !== inputLower
      );
      
      return substringMatch || null;
    }
    
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

  return {
    currentSuggestion,
    suggestions,
    isLoading,
    error,
    debouncedFetchSuggestions,
    fetchSuggestions,
    getSuggestionForInput,
    acceptSuggestion,
    getNextSuggestion
  };
};

export default useAISuggestions;
