/**
 * Logger utility that strips debug logs in production builds.
 * Always logs errors regardless of environment.
 */

const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  /**
   * Log debug information (only in development)
   */
  log: (...args: LogArgs): void => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Log info (only in development) - alias for log
   */
  info: (...args: LogArgs): void => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Log warnings (only in development)
   */
  warn: (...args: LogArgs): void => {
    if (isDev) {
      console.warn(...args);
    }
  },

  /**
   * Log errors (always, in all environments)
   */
  error: (...args: LogArgs): void => {
    console.error(...args);
  },

  /**
   * Log debug information with a category prefix (only in development)
   */
  debug: (category: string, ...args: LogArgs): void => {
    if (isDev) {
      console.log(`[${category}]`, ...args);
    }
  },

  /**
   * Log with timestamp (only in development)
   */
  time: (label: string, ...args: LogArgs): void => {
    if (isDev) {
      console.log(`[${new Date().toISOString()}] ${label}:`, ...args);
    }
  },
};

export default logger;
