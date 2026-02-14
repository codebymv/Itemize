export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Debounced request helpers for API calls
let debouncedGetTimeout: ReturnType<typeof setTimeout> | null = null;
let debouncedPostTimeout: ReturnType<typeof setTimeout> | null = null;

export async function debouncedGet(url: string, config?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (debouncedGetTimeout) {
      clearTimeout(debouncedGetTimeout);
    }
    
    debouncedGetTimeout = setTimeout(async () => {
      try {
        const api = (await import('./api')).default;
        const result = await api.get(url, config);
        debouncedGetTimeout = null;
        resolve(result);
      } catch (error) {
        debouncedGetTimeout = null;
        reject(error);
      }
    }, 300);
  });
}

export async function debouncedPost(url: string, data?: any, config?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (debouncedPostTimeout) {
      clearTimeout(debouncedPostTimeout);
    }
    
    debouncedPostTimeout = setTimeout(async () => {
      try {
        const api = (await import('./api')).default;
        const result = await api.post(url, data, config);
        debouncedPostTimeout = null;
        resolve(result);
      } catch (error) {
        debouncedPostTimeout = null;
        reject(error);
      }
    }, 300);
  });
}