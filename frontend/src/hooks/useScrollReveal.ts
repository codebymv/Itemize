import { useEffect, useRef, useState, useCallback } from 'react';

interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook that uses IntersectionObserver to detect when an element enters the viewport.
 * Returns a ref to attach to the element and a boolean indicating visibility.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollRevealOptions = {}
) {
  const { threshold = 0.15, rootMargin = '0px 0px -60px 0px', triggerOnce = true } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}

/**
 * Wrapper component-style hook that returns className strings for reveal animations.
 * Usage: const { ref, className } = useRevealClass('fade-up');
 */
export function useRevealClass<T extends HTMLElement = HTMLDivElement>(
  variant: 'fade-up' | 'fade-down' | 'fade-left' | 'fade-right' | 'fade' | 'scale' = 'fade-up',
  options: UseScrollRevealOptions & { delay?: number } = {}
) {
  const { delay = 0, ...revealOptions } = options;
  const { ref, isVisible } = useScrollReveal<T>(revealOptions);

  const baseStyles: Record<string, string> = {
    'fade-up': 'translate-y-8 opacity-0',
    'fade-down': '-translate-y-8 opacity-0',
    'fade-left': 'translate-x-8 opacity-0',
    'fade-right': '-translate-x-8 opacity-0',
    'fade': 'opacity-0',
    'scale': 'scale-95 opacity-0',
  };

  const visibleStyle = 'translate-y-0 translate-x-0 scale-100 opacity-100';
  const transitionStyle = 'transition-all duration-700 ease-out';

  const className = [
    transitionStyle,
    isVisible ? visibleStyle : baseStyles[variant],
  ].join(' ');

  const style = delay > 0 ? { transitionDelay: `${delay}ms` } : undefined;

  return { ref, className, style, isVisible };
}
