import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { storage } from '@/lib/storage';
import { useAuthState } from '@/contexts/AuthContext';
import { AI_SUGGEST_STORAGE_KEY, aiSuggestStorageKey } from './aiSuggestPreference';

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
  const { currentUser } = useAuthState();
  const scopedStorageKey = useMemo(() => aiSuggestStorageKey(currentUser?.uid), [currentUser?.uid]);
  const [aiEnabled, setAiEnabledState] = useState(true);

  useEffect(() => {
    try {
      const scopedValue = storage.getItem(scopedStorageKey);
      const legacyValue = storage.getItem(AI_SUGGEST_STORAGE_KEY);
      const nextValue = scopedValue ?? legacyValue;
      const enabled = nextValue === null ? true : Boolean(JSON.parse(nextValue));
      setAiEnabledState(enabled);
      if (scopedValue === null && legacyValue !== null) {
        storage.setItem(scopedStorageKey, JSON.stringify(enabled));
      }
    } catch {
      setAiEnabledState(true);
    }
  }, [scopedStorageKey]);

  const setAiEnabled = useCallback((enabled: boolean) => {
    setAiEnabledState(enabled);
    storage.setItem(scopedStorageKey, JSON.stringify(enabled));
  }, [scopedStorageKey]);

  return (
    <AISuggestContext.Provider value={{ aiEnabled, setAiEnabled }}>
      {children}
    </AISuggestContext.Provider>
  );
};

// Custom hook to use the context
export const useAISuggest = () => useContext(AISuggestContext);
