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
    // Debug input state
    console.log('getSuggestionForInput called with:', { 
      input, 
      enabled, 
      suggestionCount: suggestions.length, 
      currentSuggestion,
      listTitle
    });
    
    if (!enabled) {
      console.log('AI suggestions not enabled');
      return null;
    }
    
    if (!input.trim()) {
      console.log('Input is empty');
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
        console.log('Using API suggestion (prefix match):', matchingSuggestions[0]);
        return matchingSuggestions[0];
      }
      
      // If no prefix matches, look for containing matches
      const containsMatches = suggestions.filter(suggestion => 
        suggestion.toLowerCase().includes(inputLower) && 
        suggestion.toLowerCase() !== inputLower
      );
      
      if (containsMatches.length > 0) {
        console.log('Using API suggestion (contains match):', containsMatches[0]);
        return containsMatches[0];
      }
    }
    
    // If no API suggestions or no matches, generate context-aware suggestions
    console.log('Generating context-aware suggestions based on list title:', listTitle);
    
    // Generate context-specific suggestions based on the list title
    let contextSuggestions: string[] = [];
    
    // Add context-specific suggestions based on list title
    const titleLower = listTitle.toLowerCase();
    
    if (titleLower.includes('christmas') || titleLower.includes('holiday')) {
      contextSuggestions = [
        'ornaments', 'lights', 'tree', 'candy canes', 'wreath',
        'stockings', 'presents', 'cookies', 'garland', 'mistletoe',
        'gift wrap', 'cards', 'tinsel', 'santa figure', 'reindeer decoration'
      ];
    } else if (titleLower.includes('grocery') || titleLower.includes('shopping')) {
      contextSuggestions = [
        'milk', 'eggs', 'bread', 'coffee', 'sugar',
        'apples', 'bananas', 'oranges', 'chicken', 'beef',
        'pasta', 'rice', 'cereal', 'cheese', 'yogurt'
      ];
    } else if (titleLower.includes('todo') || titleLower.includes('task')) {
      contextSuggestions = [
        'send email', 'call client', 'schedule meeting', 'finish report',
        'review document', 'update website', 'pay bills', 'order supplies',
        'backup data', 'clean office'
      ];
    } else {
      // Generic suggestions as fallback
      contextSuggestions = [
        'milk', 'eggs', 'bread', 'coffee', 'sugar',
        'apples', 'bananas', 'paper towels', 'toilet paper',
        'notebook', 'pen', 'batteries', 'water'
      ];
      
      // Also add some of the existing items as context clues
      if (existingItems.length > 0) {
        // Use existing items to infer the context
        const existingWords = existingItems.flatMap(item => 
          item.toLowerCase().split(' ')
        );
        
        if (existingWords.some(w => ['cake', 'sugar', 'flour', 'baking'].includes(w))) {
          contextSuggestions = [
            'flour', 'sugar', 'eggs', 'butter', 'vanilla extract',
            'baking powder', 'chocolate chips', 'frosting', 'cake pan',
            'measuring cups', 'mixing bowl'
          ];
        } else if (existingWords.some(w => ['coding', 'program', 'software', 'bug'].includes(w))) {
          contextSuggestions = [
            'fix bug', 'update documentation', 'refactor code',
            'write tests', 'deploy to production', 'code review',
            'optimize performance', 'add feature'
          ];
        }
      }
    }
    
    // Look for matches in context-specific suggestions
    const inputLower = input.toLowerCase().trim();
    
    // Try exact prefix match first
    for (const suggestion of contextSuggestions) {
      if (suggestion.toLowerCase().startsWith(inputLower) && 
          suggestion.toLowerCase() !== inputLower) {
        console.log('Using contextual suggestion (prefix match):', suggestion);
        return suggestion;
      }
    }
    
    // If no exact prefix match, try contains match
    for (const suggestion of contextSuggestions) {
      if (suggestion.toLowerCase().includes(inputLower) && 
          suggestion.toLowerCase() !== inputLower) {
        console.log('Using contextual suggestion (contains match):', suggestion);
        return suggestion;
      }
    }
    
    // If we still don't have a match, just return a relevant suggestion based on first character
    if (inputLower.length > 0) {
      const firstChar = inputLower[0];
      for (const suggestion of contextSuggestions) {
        if (suggestion.toLowerCase().includes(firstChar)) {
          console.log('Using contextual suggestion (first char match):', suggestion);
          return suggestion;
        }
      }
    }
    
    // We've already handled all matching algorithms above
    // No need for additional matching code here
    
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
    // If backend API provided suggestions, use those first
    if (suggestions.length > 0) {
      return suggestions[0];
    }
    
    // Otherwise, generate context-specific suggestions based on the list title
    const titleLower = listTitle.toLowerCase();
    let contextualSuggestions: string[] = [];
    
    // Add suggestions based on list title keywords
    if (titleLower.includes('christmas') || titleLower.includes('holiday')) {
      contextualSuggestions = [
        'ornaments', 'lights', 'tree', 'candy canes', 'garland',
        'stockings', 'presents', 'cookies', 'wreath', 'mistletoe'
      ];
    } else if (titleLower.includes('grocery') || titleLower.includes('shopping')) {
      contextualSuggestions = [
        'milk', 'eggs', 'bread', 'coffee', 'sugar',
        'apples', 'bananas', 'chicken', 'pasta', 'rice'
      ];
    } else if (titleLower.includes('todo') || titleLower.includes('task')) {
      contextualSuggestions = [
        'send email', 'call client', 'schedule meeting', 'finish report',
        'write documentation', 'update website', 'pay bills'
      ];
    } else {
      // Default suggestions based on common list items
      contextualSuggestions = [
        'important note', 'follow up', 'check status',
        'review document', 'schedule appointment', 'buy supplies'
      ];
    }
    
    // Also infer context from existing items
    if (existingItems.length > 0) {
      const existingWords = existingItems.flatMap(item => 
        item.toLowerCase().split(' ')
      );
      
      if (existingWords.some(w => ['cake', 'sugar', 'flour', 'baking'].includes(w))) {
        contextualSuggestions = [
          'flour', 'sugar', 'eggs', 'butter', 'vanilla extract',
          'baking powder', 'chocolate chips', 'frosting'
        ];
      } else if (existingWords.some(w => ['coding', 'program', 'software', 'bug'].includes(w))) {
        contextualSuggestions = [
          'fix bug', 'update documentation', 'refactor code',
          'write tests', 'deploy to production', 'code review'
        ];
      } else if (existingWords.some(w => ['milk', 'eggs', 'bread'].includes(w))) {
        contextualSuggestions = [
          'cheese', 'yogurt', 'butter', 'cereal', 'coffee',
          'orange juice', 'apples', 'bananas'
        ];
      } else if (existingWords.some(w => ['books', 'read', 'novel', 'author'].includes(w))) {
        contextualSuggestions = [
          'fiction novels', 'biography', 'science fiction',
          'mystery', 'poetry', 'history books', 'magazines'
        ];
      }
    }
    
    // Select a random suggestion from the list
    if (contextualSuggestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * contextualSuggestions.length);
      return contextualSuggestions[randomIndex];
    }
    
    return null;
  }, [listTitle, existingItems, suggestions]);
  
  // Generate an initial suggestion when the hook mounts
  useEffect(() => {
    if (enabled && !currentSuggestion) {
      // Try to use a generated suggestion immediately
      const initialSuggestion = generateContextSuggestion();
      if (initialSuggestion) {
        setCurrentSuggestion(initialSuggestion);
      } else {
        // Otherwise fetch from API
        debouncedFetchSuggestions();
      }
    }
  }, [enabled, currentSuggestion, generateContextSuggestion, debouncedFetchSuggestions]);
  
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
