import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounce a value - useful for search inputs
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttle a callback function
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef(0);
  const timeout = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args: unknown[]) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall.current;

      if (timeSinceLastCall >= delay) {
        lastCall.current = now;
        callback(...args);
      } else {
        if (timeout.current) {
          clearTimeout(timeout.current);
        }
        timeout.current = setTimeout(() => {
          lastCall.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastCall);
      }
    }) as T,
    [callback, delay]
  );
}

/**
 * Intersection observer hook for lazy loading
 */
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLDivElement>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options]);

  return [ref, isIntersecting];
}

/**
 * Virtual list hook for rendering large lists efficiently
 */
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 3
) {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1).map((item, index) => ({
    item,
    index: startIndex + index,
    style: {
      position: 'absolute' as const,
      top: (startIndex + index) * itemHeight,
      height: itemHeight,
      left: 0,
      right: 0,
    },
  }));

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    onScroll,
    containerStyle: {
      height: containerHeight,
      overflow: 'auto' as const,
      position: 'relative' as const,
    },
    innerStyle: {
      height: totalHeight,
      position: 'relative' as const,
    },
  };
}

/**
 * Measure render time for performance debugging
 */
export function useRenderTime(componentName: string) {
  const startTime = useRef(performance.now());

  useEffect(() => {
    const endTime = performance.now();
    const duration = endTime - startTime.current;
    
    if (duration > 16) { // More than one frame (60fps = ~16ms)
      console.warn(`[Performance] ${componentName} took ${duration.toFixed(2)}ms to render`);
    }
  });
}

/**
 * Prefetch data when element comes into view
 */
export function usePrefetch(
  fetchFn: () => Promise<unknown>,
  options: { threshold?: number } = {}
) {
  const [ref, isIntersecting] = useIntersectionObserver({
    threshold: options.threshold || 0.1,
    rootMargin: '100px',
  });
  const hasFetched = useRef(false);

  useEffect(() => {
    if (isIntersecting && !hasFetched.current) {
      hasFetched.current = true;
      fetchFn().catch(console.error);
    }
  }, [isIntersecting, fetchFn]);

  return ref;
}

/**
 * Cache hook for storing computed values
 */
export function useCache<T>(key: string, computeFn: () => T, deps: unknown[]): T {
  const cache = useRef<Map<string, T>>(new Map());
  const depsRef = useRef<unknown[]>(deps);

  // Check if deps changed
  const depsChanged = deps.some((dep, i) => dep !== depsRef.current[i]);
  
  if (depsChanged || !cache.current.has(key)) {
    cache.current.set(key, computeFn());
    depsRef.current = deps;
  }

  return cache.current.get(key)!;
}
