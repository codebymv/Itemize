import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Local storage key
const LOCAL_STORAGE_KEY = 'itemize-ai-suggest-enabled';

// Types
interface AISuggestContextType {
  aiEnabled: boolean;
  setAiEnabled: (enabled: boolean) => void;
}

// Create context with default values
const AISuggestContext = createContext<AISuggestContextType>({
  aiEnabled: true,
  setAiEnabled: () => {}
});

// Provider component
export const AISuggestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize from localStorage if available
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    try {
      const savedValue = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedValue ? JSON.parse(savedValue) : true;
    } catch (e) {
      return true;
    }
  });

  // Update localStorage when state changes
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(aiEnabled));
  }, [aiEnabled]);

  return (
    <AISuggestContext.Provider value={{ aiEnabled, setAiEnabled }}>
      {children}
    </AISuggestContext.Provider>
  );
};

// Custom hook to use the context
export const useAISuggest = () => useContext(AISuggestContext);
