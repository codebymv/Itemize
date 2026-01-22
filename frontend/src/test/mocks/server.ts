/**
 * MSW Server Setup
 * 
 * Sets up the mock service worker for Node.js environment (tests).
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create the mock server
export const server = setupServer(...handlers);

// Export handlers for custom test configurations
export { handlers };
