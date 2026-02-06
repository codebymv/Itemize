import { useState, useEffect, useCallback, useRef } from 'react';

interface UseScrollSpyOptions {
  sectionIds: string[];
  offset?: number;
  throttleMs?: number;
}

/**
 * Hook to detect which section is currently in view
 * Returns the ID of the active section based on scroll position
 */
export function useScrollSpy({ sectionIds, offset = 100, throttleMs = 100 }: UseScrollSpyOptions): string | null {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const lastUpdate = useRef(0);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdate.current < throttleMs) {
      // Schedule a trailing-edge call so the final position is always captured
      if (trailingRef.current) clearTimeout(trailingRef.current);
      trailingRef.current = setTimeout(() => {
        lastUpdate.current = Date.now();
        doUpdate();
      }, throttleMs);
      return;
    }
    lastUpdate.current = now;
    doUpdate();

    function doUpdate() {
      let currentSection: string | null = null;
      let minDistance = Infinity;

      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - offset);

        if (rect.top <= offset && rect.bottom > 0) {
          if (distance < minDistance) {
            minDistance = distance;
            currentSection = id;
          }
        }
      }

      // If no section is at/above offset, use the first visible one
      if (!currentSection) {
        for (const id of sectionIds) {
          const element = document.getElementById(id);
          if (!element) continue;

          const rect = element.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            currentSection = id;
            break;
          }
        }
      }

      setActiveSection(currentSection);
    }
  }, [sectionIds, offset, throttleMs]);

  useEffect(() => {
    // Initial check
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (trailingRef.current) clearTimeout(trailingRef.current);
    };
  }, [handleScroll]);

  return activeSection;
}

/**
 * Smooth scroll to a section by ID
 */
export function scrollToSection(id: string, offset: number = 80) {
  const element = document.getElementById(id);
  if (!element) return;

  const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
  const offsetPosition = elementPosition - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });
}
