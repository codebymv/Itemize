import { createContext, useContext, ReactNode } from 'react';

interface ScrollVelocityContextType {
  isFastScrolling: boolean;
}

const ScrollVelocityContext = createContext<ScrollVelocityContextType>({
  isFastScrolling: false,
});

export function ScrollVelocityProvider({ children }: { children: ReactNode }) {
  return (
    <ScrollVelocityContext.Provider value={{ isFastScrolling: false }}>
      {children}
    </ScrollVelocityContext.Provider>
  );
}

export function useScrollVelocityContext() {
  return useContext(ScrollVelocityContext);
}