import { useState, useEffect, useRef, useCallback } from 'react';

interface ScrollVelocityOptions {
  threshold?: number;
  cooldown?: number;
}

interface ScrollVelocityReturn {
  velocity: number;
  isFastScrolling: boolean;
  lastScrollTime: number;
}

/**
 * Detects how fast the user is scrolling.
 * Useful for adjusting animations based on scroll velocity.
 * 
 * @param threshold - Velocity threshold to consider "fast" (default: 15)
 * @param cooldown - Time in ms to stay in "fast" state after scrolling stops (default: 150)
 */
export function useScrollVelocity(
  options: ScrollVelocityOptions = {}
): ScrollVelocityReturn {
  const { threshold = 15, cooldown = 150 } = options;
  const [velocity, setVelocity] = useState(0);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const [lastScrollTime, setLastScrollTime] = useState(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastScrollYRef = useRef(0);
  const lastTsRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    
    const handleScroll = () => {
      const now = performance.now();
      const scrollY = window.scrollY;
      
      if (lastTsRef.current > 0) {
        const deltaTime = now - lastTsRef.current;
        const deltaY = Math.abs(scrollY - lastScrollYRef.current);
        const currentVelocity = deltaY / deltaTime;
        
        setVelocity(currentVelocity);
        
        if (currentVelocity > threshold) {
          setIsFastScrolling(true);
          setLastScrollTime(now);
        }
      }
      
      lastScrollYRef.current = scrollY;
      lastTsRef.current = now;
      
      // Clear previous timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Reset fast scrolling state after cooldown
      scrollTimeoutRef.current = setTimeout(() => {
        setIsFastScrolling(false);
        setVelocity(0);
      }, cooldown);
      
      rafId = requestAnimationFrame(handleScroll);
    };

    rafId = requestAnimationFrame(handleScroll);

    return () => {
      cancelAnimationFrame(rafId);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [threshold, cooldown]);

  return { velocity, isFastScrolling, lastScrollTime };
}

/**
 * Returns whether to skip animation delays based on scroll velocity
 */
export function shouldSkipDelays(isFastScrolling: boolean): boolean {
  return isFastScrolling;
}

/**
 * Returns appropriate animation duration based on scroll velocity
 */
export function getAnimationDuration(isFastScrolling: boolean): string {
  return isFastScrolling ? '0ms' : '700ms';
}