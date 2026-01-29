type JsonValue = string | number | boolean | null | Record<string, unknown> | JsonValue[];

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export const storage = {
  getItem: (key: string): string | null => {
    if (!isBrowser()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // swallow storage errors (quota/permissions)
    }
  },
  removeItem: (key: string): void => {
    if (!isBrowser()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // swallow storage errors
    }
  },
  getJson: <T extends JsonValue>(key: string): T | null => {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson: (key: string, value: JsonValue): void => {
    storage.setItem(key, JSON.stringify(value));
  },
  keys: (): string[] => {
    if (!isBrowser()) return [];
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
  removeByPrefix: (prefix: string): void => {
    if (!isBrowser()) return;
    try {
      const keysToRemove = storage.keys().filter((key) => key.startsWith(prefix));
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch {
      // swallow storage errors
    }
  },
};
