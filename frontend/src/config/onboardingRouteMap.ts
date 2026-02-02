/**
 * Route to Onboarding Key Mapping
 * 
 * Maps routes to their onboarding feature keys, handling:
 * - Collapsible sidebar groups (any child shows parent's onboarding)
 * - Mobile redirects (e.g., /contents shows canvas onboarding)
 * - Direct route mappings
 */

// Define sidebar groups with their parent onboarding key and child routes
const SIDEBAR_GROUPS: Record<string, { onboardingKey: string; routes: string[] }> = {
  workspace: {
    onboardingKey: 'canvas',
    routes: ['/canvas', '/contents', '/shared-items'],
  },
  salesPayments: {
    onboardingKey: 'invoices',
    routes: ['/invoices', '/estimates', '/recurring-invoices', '/invoices/payments', '/products'],
  },
  campaigns: {
    onboardingKey: 'campaigns',
    routes: ['/campaigns', '/segments', '/email-templates', '/sms-templates'],
  },
  pagesForms: {
    onboardingKey: 'pages',
    routes: ['/pages', '/forms'],
  },
  communications: {
    onboardingKey: 'inbox',
    routes: ['/inbox', '/chat-widget', '/social'],
  },
  scheduling: {
    onboardingKey: 'calendars',
    routes: ['/calendars', '/bookings', '/calendar-integrations'],
  },
  reputation: {
    onboardingKey: 'reputation',
    routes: ['/reviews', '/review-requests', '/review-widgets'],
  },
};

// Direct route mappings (non-grouped routes)
const DIRECT_ROUTE_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/contacts': 'contacts',
  '/pipelines': 'pipelines',
  '/automations': 'automations',
};

/**
 * Get the onboarding key for a given route path
 * 
 * @param pathname - The current route pathname (e.g., '/recurring-invoices')
 * @returns The onboarding feature key to use, or null if no onboarding exists
 */
export function getOnboardingKeyForRoute(pathname: string): string | null {
  // Normalize pathname (remove trailing slash, handle query params)
  const normalizedPath = pathname.split('?')[0].replace(/\/$/, '') || '/';

  // Check direct route mappings first
  if (DIRECT_ROUTE_MAP[normalizedPath]) {
    return DIRECT_ROUTE_MAP[normalizedPath];
  }

  // Check sidebar groups
  for (const group of Object.values(SIDEBAR_GROUPS)) {
    if (group.routes.some(route => normalizedPath === route || normalizedPath.startsWith(route + '/'))) {
      return group.onboardingKey;
    }
  }

  return null;
}

/**
 * Get all routes that share the same onboarding key
 * Useful for knowing what routes are "covered" by a single onboarding
 * 
 * @param onboardingKey - The onboarding feature key
 * @returns Array of route paths that use this onboarding
 */
export function getRoutesForOnboardingKey(onboardingKey: string): string[] {
  // Check direct routes
  const directRoutes = Object.entries(DIRECT_ROUTE_MAP)
    .filter(([_, key]) => key === onboardingKey)
    .map(([route]) => route);

  // Check groups
  for (const group of Object.values(SIDEBAR_GROUPS)) {
    if (group.onboardingKey === onboardingKey) {
      return [...directRoutes, ...group.routes];
    }
  }

  return directRoutes;
}

/**
 * Check if a route belongs to a collapsible group
 * 
 * @param pathname - The current route pathname
 * @returns True if the route is part of a collapsible sidebar group
 */
export function isGroupedRoute(pathname: string): boolean {
  const normalizedPath = pathname.split('?')[0].replace(/\/$/, '') || '/';
  
  for (const group of Object.values(SIDEBAR_GROUPS)) {
    if (group.routes.some(route => normalizedPath === route || normalizedPath.startsWith(route + '/'))) {
      return true;
    }
  }
  
  return false;
}

export { SIDEBAR_GROUPS, DIRECT_ROUTE_MAP };
